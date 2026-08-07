import type {
  ApiError,
  ExplainRequest,
  ExplainResponse,
  Provider,
  QuizRequest,
  QuizResponse,
} from "../../../shared/types";
import { ProviderError, RateLimitError, RequestError, ValidationError } from "./errors";
import { ProviderCache, explainCacheKey, quizCacheKey } from "./cache";
import { ProviderHealth } from "./health";
import { runWithFailover } from "./failover";
import { createGeminiAdapter } from "./gemini";
import { createGroqAdapter } from "./groq";
import type { ProviderAdapter } from "./providers";
import { RateLimiter } from "./rateLimit";

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  PRIMARY_PROVIDER?: string;
  ALLOWED_ORIGIN?: string;
  MAX_DAILY_REQUESTS_PER_USER?: string;
  AI_USAGE?: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-request-id",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(env: Env): Record<string, string> {
  const origin = env.ALLOWED_ORIGIN;
  if (origin && origin.trim().length > 0) {
    return { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin };
  }
  return { ...CORS_HEADERS, "Access-Control-Allow-Origin": "*" };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ValidationError || error instanceof RequestError) {
    return { code: "invalid_request", message: error.message, retryable: false };
  }
  if (error instanceof RateLimitError) {
    return { code: "rate_limit", message: error.message, retryable: false };
  }
  if (error instanceof ProviderError) {
    return { code: error.category, message: error.message, retryable: error.retryable };
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return { code: "internal", message, retryable: false };
}

function errorResponse(error: unknown): Response {
  const apiError = toApiError(error);
  return json({ error: apiError }, apiError.retryable ? 503 : 400);
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestError("Request body is not valid JSON.");
  }
}

function validateExplain(body: unknown): ExplainRequest {
  if (typeof body !== "object" || body === null) {
    throw new RequestError("Explain request must be a JSON object.");
  }
  const { question, difficulty, language, userId } = body as Record<string, unknown>;
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new RequestError("Field \"question\" is required and must be non-empty.");
  }
  if (question.trim().length > 500) {
    throw new RequestError("Field \"question\" must be 500 characters or fewer.");
  }
  if (difficulty !== "beginner" && difficulty !== "intermediate" && difficulty !== "advanced") {
    throw new RequestError(
      "Field \"difficulty\" must be one of: beginner, intermediate, advanced.",
    );
  }
  if (language !== "english" && language !== "hinglish") {
    throw new RequestError("Field \"language\" must be one of: english, hinglish.");
  }
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 128) {
    throw new RequestError("Field \"userId\" is required and must be 128 characters or fewer.");
  }
  return {
    question: question.trim(),
    difficulty,
    language,
    userId: userId.trim(),
  };
}

function validateQuiz(body: unknown): QuizRequest {
  if (typeof body !== "object" || body === null) {
    throw new RequestError("Quiz request must be a JSON object.");
  }
  const { question, difficulty, language, explanation, userId } = body as Record<string, unknown>;
  if (typeof question !== "string" || question.trim().length === 0) {
    throw new RequestError("Field \"question\" is required and must be non-empty.");
  }
  if (difficulty !== "beginner" && difficulty !== "intermediate" && difficulty !== "advanced") {
    throw new RequestError(
      "Field \"difficulty\" must be one of: beginner, intermediate, advanced.",
    );
  }
  if (language !== "english" && language !== "hinglish") {
    throw new RequestError("Field \"language\" must be one of: english, hinglish.");
  }
  if (typeof explanation !== "object" || explanation === null) {
    throw new RequestError("Field \"explanation\" is required for quiz generation.");
  }
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 128) {
    throw new RequestError("Field \"userId\" is required and must be 128 characters or fewer.");
  }
  return {
    question: question.trim(),
    difficulty,
    language,
    explanation: explanation as QuizRequest["explanation"],
    userId: userId.trim(),
  };
}

interface WaitlistRequest {
  name: string;
  email: string;
}

function validateWaitlist(body: unknown): WaitlistRequest {
  if (typeof body !== "object" || body === null) {
    throw new RequestError("Waitlist request must be a JSON object.");
  }

  const { name, email } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100) {
    throw new RequestError("Field \"name\" is required and must be 100 characters or fewer.");
  }

  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    throw new RequestError("Field \"email\" must be a valid email address.");
  }

  return { name: name.trim(), email: email.trim().toLowerCase() };
}

function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = requestId(request);
    const started = Date.now();
    const headers = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const respond = (data: unknown, status = 200): Response => json(data, status, headers);
    const respondError = (error: unknown): Response => {
      const apiError = toApiError(error);
      const res = errorResponse(error);
      const merged = new Response(res.body, {
        status: res.status,
        headers: { ...res.headers, ...headers },
      });
      console.log(
        JSON.stringify({
          event: "request.error",
          requestId: id,
          method: request.method,
          path: new URL(request.url).pathname,
          category: apiError.code,
          provider: error instanceof ProviderError ? error.provider ?? null : null,
          latencyMs: Date.now() - started,
        }),
      );
      return merged;
    };

    try {
      const url = new URL(request.url);

      if (url.pathname === "/health" && request.method === "GET") {
        return respond({
          status: "ok",
          providers: {
            gemini: Boolean(env.GEMINI_API_KEY),
            groq: Boolean(env.GROQ_API_KEY),
          },
        });
      }

      if (url.pathname === "/waitlist" && request.method === "POST") {
        const body = validateWaitlist(await parseJsonBody(request));
        return await handleWaitlist(body, env, respond, respondError);
      }

      if (url.pathname === "/explain" && request.method === "POST") {
        const body = validateExplain(await parseJsonBody(request));
        const quota = await limiter(env).check(body.userId);
        if (!quota.allowed) {
          throw new RateLimitError(
            `Daily limit reached (${quota.limit} requests). Please try again tomorrow.`,
          );
        }
        return await handleExplain(body, env, id, started, respond, respondError);
      }

      if (url.pathname === "/quiz" && request.method === "POST") {
        const body = validateQuiz(await parseJsonBody(request));
        const quota = await limiter(env).check(body.userId);
        if (!quota.allowed) {
          throw new RateLimitError(
            `Daily limit reached (${quota.limit} requests). Please try again tomorrow.`,
          );
        }
        return await handleQuiz(body, env, id, started, respond, respondError);
      }

      throw new RequestError(`Route not found: ${request.method} ${url.pathname}`);
    } catch (error) {
      return respondError(error);
    }
  },
};

let cachedLimiter: { env: Env; instance: RateLimiter } | undefined;

function limiter(env: Env): RateLimiter {
  if (cachedLimiter && cachedLimiter.env === env) return cachedLimiter.instance;
  const instance = new RateLimiter(env);
  cachedLimiter = { env, instance };
  return instance;
}

async function handleWaitlist(
  body: WaitlistRequest,
  env: Env,
  respond: (data: unknown, status?: number) => Response,
  respondError: (error: unknown) => Response,
): Promise<Response> {
  if (!env.AI_USAGE) {
    return respond({ error: { code: "internal", message: "Waitlist storage is unavailable." } }, 503);
  }

  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body.email),
    );
    const emailHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const key = `waitlist:${emailHash}`;
    const alreadyJoined = await env.AI_USAGE.get(key);

    if (!alreadyJoined) {
      await env.AI_USAGE.put(
        key,
        JSON.stringify({ name: body.name, email: body.email, createdAt: new Date().toISOString() }),
      );
    }

    return respond({ ok: true, alreadyJoined: Boolean(alreadyJoined) });
  } catch (error) {
    return respondError(error);
  }
}

async function handleExplain(
  body: ExplainRequest,
  env: Env,
  id: string,
  started: number,
  respond: (data: unknown, status?: number) => Response,
  respondError: (error: unknown) => Response,
): Promise<Response> {
  const cache = new ProviderCache(env);
  const cacheKey = await explainCacheKey(body.question, body.difficulty, body.language);
  const cached = await cache.get<ExplainResponse>(cacheKey);
  if (cached) {
    logCacheHit(id, "explain", started);
    return respond(cached);
  }

  const gemini = createGeminiAdapter(env);
  const groq = createGroqAdapter(env);
  const { primary, fallback } = await buildAdapters(env, gemini, groq);

  try {
    const result = await runWithFailover(
      primary,
      fallback,
      (adapter) =>
        adapter.generateExplanation({
          question: body.question,
          difficulty: body.difficulty,
          language: body.language,
        }),
      (error) => recordProviderFailure(error, env.AI_USAGE),
    );

    const response: ExplainResponse = {
      explanation: result.value,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
    };

    await cache.set(cacheKey, response);
    logSuccess(id, "explain", result.provider, result.fallbackUsed, started);
    return respond(response);
  } catch (error) {
    await recordHealth(error, env.AI_USAGE);
    return respondError(error);
  }
}

async function handleQuiz(
  body: QuizRequest,
  env: Env,
  id: string,
  started: number,
  respond: (data: unknown, status?: number) => Response,
  respondError: (error: unknown) => Response,
): Promise<Response> {
  const cache = new ProviderCache(env);
  const cacheKey = await quizCacheKey(
    body.question,
    body.difficulty,
    body.language,
    body.explanation,
  );
  const cached = await cache.get<QuizResponse>(cacheKey);
  if (cached) {
    logCacheHit(id, "quiz", started);
    return respond(cached);
  }

  const gemini = createGeminiAdapter(env);
  const groq = createGroqAdapter(env);
  const { primary, fallback } = await buildAdapters(env, gemini, groq);

  try {
    const result = await runWithFailover(
      primary,
      fallback,
      (adapter) =>
        adapter.generateQuiz({
          question: body.question,
          difficulty: body.difficulty,
          language: body.language,
          explanation: body.explanation,
        }),
      (error) => recordProviderFailure(error, env.AI_USAGE),
    );

    const response: QuizResponse = {
      quiz: result.value,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
    };

    await cache.set(cacheKey, response);
    logSuccess(id, "quiz", result.provider, result.fallbackUsed, started);
    return respond(response);
  } catch (error) {
    await recordHealth(error, env.AI_USAGE);
    return respondError(error);
  }
}

async function buildAdapters(
  env: Env,
  gemini: ProviderAdapter,
  groq: ProviderAdapter,
): Promise<{ primary: ProviderAdapter; fallback: ProviderAdapter }> {
  const preferred: Provider = env.PRIMARY_PROVIDER === "groq" ? "groq" : "gemini";
  const primaryName = await health.primary(preferred, env.AI_USAGE);
  const primary: ProviderAdapter = primaryName === "groq" ? groq : gemini;
  const fallback: ProviderAdapter = primaryName === "groq" ? gemini : groq;
  return { primary, fallback };
}

export const health = new ProviderHealth();

async function recordProviderFailure(error: ProviderError, kv?: KVNamespace): Promise<void> {
  if (error.provider) {
    await health.recordFailure(error.provider as Provider, kv);
  }
}

async function recordHealth(error: unknown, kv?: KVNamespace): Promise<void> {
  if (error instanceof ProviderError && error.provider) {
    if (error.retryable) {
      await health.recordFailure(error.provider as Provider, kv);
    } else {
      await health.recordSuccess(error.provider as Provider, kv);
    }
  }
}

function logSuccess(
  id: string,
  kind: "explain" | "quiz",
  provider: Provider,
  fallbackUsed: boolean,
  started: number,
): void {
  console.log(
    JSON.stringify({
      event: "request.success",
      requestId: id,
      kind,
      provider,
      fallbackUsed,
      latencyMs: Date.now() - started,
    }),
  );
}

function logCacheHit(
  id: string,
  kind: "explain" | "quiz",
  started: number,
): void {
  console.log(
    JSON.stringify({
      event: "request.cache_hit",
      requestId: id,
      kind,
      latencyMs: Date.now() - started,
    }),
  );
}

import type {
  Difficulty,
  ExplanationLanguage,
} from "../../../shared/types";

export interface CacheEnv {
  AI_USAGE?: KVNamespace;
}

const TTL_SECONDS = 60 * 60 * 24 * 30;

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function explainCacheKey(
  question: string,
  difficulty: Difficulty,
  language: ExplanationLanguage,
): Promise<string> {
  return sha256Hex(
    `${normalizeQuestion(question)}|${difficulty}|${language}`,
  ).then((hash) => `cache:explain:v1:${hash}`);
}

export function quizCacheKey(
  question: string,
  difficulty: Difficulty,
  language: ExplanationLanguage,
  explanation: unknown,
): Promise<string> {
  const stable = JSON.stringify(explanation);
  return sha256Hex(
    `${normalizeQuestion(question)}|${difficulty}|${language}|${stable}`,
  ).then((hash) => `cache:quiz:v1:${hash}`);
}

/**
 * KV-backed cache for provider responses. Cache hits skip the provider call
 * entirely. Without a KV binding the cache is inert (get returns undefined,
 * set is a no-op) so requests still work in local dev.
 */
export class ProviderCache {
  constructor(private readonly env: CacheEnv) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.env.AI_USAGE) return undefined;
    try {
      const raw = await this.env.AI_USAGE.get(key);
      if (!raw) return undefined;
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.env.AI_USAGE) return;
    try {
      await this.env.AI_USAGE.put(key, JSON.stringify(value), {
        expirationTtl: TTL_SECONDS,
      });
    } catch {
      // Best-effort write; a failed cache write must never fail the request.
    }
  }
}

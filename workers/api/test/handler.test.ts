import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { health, type Env } from "../src/index";

const VALID_EXPLANATION = {
  topic: "Quarks",
  sections: [{ heading: "Basics", body: "Quarks are fundamental particles." }],
  examples: ["Protons contain quarks."],
  analogy: "Like LEGO bricks",
  keyPoints: ["There are six flavors."],
};

const VALID_QUIZ = {
  questions: [
    {
      prompt: "Q",
      choices: ["A", "B", "C", "D"],
      correctIndex: 1,
      explanation: "x",
    },
  ],
};

function geminiResponse(): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_EXPLANATION) }] } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function groqResponse(body: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: { message: "nope" } }), { status });
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    GEMINI_API_KEY: "gemini-key",
    GROQ_API_KEY: "groq-key",
    MAX_DAILY_REQUESTS_PER_USER: "100",
    ...overrides,
  };
}

class MockKv {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function kvEnv(overrides: Partial<Env> = {}): Env {
  return makeEnv({ AI_USAGE: new MockKv() as never, ...overrides });
}

function post(path: string, body: unknown, env: Env): Promise<Response> {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

const originalFetch = globalThis.fetch;

function mockProviderCalls(plan: Array<{ url: string; response: () => Response }>): void {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : String(input.url ?? input);
    const match = plan.find((entry) => url.includes(entry.url));
    if (!match) throw new Error(`Unexpected fetch to ${url}`);
    calls.push(match.url);
    return match.response();
  }) as unknown as typeof fetch;
  vi.stubGlobal("__calls", calls);
}

function lastCalls(): string[] {
  return (globalThis as any).__calls ?? [];
}

beforeEach(async () => {
  mockProviderCalls([]);
  await health.reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe("worker handler", () => {
  it("returns ok from /health", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), makeEnv());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toMatchObject({ status: "ok", providers: { gemini: true, groq: true } });
  });

  it("handles CORS preflight", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/explain", { method: "OPTIONS" }),
      makeEnv({ ALLOWED_ORIGIN: "https://example.com" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("stores waitlist entries and treats duplicate emails as idempotent", async () => {
    const env = kvEnv();
    const body = { name: "Ada Lovelace", email: "Ada@Example.com" };

    const first = await post("/waitlist", body, env);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, alreadyJoined: false });

    const duplicate = await post("/waitlist", body, env);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ ok: true, alreadyJoined: true });
  });

  it("rejects invalid waitlist emails", async () => {
    const res = await post(
      "/waitlist",
      { name: "Ada", email: "not-an-email" },
      kvEnv(),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.code).toBe("invalid_request");
  });

  it("rejects invalid explain payloads with 400", async () => {
    const res = await post("/explain", { question: "", difficulty: "beginner", language: "english", userId: "u" }, makeEnv());
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("invalid_request");
  });

  it("uses Gemini without fallback on success", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
    ]);
    const res = await post(
      "/explain",
      { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u1" },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.provider).toBe("gemini");
    expect(data.fallbackUsed).toBe(false);
    expect(data.explanation.topic).toBe("Quarks");
    expect(lastCalls()).toHaveLength(1);
  });

  it("falls back to Groq when Gemini is rate limited", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: () => errorResponse(429) },
      { url: "api.groq.com", response: () => groqResponse(VALID_EXPLANATION) },
    ]);
    const res = await post(
      "/explain",
      { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u2" },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.provider).toBe("groq");
    expect(data.fallbackUsed).toBe(true);
    expect(lastCalls()).toHaveLength(2);
  });

  it("falls back to Gemini when Groq is the primary and fails", async () => {
    mockProviderCalls([
      { url: "api.groq.com", response: () => errorResponse(429) },
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
    ]);
    const res = await post(
      "/explain",
      { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u3" },
      makeEnv({ PRIMARY_PROVIDER: "groq" }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.provider).toBe("gemini");
    expect(data.fallbackUsed).toBe(true);
  });

  it("returns 503 when both providers fail", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: () => errorResponse(429) },
      { url: "api.groq.com", response: () => errorResponse(500) },
    ]);
    const res = await post(
      "/explain",
      { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u4" },
      makeEnv(),
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as any;
    expect(data.error.retryable).toBe(true);
  });

  it("routes straight to the fallback provider once the primary fails repeatedly", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: () => errorResponse(429) },
      { url: "api.groq.com", response: () => groqResponse(VALID_EXPLANATION) },
    ]);
    const env = makeEnv();
    const body = (n: number) => ({
      question: `What are quarks ${n}?`,
      difficulty: "beginner",
      language: "english",
      userId: "u10",
    });

    const first = await post("/explain", body(1), env);
    expect(first.status).toBe(200);
    expect((await first.json()) as any).toMatchObject({ provider: "groq" });

    const second = await post("/explain", body(2), env);
    expect(second.status).toBe(200);
    expect((await second.json()) as any).toMatchObject({ provider: "groq" });
    expect(lastCalls()).toHaveLength(4);

    const third = await post("/explain", body(3), env);
    expect(third.status).toBe(200);
    const data = (await third.json()) as any;
    expect(data.provider).toBe("groq");
    expect(data.fallbackUsed).toBe(false);
    expect(lastCalls()).toHaveLength(5);
  });

  it("generates a quiz through the Worker", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_QUIZ) }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ) },
    ]);
    const res = await post(
      "/quiz",
      {
        question: "What are quarks?",
        difficulty: "beginner",
        language: "english",
        explanation: VALID_EXPLANATION,
        userId: "u5",
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.quiz.questions).toHaveLength(1);
  });

  it("enforces the daily per-user limit", async () => {
    const env = makeEnv({ MAX_DAILY_REQUESTS_PER_USER: "2" });
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
    ]);
    const ok1 = await post("/explain", { question: "q", difficulty: "beginner", language: "english", userId: "limited" }, env);
    const ok2 = await post("/explain", { question: "q", difficulty: "beginner", language: "english", userId: "limited" }, env);
    const blocked = await post("/explain", { question: "q", difficulty: "beginner", language: "english", userId: "limited" }, env);

    expect(ok1.status).toBe(200);
    expect(ok2.status).toBe(200);
    expect(blocked.status).toBe(400);
    const data = (await blocked.json()) as any;
    expect(data.error.code).toBe("rate_limit");
    expect(lastCalls()).toHaveLength(2);
  });

  it("serves a cached explanation without calling a provider again", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
    ]);
    const env = kvEnv();
    const body = { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u7" };

    const first = await post("/explain", body, env);
    expect(first.status).toBe(200);
    expect(lastCalls()).toHaveLength(1);

    const second = await post("/explain", body, env);
    expect(second.status).toBe(200);
    expect(lastCalls()).toHaveLength(1);
    expect(await second.json()).toEqual(await first.json());
  });

  it("uses a fresh provider call when the difficulty differs", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
      { url: "generativelanguage.googleapis.com", response: geminiResponse },
    ]);
    const env = kvEnv();

    await post(
      "/explain",
      { question: "What are quarks?", difficulty: "beginner", language: "english", userId: "u8" },
      env,
    );
    await post(
      "/explain",
      { question: "What are quarks?", difficulty: "advanced", language: "english", userId: "u8" },
      env,
    );
    expect(lastCalls()).toHaveLength(2);
  });

  it("serves a cached quiz without calling a provider again", async () => {
    mockProviderCalls([
      { url: "generativelanguage.googleapis.com", response: () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_QUIZ) }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ) },
    ]);
    const env = kvEnv();
    const body = {
      question: "What are quarks?",
      difficulty: "beginner",
      language: "english",
      explanation: VALID_EXPLANATION,
      userId: "u9",
    };

    const first = await post("/quiz", body, env);
    expect(first.status).toBe(200);
    expect(lastCalls()).toHaveLength(1);

    const second = await post("/quiz", body, env);
    expect(second.status).toBe(200);
    expect(lastCalls()).toHaveLength(1);
  });
});

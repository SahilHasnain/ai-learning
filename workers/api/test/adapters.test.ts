import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../src/errors";
import { createGeminiAdapter } from "../src/gemini";
import { createGroqAdapter } from "../src/groq";

const originalFetch = globalThis.fetch;

function mockFetch(response: Response | (() => Response)): void {
  const fn =
    typeof response === "function"
      ? vi.fn(response)
      : vi.fn(async () => response);
  globalThis.fetch = fn as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_EXPLANATION = {
  topic: "Quarks",
  sections: [{ heading: "Basics", body: "Quarks are fundamental particles." }],
  examples: ["Protons contain quarks."],
  analogy: "Like LEGO bricks",
  keyPoints: ["There are six flavors."],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Gemini adapter", () => {
  const env = { GEMINI_API_KEY: "test-key" };

  it("parses a successful explanation response", async () => {
    mockFetch(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_EXPLANATION) }] } }],
      }),
    );

    const adapter = createGeminiAdapter(env);
    const result = await adapter.generateExplanation({
      question: "What are quarks?",
      difficulty: "beginner",
      language: "english",
    });

    expect(result.topic).toBe("Quarks");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("maps a 429 to a retryable rate_limit error", async () => {
    mockFetch(jsonResponse({ error: { message: "rate limit" } }, 429));

    const adapter = createGeminiAdapter(env);
    await expect(
      adapter.generateExplanation({ question: "q", difficulty: "beginner", language: "english" }),
    ).rejects.toMatchObject({ category: "rate_limit", retryable: true, provider: "gemini" });
  });

  it("maps a 403 to a retryable quota error", async () => {
    mockFetch(jsonResponse({ error: { message: "forbidden" } }, 403));

    const adapter = createGeminiAdapter(env);
    await expect(
      adapter.generateExplanation({ question: "q", difficulty: "beginner", language: "english" }),
    ).rejects.toMatchObject({ category: "quota", retryable: true });
  });

  it("throws internal error when the API key is missing", async () => {
    const adapter = createGeminiAdapter({});
    await expect(
      adapter.generateExplanation({ question: "q", difficulty: "beginner", language: "english" }),
    ).rejects.toMatchObject({ category: "internal", retryable: false });
  });
});

describe("Groq adapter", () => {
  const env = { GROQ_API_KEY: "test-key" };

  it("parses a successful quiz response", async () => {
    mockFetch(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    prompt: "Q",
                    choices: ["A", "B", "C", "D"],
                    correctIndex: 1,
                    explanation: "x",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );

    const adapter = createGroqAdapter(env);
    const result = await adapter.generateQuiz({
      question: "q",
      difficulty: "beginner",
      language: "english",
      explanation: VALID_EXPLANATION,
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].correctIndex).toBe(1);
  });

  it("maps a 429 to a retryable rate_limit error", async () => {
    mockFetch(jsonResponse({ error: { message: "rate" } }, 429));

    const adapter = createGroqAdapter(env);
    await expect(
      adapter.generateQuiz({
        question: "q",
        difficulty: "beginner",
        language: "english",
        explanation: VALID_EXPLANATION,
      }),
    ).rejects.toMatchObject({ category: "rate_limit", retryable: true, provider: "groq" });
  });

  it("sends max_completion_tokens for gpt-oss models", async () => {
    mockFetch(
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    prompt: "Q",
                    choices: ["A", "B", "C", "D"],
                    correctIndex: 1,
                    explanation: "x",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );

    const adapter = createGroqAdapter({
      GROQ_API_KEY: "test-key",
      GROQ_MODEL: "openai/gpt-oss-20b",
    });
    await adapter.generateQuiz({
      question: "q",
      difficulty: "beginner",
      language: "english",
      explanation: VALID_EXPLANATION,
    });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.max_completion_tokens).toBe(1600);
    expect(body.max_tokens).toBeUndefined();
    expect(body.include_reasoning).toBe(false);
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("uses completion token limits for all Groq models", async () => {
    mockFetch(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(VALID_EXPLANATION) } }],
      }),
    );

    const adapter = createGroqAdapter({
      GROQ_API_KEY: "test-key",
      GROQ_MODEL: "llama-3.1-8b-instant",
    });
    await adapter.generateExplanation({
      question: "q",
      difficulty: "beginner",
      language: "english",
    });

    const [, init] = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.max_completion_tokens).toBe(800);
    expect(body.max_tokens).toBeUndefined();
    expect(body.include_reasoning).toBeUndefined();
  });

  it("maps a 500 to a retryable unavailable error", async () => {
    mockFetch(jsonResponse({}, 500));

    const adapter = createGroqAdapter(env);
    await expect(
      adapter.generateExplanation({ question: "q", difficulty: "beginner", language: "english" }),
    ).rejects.toMatchObject({ category: "unavailable", retryable: true });
  });

  it("throws internal error when the API key is missing", async () => {
    const adapter = createGroqAdapter({});
    await expect(
      adapter.generateExplanation({ question: "q", difficulty: "beginner", language: "english" }),
    ).rejects.toMatchObject({ category: "internal", retryable: false });
  });
});

describe("error hierarchy", () => {
  it("marks only known categories as retryable", () => {
    expect(new ProviderError("quota", "q").retryable).toBe(true);
    expect(new ProviderError("rate_limit", "q").retryable).toBe(true);
    expect(new ProviderError("timeout", "q").retryable).toBe(true);
    expect(new ProviderError("unavailable", "q").retryable).toBe(true);
    expect(new ProviderError("invalid_request", "q").retryable).toBe(true);
    expect(new ProviderError("internal", "q").retryable).toBe(false);
  });
});

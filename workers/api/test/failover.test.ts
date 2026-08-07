import { describe, expect, it } from "vitest";
import { ProviderError } from "../src/errors";
import { runWithFailover } from "../src/failover";
import type { ProviderAdapter } from "../src/providers";

function adapter(name: "gemini" | "groq", behavior: "ok" | "fail-retryable" | "fail-fatal"): ProviderAdapter {
  return {
    name,
    async generateExplanation() {
      if (behavior === "fail-retryable") {
        throw new ProviderError("quota", `${name} out of quota.`, { provider: name });
      }
      if (behavior === "fail-fatal") {
        throw new ProviderError("internal", `${name} misconfigured.`, {
          provider: name,
        });
      }
      return { topic: name, sections: [], examples: [], keyPoints: [] };
    },
    async generateQuiz() {
      return { questions: [] };
    },
  };
}

describe("runWithFailover", () => {
  it("uses the primary and does not call the fallback on success", async () => {
    let fallbackCalls = 0;
    const primary = adapter("gemini", "ok");
    const fallback = {
      ...adapter("groq", "ok"),
      async generateExplanation() {
        fallbackCalls++;
        return { topic: "groq", sections: [], examples: [], keyPoints: [] };
      },
    };

    const result = await runWithFailover(primary, fallback, (a) =>
      a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
    );

    expect(result.provider).toBe("gemini");
    expect(result.fallbackUsed).toBe(false);
    expect(fallbackCalls).toBe(0);
  });

  it("falls back to Groq when Gemini hits a retryable error", async () => {
    const primary = adapter("gemini", "fail-retryable");
    const fallback = adapter("groq", "ok");

    const result = await runWithFailover(primary, fallback, (a) =>
      a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
    );

    expect(result.provider).toBe("groq");
    expect(result.fallbackUsed).toBe(true);
    expect(result.value.topic).toBe("groq");
  });

  it("falls back to Gemini when Groq hits a retryable error", async () => {
    const primary = adapter("groq", "fail-retryable");
    const fallback = adapter("gemini", "ok");

    const result = await runWithFailover(primary, fallback, (a) =>
      a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
    );

    expect(result.provider).toBe("gemini");
    expect(result.fallbackUsed).toBe(true);
  });

  it("falls back when the primary returns a provider-side invalid_request", async () => {
    const primary = {
      ...adapter("groq", "ok"),
      async generateExplanation() {
        throw new ProviderError("invalid_request", "Groq rejected request.", {
          provider: "groq",
        });
      },
    };
    const fallback = adapter("gemini", "ok");

    const result = await runWithFailover(primary, fallback, (a) =>
      a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
    );

    expect(result.provider).toBe("gemini");
    expect(result.fallbackUsed).toBe(true);
  });

  it("does not call the fallback for a non-retryable error", async () => {
    let fallbackCalls = 0;
    const primary = adapter("gemini", "fail-fatal");
    const fallback = {
      ...adapter("groq", "ok"),
      async generateExplanation() {
        fallbackCalls++;
        return { topic: "groq", sections: [], examples: [], keyPoints: [] };
      },
    };

    await expect(
      runWithFailover(primary, fallback, (a) =>
        a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);

    expect(fallbackCalls).toBe(0);
  });

  it("rethrows the fallback error when both providers fail", async () => {
    const primary = adapter("gemini", "fail-retryable");
    const fallback = adapter("groq", "fail-retryable");

    const promise = runWithFailover(primary, fallback, (a) =>
      a.generateExplanation({ question: "x", difficulty: "beginner", language: "english" }),
    );

    await expect(promise).rejects.toMatchObject({ provider: "groq", retryable: true });
  });
});

import type { ProviderAdapter } from "./providers";
import { ProviderError, ValidationError } from "./errors";
import {
  buildExplanationPrompt,
  buildQuizPrompt,
  type ExplainContext,
  type QuizContext,
} from "./prompts";
import { fetchWithTimeout, mapHttpStatusToError, mapNetworkError } from "./providers";
import { parseExplanation, parseQuiz } from "./validation";

function asProviderOutput<T>(value: () => T): T {
  try {
    return value();
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ProviderError(
        "invalid_request",
        "Groq returned an invalid response schema.",
        { provider: "groq", cause: err },
      );
    }
    throw err;
  }
}

interface GroqEnv {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("No JSON object found.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

async function chatCompletion(
  env: GroqEnv,
  prompt: string,
  maxTokens: number,
): Promise<unknown> {
  const key = env.GROQ_API_KEY;
  const model = env.GROQ_MODEL ?? "openai/gpt-oss-20b";
  const isGptOss = model.includes("gpt-oss");

  if (!key) {
    throw new ProviderError("internal", "Groq API key is not configured on the Worker.", {
      provider: "groq",
    });
  }

  for (let attempt = 0; attempt < (isGptOss ? 2 : 1); attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: isGptOss ? 0.6 : 0.4,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_completion_tokens: maxTokens,
          ...(isGptOss
            ? { include_reasoning: false, reasoning_effort: "low" }
            : {}),
        }),
      });
    } catch (err) {
      throw mapNetworkError(err, "groq");
    }

    if (!res.ok) {
      const status = res.status;
      const bodyText = await res.text().catch(() => "");
      if (isGptOss && status === 400 && attempt === 0) {
        console.log(
          JSON.stringify({
            event: "provider.retry",
            provider: "groq",
            reason: "gpt-oss rejected request",
            status,
            detail: bodyText.slice(0, 200),
          }),
        );
        continue;
      }
      const error = mapHttpStatusToError(status);
      throw new ProviderError(error.category, error.message, {
        provider: "groq",
        cause: new Error(bodyText.slice(0, 200)),
      });
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      throw new ProviderError("unavailable", "Groq returned invalid JSON.", {
        provider: "groq",
        cause: err,
      });
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      if (isGptOss && attempt === 0) continue;
      throw new ProviderError("unavailable", "Groq returned an empty response.", {
        provider: "groq",
      });
    }

    try {
      return parseModelJson(text);
    } catch (err) {
      if (isGptOss && attempt === 0) continue;
      throw new ProviderError("invalid_request", "Groq returned malformed JSON.", {
        provider: "groq",
        cause: err,
      });
    }
  }

  throw new ProviderError("unavailable", "Groq returned no usable response.", {
    provider: "groq",
  });
}

export function createGroqAdapter(env: GroqEnv): ProviderAdapter {
  return {
    name: "groq",
    async generateExplanation(input: ExplainContext) {
      const raw = await chatCompletion(env, buildExplanationPrompt(input), 800);
      return asProviderOutput(() => parseExplanation(raw));
    },
    async generateQuiz(input: QuizContext) {
      const raw = await chatCompletion(env, buildQuizPrompt(input), 1600);
      return asProviderOutput(() => parseQuiz(raw));
    },
  };
}

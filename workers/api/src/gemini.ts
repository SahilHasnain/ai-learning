import { ProviderError, ValidationError } from "./errors";
import { buildExplanationPrompt, buildQuizPrompt } from "./prompts";
import type {
  ExplainInput,
  ProviderAdapter,
  QuizInput,
} from "./providers";
import { fetchWithTimeout, mapHttpStatusToError, mapNetworkError } from "./providers";
import { parseExplanation, parseQuiz } from "./validation";

function asProviderOutput<T>(value: () => T): T {
  try {
    return value();
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ProviderError(
        "invalid_request",
        "Gemini returned an invalid response schema.",
        { provider: "gemini", cause: err },
      );
    }
    throw err;
  }
}

interface GeminiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export function createGeminiAdapter(env: GeminiEnv): ProviderAdapter {
  const key = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

  async function generateContent(
    prompt: string,
    responseSchema: unknown,
    maxOutputTokens: number,
  ): Promise<unknown> {
    if (!key) {
      throw new ProviderError(
        "internal",
        "Gemini API key is not configured on the Worker.",
        { provider: "gemini" },
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    let res: Response;
    try {
      res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      });
    } catch (err) {
      throw mapNetworkError(err, "gemini");
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const error = mapHttpStatusToError(res.status);
      throw new ProviderError(error.category, error.message, {
        provider: "gemini",
        cause: new Error(bodyText.slice(0, 200)),
      });
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      throw new ProviderError("unavailable", "Provider returned invalid JSON.", {
        provider: "gemini",
        cause: err,
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new ProviderError("unavailable", "Gemini returned an empty response.", {
        provider: "gemini",
      });
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ProviderError("invalid_request", "Gemini returned malformed JSON.", {
        provider: "gemini",
        cause: err,
      });
    }
  }

  return {
    name: "gemini",
    async generateExplanation(input) {
      const raw = await generateContent(
        buildExplanationPrompt(input),
        {
          type: "OBJECT",
          properties: {
            topic: { type: "STRING" },
            sections: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  heading: { type: "STRING" },
                  body: { type: "STRING" },
                },
              },
            },
            examples: { type: "ARRAY", items: { type: "STRING" } },
            analogy: { type: "STRING" },
            keyPoints: { type: "ARRAY", items: { type: "STRING" } },
          },
        },
        350,
      );
      return asProviderOutput(() => parseExplanation(raw));
    },
    async generateQuiz(input: QuizInput) {
      const raw = await generateContent(buildQuizPrompt(input), {
        type: "OBJECT",
        properties: {
          questions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                prompt: { type: "STRING" },
                choices: { type: "ARRAY", items: { type: "STRING" } },
                correctIndex: { type: "INTEGER" },
                explanation: { type: "STRING" },
              },
            },
          },
        },
      }, 900);
      return asProviderOutput(() => parseQuiz(raw));
    },
  };
}

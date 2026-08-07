import type {
  Difficulty,
  ExplainRequest,
  ExplainResponse,
  Explanation,
  ExplanationLanguage,
  QuizRequest,
  QuizResponse,
} from "../shared/types";
import { getApiUrl } from "./env";

export class ApiClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

const API_URL = getApiUrl();

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(
      "network",
      "Could not reach the learning service. Check your connection and try again.",
      true,
    );
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; retryable?: boolean } })
      ?.error;
    throw new ApiClientError(
      error?.code ?? "internal",
      error?.message ?? `Request failed with status ${res.status}.`,
      error?.retryable ?? false,
    );
  }

  return data as T;
}

export async function explainQuestion(
  question: string,
  difficulty: Difficulty,
  language: ExplanationLanguage,
  userId: string,
): Promise<ExplainResponse> {
  const body: ExplainRequest = { question, difficulty, language, userId };
  return post<ExplainResponse>("/explain", body);
}

export async function generateQuiz(
  question: string,
  difficulty: Difficulty,
  language: ExplanationLanguage,
  explanation: Explanation,
  userId: string,
): Promise<QuizResponse> {
  const body: QuizRequest = { question, difficulty, language, explanation, userId };
  return post<QuizResponse>("/quiz", body);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

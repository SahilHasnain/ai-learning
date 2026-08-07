import type {
  Difficulty,
  Explanation,
  ExplanationLanguage,
  Provider,
  Quiz,
} from "../../../shared/types";
import { ProviderError } from "./errors";

export interface ExplainInput {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
}

export interface QuizInput {
  question: string;
  difficulty: Difficulty;
  language: ExplanationLanguage;
  explanation: Explanation;
}

export interface ProviderAdapter {
  readonly name: Provider;
  generateExplanation(input: ExplainInput): Promise<Explanation>;
  generateQuiz(input: QuizInput): Promise<Quiz>;
}

const REQUEST_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function mapHttpStatusToError(status: number): ProviderError {
  switch (status) {
    case 408:
      return new ProviderError("timeout", `Provider request timed out (HTTP ${status}).`);
    case 429:
      return new ProviderError("rate_limit", "Provider rate limit reached (HTTP 429).");
    case 400:
    case 404:
      return new ProviderError(
        "invalid_request",
        `Provider rejected the request (HTTP ${status}).`,
      );
    case 401:
    case 403:
      return new ProviderError(
        "quota",
        "Provider quota or authorization limit reached (HTTP " + status + ").",
      );
    default:
      if (status >= 500) {
        return new ProviderError(
          "unavailable",
          `Provider unavailable (HTTP ${status}).`,
        );
      }
      return new ProviderError(
        "unavailable",
        `Provider returned an unexpected status (HTTP ${status}).`,
      );
  }
}

export function mapNetworkError(err: unknown, provider?: Provider): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new ProviderError("timeout", "Provider request timed out.", { provider });
  }
  const message = err instanceof Error ? err.message : "Unknown provider error.";
  return new ProviderError("unavailable", message, { cause: err, provider });
}

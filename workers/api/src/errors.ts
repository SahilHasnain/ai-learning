export type ErrorCategory =
  | "quota"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "invalid_request"
  | "internal";

export const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "quota",
  "rate_limit",
  "timeout",
  "unavailable",
  "invalid_request",
]);

export function isRetryable(category: ErrorCategory): boolean {
  return RETRYABLE_CATEGORIES.has(category);
}

export class ProviderError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly provider?: string;
  providerFallbackOf?: ProviderError;

  constructor(
    category: ErrorCategory,
    message: string,
    options?: { provider?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.category = category;
    this.retryable = isRetryable(category);
    this.provider = options?.provider;
  }
}

export class ValidationError extends Error {
  readonly retryable = false;
  readonly category: ErrorCategory = "invalid_request";

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class RequestError extends Error {
  readonly retryable = false;
  readonly category: ErrorCategory = "invalid_request";

  constructor(message: string) {
    super(message);
    this.name = "RequestError";
  }
}

export class RateLimitError extends Error {
  readonly retryable = false;
  readonly category: ErrorCategory = "rate_limit";

  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

import type { Provider } from "../../../shared/types";
import { ProviderError } from "./errors";
import type { ProviderAdapter } from "./providers";

export interface FailoverResult<T> {
  value: T;
  provider: Provider;
  fallbackUsed: boolean;
}

/**
 * Runs `task` against the primary adapter. If it fails with a retryable
 * provider error (quota, rate limit, timeout, unavailable, or a provider-side
 * invalid_request such as HTTP 400 or malformed output), runs it once against
 * the fallback adapter. Client-side request errors and config errors are
 * propagated without touching the fallback.
 *
 * `onPrimaryFailure` is invoked before using the fallback so callers can
 * track provider health even when the overall request succeeds.
 */
export async function runWithFailover<T>(
  primary: ProviderAdapter,
  fallback: ProviderAdapter,
  task: (adapter: ProviderAdapter) => Promise<T>,
  onPrimaryFailure?: (error: ProviderError) => void | Promise<void>,
): Promise<FailoverResult<T>> {
  try {
    const value = await task(primary);
    return { value, provider: primary.name, fallbackUsed: false };
  } catch (primaryError) {
    if (!(primaryError instanceof ProviderError) || !primaryError.retryable) {
      throw primaryError;
    }

    await onPrimaryFailure?.(primaryError);

    try {
      const value = await task(fallback);
      return { value, provider: fallback.name, fallbackUsed: true };
    } catch (fallbackError) {
      if (fallbackError instanceof ProviderError) {
        fallbackError.providerFallbackOf = primaryError;
      }
      throw fallbackError;
    }
  }
}

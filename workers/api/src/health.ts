import type { Provider } from "../../../shared/types";

export const HEALTH_FAILURE_THRESHOLD = 2;
export const HEALTH_COOLDOWN_MS = 60_000;
export const HEALTH_KEY_PREFIX = "health";

interface HealthState {
  failures: number;
  lastFailureAt: number;
}

export function healthKey(provider: Provider): string {
  return `${HEALTH_KEY_PREFIX}:${provider}`;
}

/**
 * Circuit breaker for choosing the primary provider. State is persisted in
 * KV so it survives across the Worker's isolates; without a KV binding it
 * falls back to in-memory state (local dev, tests). A provider is skipped as
 * primary for a cooldown window after `HEALTH_FAILURE_THRESHOLD` consecutive
 * retryable failures, then tried again to detect recovery. KV writes are
 * best-effort so a failed health write never fails the request.
 */
export class ProviderHealth {
  private readonly memory = new Map<Provider, HealthState>();

  constructor(private readonly now: () => number = Date.now) {}

  async primary(preferred: Provider, kv?: KVNamespace): Promise<Provider> {
    const state = await this.read(preferred, kv);
    if (
      state &&
      state.failures >= HEALTH_FAILURE_THRESHOLD &&
      this.now() - state.lastFailureAt < HEALTH_COOLDOWN_MS
    ) {
      return preferred === "gemini" ? "groq" : "gemini";
    }
    return preferred;
  }

  async recordFailure(provider: Provider, kv?: KVNamespace): Promise<void> {
    const state = await this.read(provider, kv);
    await this.write(
      provider,
      { failures: (state?.failures ?? 0) + 1, lastFailureAt: this.now() },
      kv,
    );
  }

  async recordSuccess(provider: Provider, kv?: KVNamespace): Promise<void> {
    await this.write(provider, { failures: 0, lastFailureAt: this.now() }, kv);
  }

  async reset(kv?: KVNamespace): Promise<void> {
    this.memory.clear();
    if (kv) {
      for (const provider of ["gemini", "groq"] as Provider[]) {
        await kv.delete(healthKey(provider)).catch(() => {});
      }
    }
  }

  private async read(provider: Provider, kv?: KVNamespace): Promise<HealthState | null> {
    if (kv) {
      try {
        const raw = await kv.get(healthKey(provider), "json");
        return raw as HealthState | null;
      } catch {
        return null;
      }
    }
    return this.memory.get(provider) ?? null;
  }

  private async write(provider: Provider, state: HealthState, kv?: KVNamespace): Promise<void> {
    if (kv) {
      try {
        await kv.put(healthKey(provider), JSON.stringify(state), {
          expirationTtl: Math.ceil(HEALTH_COOLDOWN_MS / 1000) + 60,
        });
      } catch {
        // Best-effort write; a failed health write must never fail the request.
      }
      return;
    }
    this.memory.set(provider, state);
  }
}

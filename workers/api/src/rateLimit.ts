export interface AiUsageEnv {
  AI_USAGE?: KVNamespace;
  MAX_DAILY_REQUESTS_PER_USER?: string;
}

interface QuotaResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class RateLimiter {
  private readonly limit: number;
  private readonly memory: Map<string, { day: string; count: number }>;

  constructor(private readonly env: AiUsageEnv) {
    this.limit = Number(env.MAX_DAILY_REQUESTS_PER_USER) || 40;
    this.memory = new Map();
  }

  async check(userId: string, now: Date = new Date()): Promise<QuotaResult> {
    const day = dateKey(now);
    const key = `usage:${day}:${userId}`;

    if (this.env.AI_USAGE) {
      return this.checkKv(this.env.AI_USAGE, key, day);
    }
    return this.checkMemory(key, day);
  }

  private async checkKv(
    kv: KVNamespace,
    key: string,
    day: string,
  ): Promise<QuotaResult> {
    let count = 0;
    try {
      const raw = await kv.get(key);
      if (raw) count = Number(raw) || 0;
    } catch {
      // KV unavailable: fail open to an in-memory check for this call.
      return this.checkMemory(key, day);
    }

    if (count >= this.limit) {
      return { allowed: false, remaining: 0, limit: this.limit };
    }

    const next = count + 1;
    try {
      await kv.put(key, String(next), { expirationTtl: 60 * 60 * 24 * 2 });
    } catch {
      // Best-effort increment; don't fail the request because of it.
    }
    return { allowed: true, remaining: Math.max(0, this.limit - next), limit: this.limit };
  }

  private checkMemory(key: string, day: string): QuotaResult {
    const entry = this.memory.get(key);
    const now = entry && entry.day === day ? entry.count : 0;

    if (now >= this.limit) {
      return { allowed: false, remaining: 0, limit: this.limit };
    }

    this.memory.set(key, { day, count: now + 1 });
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - (now + 1)),
      limit: this.limit,
    };
  }
}

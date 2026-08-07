import { describe, expect, it } from "vitest";
import {
  ProviderCache,
  explainCacheKey,
  quizCacheKey,
  sha256Hex,
} from "../src/cache";

class MockKv {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

describe("cache keys", () => {
  it("produces stable sha256 hex digests", async () => {
    const a = await sha256Hex("What is gravity?");
    const b = await sha256Hex("What is gravity?");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalizes question casing and whitespace for cache keys", async () => {
    const a = await explainCacheKey("What  is Gravity?", "beginner", "english");
    const b = await explainCacheKey("what is gravity?", "beginner", "english");
    expect(a).toBe(b);
  });

  it("separates difficulties and languages", async () => {
    const beginner = await explainCacheKey("q", "beginner", "english");
    const advanced = await explainCacheKey("q", "advanced", "english");
    const hinglish = await explainCacheKey("q", "beginner", "hinglish");
    expect(beginner).not.toBe(advanced);
    expect(beginner).not.toBe(hinglish);
  });

  it("separates quizzes by explanation content", async () => {
    const a = await quizCacheKey("q", "beginner", "english", { topic: "A" });
    const b = await quizCacheKey("q", "beginner", "english", { topic: "B" });
    expect(a).not.toBe(b);
  });
});

describe("ProviderCache", () => {
  it("returns undefined on a miss and the value on a hit", async () => {
    const cache = new ProviderCache({ AI_USAGE: new MockKv() as never });
    expect(await cache.get("k1")).toBeUndefined();
    await cache.set("k1", { hello: "world" });
    expect(await cache.get("k1")).toEqual({ hello: "world" });
  });

  it("is inert when no KV binding exists", async () => {
    const cache = new ProviderCache({});
    await cache.set("k2", { hello: "world" });
    expect(await cache.get("k2")).toBeUndefined();
  });
});

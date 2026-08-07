import { describe, expect, it } from "vitest";
import { healthKey, ProviderHealth } from "../src/health";

function memoryKv(): { kv: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

describe("ProviderHealth", () => {
  it("keeps returning the preferred provider below the failure threshold", async () => {
    let now = 0;
    const health = new ProviderHealth(() => now);
    expect(await health.primary("gemini")).toBe("gemini");
    await health.recordFailure("gemini");
    expect(await health.primary("gemini")).toBe("gemini");
  });

  it("skips the preferred provider once the threshold is reached", async () => {
    let now = 0;
    const health = new ProviderHealth(() => now);
    await health.recordFailure("gemini");
    await health.recordFailure("gemini");
    expect(await health.primary("gemini")).toBe("groq");
  });

  it("retries the original provider after the cooldown lapses", async () => {
    let now = 0;
    const health = new ProviderHealth(() => now);
    await health.recordFailure("gemini");
    await health.recordFailure("gemini");
    expect(await health.primary("gemini")).toBe("groq");
    now = 60_001;
    expect(await health.primary("gemini")).toBe("gemini");
  });

  it("resets after a successful call", async () => {
    let now = 0;
    const health = new ProviderHealth(() => now);
    await health.recordFailure("gemini");
    await health.recordFailure("gemini");
    await health.recordSuccess("gemini");
    expect(await health.primary("gemini")).toBe("gemini");
  });

  it("tracks providers independently", async () => {
    let now = 0;
    const health = new ProviderHealth(() => now);
    await health.recordFailure("groq");
    expect(await health.primary("groq")).toBe("groq");
    expect(await health.primary("gemini")).toBe("gemini");
  });

  it("persists breaker state in KV across instances", async () => {
    const { kv, store } = memoryKv();
    let now = 0;
    const first = new ProviderHealth(() => now);
    const second = new ProviderHealth(() => now);

    await first.recordFailure("gemini", kv);
    await first.recordFailure("gemini", kv);
    expect(store.get(healthKey("gemini"))).toBeDefined();

    const reopened = new ProviderHealth(() => now);
    expect(await reopened.primary("gemini", kv)).toBe("groq");
    expect(await second.primary("gemini", kv)).toBe("groq");
  });

  it("fails open to the preferred provider when KV reads fail", async () => {
    const health = new ProviderHealth(() => 0);
    await health.recordFailure("gemini");
    await health.recordFailure("gemini");
    const kv = {
      async get() {
        throw new Error("kv down");
      },
    } as unknown as KVNamespace;
    expect(await health.primary("gemini", kv)).toBe("gemini");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Upstash before importing
vi.mock("@upstash/redis", () => ({ Redis: vi.fn() }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(vi.fn(), { slidingWindow: vi.fn() }),
}));

// Force in-memory mode (no UPSTASH env vars)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

describe("rate-limit (in-memory fallback)", () => {
  let rateLimit: (key: string, maxHits: number, windowMs: number) => Promise<{ allowed: boolean; retryAfterMs: number }>;
  let rateLimitReset: (key: string) => Promise<void>;

  beforeEach(async () => {
    // Fresh import each time to reset state
    vi.resetModules();
    const mod = await import("@/lib/rate-limit");
    rateLimit = mod.rateLimit;
    rateLimitReset = mod.rateLimitReset;
  });

  it("allows requests within the limit", async () => {
    const result = await rateLimit("test:a", 3, 60000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("blocks requests exceeding the limit", async () => {
    await rateLimit("test:b", 2, 60000);
    await rateLimit("test:b", 2, 60000);
    const result = await rateLimit("test:b", 2, 60000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("different keys are independent", async () => {
    await rateLimit("test:c1", 1, 60000);
    const result = await rateLimit("test:c2", 1, 60000);
    expect(result.allowed).toBe(true);
  });

  it("rateLimitReset clears the key", async () => {
    await rateLimit("test:d", 1, 60000);
    const blocked = await rateLimit("test:d", 1, 60000);
    expect(blocked.allowed).toBe(false);

    await rateLimitReset("test:d");
    const afterReset = await rateLimit("test:d", 1, 60000);
    expect(afterReset.allowed).toBe(true);
  });

  it("respects maxHits count exactly", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit("test:e", 5, 60000);
      expect(result.allowed).toBe(true);
    }
    const sixth = await rateLimit("test:e", 5, 60000);
    expect(sixth.allowed).toBe(false);
  });
});

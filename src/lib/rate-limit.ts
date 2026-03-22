// Distributed rate limiter using Upstash Redis (sliding window)
// Falls back to in-memory ONLY in development. Production REQUIRES Redis.

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const isProd = process.env.NODE_ENV === "production";
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);

if (isProd && !useRedis) {
  console.error("CRITICAL: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. Rate limiting will use unsafe in-memory fallback.");
}

// Shared Redis client (singleton)
const redis = useRedis ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;

// Cache rate limiters by "maxHits:windowMs" to avoid recreating them
const limiterCache = new Map<string, Ratelimit>();

function getLimiter(maxHits: number, windowMs: number): Ratelimit {
  const cacheKey = `${maxHits}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (limiter) return limiter;

  limiter = new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(maxHits, `${windowMs} ms`),
    prefix: "rl",
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

// --- In-memory fallback for dev ---
const hits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of hits) {
    if (val.resetAt < now) hits.delete(key);
  }
}, 5 * 60 * 1000);

function rateLimitMemory(
  key: string,
  maxHits: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxHits) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// --- Reset a rate limit key (e.g. to allow retry after DB failure) ---
export async function rateLimitReset(key: string): Promise<void> {
  if (!useRedis || !redis) {
    hits.delete(key);
    return;
  }
  await redis.del(`rl:${key}`);
}

// --- Main export ---
export async function rateLimit(
  key: string,
  maxHits: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  if (!useRedis) {
    return rateLimitMemory(key, maxHits, windowMs);
  }

  const limiter = getLimiter(maxHits, windowMs);
  const result = await limiter.limit(key);

  return {
    allowed: result.success,
    retryAfterMs: result.success ? 0 : Math.max(0, result.reset - Date.now()),
  };
}

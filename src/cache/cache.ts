import { env } from "../config/env.js";
import { getRedisClient } from "./redisClient.js";
import { childLogger } from "../logger.js";

const log = childLogger("cache");

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Reads a cached JSON value by key, trying Redis first (if connected)
 * and falling back to the in-process memory store. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch (err) {
      log.debug({ err }, "Redis GET failed, falling back to memory cache");
    }
  }
  const raw = memoryGet(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Writes a JSON-serializable value to cache with a TTL, mirrored into both
 * Redis and the memory store so lookups stay warm even if Redis drops. */
export async function cacheSet<T>(key: string, value: T, ttlSeconds = env.CACHE_TTL_SECONDS): Promise<void> {
  const serialized = JSON.stringify(value);
  memorySet(key, serialized, ttlSeconds);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, serialized, "EX", ttlSeconds);
    } catch (err) {
      log.debug({ err }, "Redis SET failed, value cached in memory only");
    }
  }
}

/** Fetches from cache, or computes and caches the value on a miss. This is
 * the primary entry point tools should use to avoid re-querying Exa/parsing
 * pages for identical requests within the TTL window. */
export async function cacheOrCompute<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const value = await compute();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export function buildCacheKey(namespace: string, params: Record<string, unknown>): string {
  const sortedEntries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `induss:${namespace}:${JSON.stringify(sortedEntries)}`;
}

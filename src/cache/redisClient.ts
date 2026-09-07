import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { childLogger } from "../logger.js";

const log = childLogger("redis");

let client: Redis | null = null;
let connectionFailed = false;

/** Lazily creates a shared ioredis client. Connection failures are logged
 * and swallowed rather than crashing the process — the Cache layer falls
 * back to in-memory storage when Redis is unavailable, since caching is a
 * performance optimization, not a correctness requirement. */
export function getRedisClient(): Redis | null {
  if (connectionFailed) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1000)),
    lazyConnect: true,
  });

  client.on("error", (err: Error) => {
    log.warn({ err: err.message }, "Redis connection error");
  });

  client.connect().catch((err: Error) => {
    log.warn({ err: err.message }, "Redis unavailable, falling back to in-memory cache");
    connectionFailed = true;
    client = null;
  });

  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}

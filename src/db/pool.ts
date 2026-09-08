import pg from "pg";
import { env } from "../config/env.js";
import { childLogger } from "../logger.js";

const log = childLogger("db");
const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Postgres is optional per the project spec (used for caching/history).
 * The pool is created lazily and only if DATABASE_URL is configured, so the
 * server can run with Redis-only caching when no database is provisioned. */
export function getPool(): pg.Pool | null {
  if (!env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    pool.on("error", (err) => log.warn({ err: err.message }, "Postgres pool error"));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured; Postgres history is disabled.");
  return p.query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

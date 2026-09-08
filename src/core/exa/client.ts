import { env } from "../../config/env.js";
import { withRetry } from "../../utils/retry.js";
import { RateLimiter } from "../../utils/rateLimiter.js";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const rateLimiter = new RateLimiter(env.EXA_REQUESTS_PER_MINUTE);

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Raw, low-level POST to the Exa /search REST endpoint: auth header, rate
 * limiting, retry-on-429/5xx. No domain-routing or result-shaping logic
 * lives here — see search.ts for that. */
export async function postExaSearch<TResponse>(body: Record<string, unknown>): Promise<TResponse> {
  await rateLimiter.acquire();

  return withRetry(
    async () => {
      const res = await fetch(EXA_SEARCH_URL, {
        method: "POST",
        headers: {
          "x-api-key": env.EXA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const error = new Error(`Exa search failed: ${res.status} ${res.statusText} - ${text}`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }
      return (await res.json()) as TResponse;
    },
    {
      retries: 3,
      isRetryable: (err) => {
        const status = (err as Error & { status?: number }).status;
        return status === undefined || isRetryableStatus(status);
      },
    },
  );
}

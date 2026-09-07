import { fetchDocument } from "../pipeline/fetchDocument.js";
import { childLogger } from "../../logger.js";
import type { ExaSearchResultItem } from "../../types/common.js";

const log = childLogger("screenerLookup");

const SCREENER_SLUG_REGEX = /screener\.in\/company\/([A-Za-z0-9.&-]+)\/?/i;

/** Finds a screener.in company-page URL among a set of search results and
 * pulls out its ticker slug (e.g. "ETERNAL" from
 * "https://www.screener.in/company/ETERNAL/consolidated/"). We deliberately
 * don't try to guess the slug from the company name ourselves — tickers
 * frequently diverge from the legal/brand name (Zomato Limited trades, and
 * is listed on screener, as "ETERNAL" post-rebrand) — so Exa's own search
 * result is the source of truth for the slug, not a name transformation
 * we'd have to keep in sync by hand. */
export function findScreenerSlug(results: ExaSearchResultItem[]): string | null {
  for (const r of results) {
    const match = r.url.match(SCREENER_SLUG_REGEX);
    if (match) return match[1];
  }
  return null;
}

/** Fetches a screener.in company page for the given slug, preferring the
 * consolidated (group-level) financials view and falling back to the
 * standalone view when consolidated isn't published for that company
 * (common for companies without subsidiaries). Returns null if both
 * variants fail (rate-limited, slug wrong, or screener down) — callers
 * fall back to the generic extraction path. */
export async function fetchScreenerPage(slug: string): Promise<string | null> {
  const base = `https://www.screener.in/company/${encodeURIComponent(slug)}`;
  for (const path of [`${base}/consolidated/`, `${base}/`]) {
    const doc = await fetchDocument(path, 12_000);
    if (doc?.contentType === "html" && doc.html && doc.html.includes('section id="profit-loss"')) {
      return doc.html;
    }
  }
  log.debug({ slug }, "screener.in fetch failed for both consolidated and standalone variants");
  return null;
}

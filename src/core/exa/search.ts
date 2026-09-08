import { childLogger } from "../../logger.js";
import { postExaSearch } from "./client.js";
import { buildContentsOption } from "./contents.js";
import type { ExaSearchResultItem } from "../../types/common.js";

const log = childLogger("exaSearch");

export interface ExaSearchParams {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  type?: "instant" | "fast" | "auto" | "deep-lite" | "deep" | "deep-reasoning";
}

interface ExaApiResult {
  title: string | null;
  url: string;
  publishedDate: string | null;
  author: string | null;
  id: string;
  text?: string;
}

interface ExaApiResponse {
  results: ExaApiResult[];
}

/** Domain-restricted Exa search: the single entry point every provider and
 * tool uses to query Exa. Wraps the raw client (client.ts) with request
 * shaping and result normalization into this server's common item shape. */
export async function exaSearch(params: ExaSearchParams): Promise<ExaSearchResultItem[]> {
  const body = {
    query: params.query,
    numResults: params.numResults ?? 10,
    type: params.type ?? "auto",
    ...(params.includeDomains?.length ? { includeDomains: params.includeDomains } : {}),
    ...(params.excludeDomains?.length ? { excludeDomains: params.excludeDomains } : {}),
    ...(params.startPublishedDate ? { startPublishedDate: params.startPublishedDate } : {}),
    ...(params.endPublishedDate ? { endPublishedDate: params.endPublishedDate } : {}),
    contents: buildContentsOption(),
  };

  const response = await postExaSearch<ExaApiResponse>(body).catch((err) => {
    log.error({ err, query: params.query }, "Exa search failed after retries");
    throw err;
  });

  return response.results.map((r) => ({
    url: r.url,
    title: r.title ?? r.url,
    publishedDate: r.publishedDate ?? null,
    author: r.author ?? null,
    text: r.text ?? "",
    score: 0,
  }));
}

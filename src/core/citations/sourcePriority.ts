import { findSourceForHostname } from "../../sources/index.js";
import type { SourceTier } from "../../sources/types.js";

/** Base trust score per tier, from most to least authoritative — the
 * Source Priority Engine's ladder:
 * Official Filing > Government > Annual Report > Industry Reports >
 * Official Company > News > Blogs. */
const TIER_BASE_SCORE: Record<SourceTier, number> = {
  official_filing: 0.98,
  government: 0.95,
  annual_report: 0.93,
  industry_report: 0.88,
  official_company: 0.85,
  news: 0.8,
  blog: 0.6,
};

const UNKNOWN_SOURCE_TIER: SourceTier = "blog";
const UNKNOWN_SOURCE_AUTHORITY = 0.6;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Recency decays trust for older documents: a five-year-old market report
 * is worth less than one from last quarter, even from the same source.
 * Returns a 0-0.15 penalty subtracted from the raw tier/authority score. */
function computeRecencyPenalty(publishedDate: string | null): number {
  if (!publishedDate) return 0.05;
  const ageDays = (Date.now() - new Date(publishedDate).getTime()) / 86_400_000;
  if (Number.isNaN(ageDays) || ageDays < 0) return 0.05;
  if (ageDays > 365 * 3) return 0.15;
  if (ageDays > 365) return 0.05;
  return 0;
}

export interface SourceScore {
  hostname: string;
  tier: SourceTier;
  authority: number;
  recencyPenalty: number;
  confidenceScore: number;
}

/** Scores a single source document by looking up which registered source
 * profile owns its domain (if any) for Tier + Authority, then applying a
 * Recency penalty to produce the final Confidence score. Domains not owned
 * by any registered source profile fall back to the lowest ("blog") tier
 * with reduced authority instead of being trusted by default — every
 * citation is scored, none are trusted purely by presence in results. */
export function scoreSource(url: string, publishedDate: string | null): SourceScore {
  const hostname = hostnameOf(url);
  const profile = findSourceForHostname(hostname);

  const tier = profile?.tier ?? UNKNOWN_SOURCE_TIER;
  const authority = profile?.confidence ?? UNKNOWN_SOURCE_AUTHORITY;
  const recencyPenalty = computeRecencyPenalty(publishedDate);

  const raw = (TIER_BASE_SCORE[tier] + authority) / 2 - recencyPenalty;
  const confidenceScore = Math.round(Math.max(0.3, Math.min(0.99, raw)) * 100) / 100;

  return { hostname, tier, authority, recencyPenalty, confidenceScore };
}

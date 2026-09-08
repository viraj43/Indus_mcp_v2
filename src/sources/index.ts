import { MCA_PROFILE } from "./mca/index.js";
import { SEC_PROFILE } from "./sec/index.js";
import { COMPANY_PROFILE } from "./company/index.js";
import { GOVERNMENT_PROFILE } from "./government/index.js";
import { MACRO_PROFILE } from "./macro/index.js";
import { NEWS_PROFILE } from "./news/index.js";
import { INDUSTRY_PROFILE } from "./industry/index.js";
import { EXCHANGE_PROFILE } from "./exchange/index.js";
import { REGULATOR_PROFILE } from "./regulator/index.js";
import { LEGAL_MEDIA_PROFILE } from "./legalMedia/index.js";
import { FINANCIAL_DATA_PROFILE } from "./financialData/index.js";
import { PRIVATE_DATA_PROFILE } from "./privateData/index.js";
import { SOCIAL_SENTIMENT_PROFILE } from "./socialSentiment/index.js";
import { STARTUP_MEDIA_PROFILE } from "./startupMedia/index.js";
import type { SourceProfile } from "./types.js";

export type { SourceProfile, SourceTier, SearchTemplate } from "./types.js";

/** Registry of every research source. Each source is fully self-contained
 * (domains, query templates, trust metadata); core/router/source-router.ts
 * aggregates across sources to resolve a research objective into a
 * concrete Exa `includeDomains` filter, and core/citations/sourcePriority.ts
 * uses each profile's tier + confidence to score citations. Adding a new
 * source means adding a profile here, not editing the router or the
 * citation engine. */
export const SOURCES = {
  mca: MCA_PROFILE,
  sec: SEC_PROFILE,
  company: COMPANY_PROFILE,
  government: GOVERNMENT_PROFILE,
  macro: MACRO_PROFILE,
  news: NEWS_PROFILE,
  industry: INDUSTRY_PROFILE,
  exchange: EXCHANGE_PROFILE,
  regulator: REGULATOR_PROFILE,
  legalMedia: LEGAL_MEDIA_PROFILE,
  financialData: FINANCIAL_DATA_PROFILE,
  privateData: PRIVATE_DATA_PROFILE,
  socialSentiment: SOCIAL_SENTIMENT_PROFILE,
  startupMedia: STARTUP_MEDIA_PROFILE,
} as const satisfies Record<string, SourceProfile>;

export type SourceName = keyof typeof SOURCES;

/** Reverse lookup: domain -> the source profile that owns it. Built once
 * at module load since the source set is static at runtime. */
export const DOMAIN_TO_SOURCE: ReadonlyMap<string, SourceProfile> = new Map(
  Object.values(SOURCES).flatMap((profile) => profile.domains.map((domain) => [domain, profile] as const)),
);

/** Resolves a hostname to its owning source profile, matching exactly
 * first and then walking up subdomain segments (e.g. "uk.linkedin.com" or
 * "sg.linkedin.com" both resolve to the "company" profile's
 * "linkedin.com" entry) so regional/localized subdomains of a registered
 * source aren't scored as untrusted just because they weren't listed
 * verbatim. */
export function findSourceForHostname(hostname: string): SourceProfile | undefined {
  const exact = DOMAIN_TO_SOURCE.get(hostname);
  if (exact) return exact;

  const parts = hostname.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join(".");
    const match = DOMAIN_TO_SOURCE.get(parentDomain);
    if (match) return match;
  }
  return undefined;
}

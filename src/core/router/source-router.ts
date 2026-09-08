import { SOURCES } from "../../sources/index.js";
import { resolveSources } from "./objective-router.js";
import type { ResearchContext } from "../../types/context.js";

export interface RouteResult {
  sources: ReturnType<typeof resolveSources>;
  includeDomains: string[];
}

/** Resolves a ResearchContext into the concrete domain allowlist Exa
 * should search within, by aggregating the domains owned by each source
 * profile relevant to `context.objective`. This keeps every tool from
 * hardcoding its own source list and lets routing policy evolve in one
 * place (objective-router.ts) without touching source definitions. The
 * same context always resolves to the same domains — this is what makes
 * a tool call deterministic. */
export function routeSources(context: ResearchContext): RouteResult {
  const sourceNames = resolveSources(context.objective);
  const domainSet = new Set<string>();

  for (const sourceName of sourceNames) {
    for (const domain of SOURCES[sourceName].domains) domainSet.add(domain);
  }

  if (context.companyDomain && (context.objective === "company_overview" || context.objective === "financials")) {
    domainSet.add(context.companyDomain);
  }

  if (context.objective === "financials" && context.listed === "unlisted") {
    for (const domain of SOURCES.mca.domains) domainSet.add(domain);
    for (const domain of SOURCES.company.domains) domainSet.add(domain);
    // Every other unlisted-financials source (Zaubacorp, Tofler,
    // Craft.co, Owler, Dealroom) is bot-walled or paywalled for
    // automated access — startupMedia (Entrackr/Inc42/YourStory, which
    // specifically digest RoC filings into news coverage) is the one
    // freely-reachable channel for real, if press-reported, figures. See
    // sources/startupMedia/index.ts.
    for (const domain of SOURCES.startupMedia.domains) domainSet.add(domain);
  }

  return { sources: sourceNames, includeDomains: Array.from(domainSet) };
}

import type { SourceProfile } from "../types.js";

/** Scaffolded for future US/global listed-company filings support
 * (10-K/10-Q via EDGAR). Not yet wired into any research objective. */
export const SEC_PROFILE: SourceProfile = {
  name: "sec",
  domains: ["sec.gov"],
  searchTemplates: {
    filings: (company) => `${company} 10-K 10-Q annual report SEC filing`,
  },
  confidence: 0.95,
  tier: "official_filing",
  supportsPDF: true,
  supportsHTML: true,
};

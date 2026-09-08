import type { SourceProfile } from "../types.js";

/** Company self-representation and professional-network sources: used for
 * narrative overview facts rather than registry/financial data. */
export const COMPANY_PROFILE: SourceProfile = {
  name: "company",
  domains: ["linkedin.com", "crunchbase.com"],
  searchTemplates: {
    discovery: (company) => `${company} company official website profile`,
    overview: (company) => `${company} company overview business description products services target market`,
    management: (company) => `${company} management team leadership executives founders`,
    subsidiaries: (company) => `${company} subsidiaries group companies holdings`,
    funding: (company) => `${company} funding round investors valuation raised million`,
  },
  confidence: 0.75,
  tier: "official_company",
  supportsPDF: false,
  supportsHTML: true,
};

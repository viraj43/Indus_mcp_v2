import type { SourceProfile } from "../types.js";

/** Indian company registry / filings sources: Ministry of Corporate
 * Affairs and the registry-data aggregators built on top of it. */
export const MCA_PROFILE: SourceProfile = {
  name: "mca",
  domains: ["mca.gov.in", "zaubacorp.com", "tofler.in", "opencorporates.com", "indiafilings.com"],
  searchTemplates: {
    registryProfile: (company) => `${company} CIN registration number incorporation date registered office directors`,
    filings: (company) => `${company} annual report financial statements revenue net profit balance sheet EBITDA`,
    funding: (company) => `${company} funding round investors valuation raised million`,
    litigation: (company) => `${company} litigation case court order regulatory action`,
  },
  confidence: 0.95,
  tier: "official_filing",
  supportsPDF: true,
  supportsHTML: true,
};

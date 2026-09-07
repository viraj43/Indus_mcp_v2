import type { SourceProfile } from "../types.js";

/** Indian stock exchange filings: the primary source for a listed
 * company's annual reports and investor-relations disclosures — more
 * authoritative than third-party registry aggregators (see
 * sources/mca) for anything a listed company has filed with the exchange. */
export const EXCHANGE_PROFILE: SourceProfile = {
  name: "exchange",
  domains: ["nseindia.com", "bseindia.com"],
  searchTemplates: {
    listedFilings: (company) => `${company} annual report PDF investor relations`,
  },
  confidence: 0.97,
  tier: "official_filing",
  supportsPDF: true,
  supportsHTML: true,
};

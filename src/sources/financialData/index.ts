import type { SourceProfile } from "../types.js";

/** Financial-data and analytics platforms that surface exchange-filed
 * numbers in structured form (results, shareholding pattern, peer
 * screens) — a step more processed than reading the raw filing off
 * sources/exchange, but still ultimately derived from it. */
export const FINANCIAL_DATA_PROFILE: SourceProfile = {
  name: "financialData",
  domains: ["screener.in", "trendlyne.com", "aceanalyser.com", "capitaliq.spglobal.com"],
  searchTemplates: {
    peerComparison: (subject) => `${subject} financial results shareholding pattern peer comparison`,
    marketData: (subject) => `${subject} share price market cap`,
  },
  confidence: 0.85,
  tier: "annual_report",
  supportsPDF: false,
  supportsHTML: true,
};

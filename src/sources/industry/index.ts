import type { SourceProfile } from "../types.js";

/** Added beyond the originally-scoped provider set (mca/sec/company/
 * government/macro/news) so industry_overview, market_size, and
 * discover_competitors keep working: top-tier consulting/analyst research
 * sources. */
export const INDUSTRY_PROFILE: SourceProfile = {
  name: "industry",
  domains: [
    "deloitte.com",
    "pwc.com",
    "ey.com",
    "kpmg.com",
    "mckinsey.com",
    "bain.com",
    "bcg.com",
    "imarcgroup.com",
    "statista.com",
    "nasscom.in",
  ],
  searchTemplates: {
    overview: (sector) => `${sector} industry overview market structure key players growth drivers`,
    marketSize: (sector) => `${sector} market size CAGR forecast`,
    trends: (sector) => `${sector} industry trends outlook`,
    competitors: (company) => `${company} competitors rivals market comparison`,
  },
  confidence: 0.9,
  tier: "industry_report",
  supportsPDF: true,
  supportsHTML: true,
};

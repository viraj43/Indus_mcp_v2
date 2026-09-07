import type { SourceProfile } from "../types.js";

export const NEWS_PROFILE: SourceProfile = {
  name: "news",
  domains: ["reuters.com", "economictimes.indiatimes.com", "livemint.com", "business-standard.com", "moneycontrol.com"],
  searchTemplates: {
    latest: (company) => `${company} news`,
    sentiment: (company) =>
      `${company} fraud OR lawsuit OR investigation OR scam OR default OR penalty OR layoffs`,
    competitors: (company) => `${company} competitors rivals market comparison`,
    litigation: (company) => `${company} lawsuit court case litigation`,
  },
  confidence: 0.85,
  tier: "news",
  supportsPDF: false,
  supportsHTML: true,
};

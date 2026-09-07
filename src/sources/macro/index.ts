import type { SourceProfile } from "../types.js";

/** Hard macroeconomic data sources: central bank + multilateral
 * institutions publishing GDP, inflation, and rate data. */
export const MACRO_PROFILE: SourceProfile = {
  name: "macro",
  domains: ["rbi.org.in", "imf.org", "worldbank.org", "mospi.gov.in"],
  searchTemplates: {
    gdp: (country) => `${country} GDP growth rate`,
    inflation: (country) => `${country} inflation rate CPI`,
    interestRates: (country) => `${country} interest rate policy repo rate`,
  },
  confidence: 0.97,
  tier: "government",
  supportsPDF: true,
  supportsHTML: true,
};

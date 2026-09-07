import type { SourceProfile } from "../types.js";

/** Non-macro-data government/policy sources: ministries and planning
 * bodies. See sources/macro for hard macroeconomic data sources. */
export const GOVERNMENT_PROFILE: SourceProfile = {
  name: "government",
  domains: ["finmin.gov.in", "niti.gov.in"],
  searchTemplates: {
    policy: (country) => `${country} government economic policy announcement`,
  },
  confidence: 0.9,
  tier: "government",
  supportsPDF: true,
  supportsHTML: true,
};

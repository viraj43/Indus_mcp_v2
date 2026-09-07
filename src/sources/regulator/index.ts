import type { SourceProfile } from "../types.js";

/** Indian financial/corporate regulators (beyond MCA's company registry
 * and RBI's macro role): securities and insolvency regulators whose
 * records are the primary source for enforcement actions. */
export const REGULATOR_PROFILE: SourceProfile = {
  name: "regulator",
  domains: ["sebi.gov.in", "nclt.gov.in"],
  searchTemplates: {
    litigation: (subject) =>
      `${subject} litigation OR lawsuit OR SEBI OR RBI OR NCLT OR fraud OR penalty OR insolvency OR "disqualified director"`,
    promoterCheck: (subject) => `${subject} disqualified director SEBI debarred penalty order`,
  },
  confidence: 0.95,
  tier: "government",
  supportsPDF: true,
  supportsHTML: true,
};

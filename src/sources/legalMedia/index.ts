import type { SourceProfile } from "../types.js";

/** Legal-journalism and case-law repositories — not regulators
 * themselves, but the primary place court orders and litigation coverage
 * actually get indexed and made searchable. */
export const LEGAL_MEDIA_PROFILE: SourceProfile = {
  name: "legalMedia",
  domains: ["indiankanoon.org", "livelaw.in", "barandbench.com"],
  searchTemplates: {
    litigation: (subject) => `${subject} court case judgment litigation order`,
  },
  confidence: 0.85,
  tier: "news",
  supportsPDF: false,
  supportsHTML: true,
};

import type { SourceProfile } from "../types.js";

/** User-generated sentiment sources: employee reviews and public
 * discussion, not journalism or regulatory record — the lowest-trust tier
 * by design, useful only as a soft signal alongside negative_news's
 * regular press screen. */
export const SOCIAL_SENTIMENT_PROFILE: SourceProfile = {
  name: "socialSentiment",
  domains: ["glassdoor.com", "reddit.com"],
  searchTemplates: {
    sentiment: (subject) => `${subject} complaint OR controversy OR scam OR "employee review"`,
  },
  confidence: 0.55,
  tier: "blog",
  supportsPDF: false,
  supportsHTML: true,
};

import type { SourceProfile } from "../types.js";

/** Business-media outlets that specifically buy and digest RoC/MCA filings
 * (Form AOC-4 annual financial statements) for unlisted/private companies
 * and publish the revenue/loss/growth figures as news — Entrackr and
 * Inc42 in particular run this as a recurring editorial beat ("X's
 * revenue crosses ₹Y Cr in FYnn"). This exists as its own source profile
 * (rather than folding into the generic `news` profile) because every
 * other private-company financial-data provider already in this server's
 * source set (Zaubacorp, Tofler, Craft.co, Owler, Dealroom — see mca/
 * privateData) is bot-walled or paywalled for automated access: MCA
 * itself charges per-document and requires a payment session, and the
 * commercial aggregators sit behind Cloudflare challenges that survive
 * even a real headless browser. This is the one channel that's both free
 * and reliably reachable — at the cost of the figures being a press
 * digest of a filing rather than the filing itself, which is why
 * financial_statements.ts surfaces anything sourced from here as
 * `status: "estimate_only"`, never blended into the audited-grade
 * `FinancialStatement[]` shape screener.in/exchange filings produce. */
export const STARTUP_MEDIA_PROFILE: SourceProfile = {
  name: "startupMedia",
  domains: ["entrackr.com", "inc42.com", "yourstory.com"],
  searchTemplates: {
    financialsDigest: (company) => `${company} revenue FY loss RoC filing annual financial results`,
  },
  confidence: 0.78,
  tier: "news",
  supportsPDF: false,
  supportsHTML: true,
};

import { z } from "zod";
import type { ResearchObjective } from "../core/router/objective-router.js";

const RESEARCH_OBJECTIVES = [
  "company_overview",
  "financials",
  "funding",
  "industry",
  "macro",
  "news",
  "sentiment",
  "litigation",
  "promoters",
  "competitors",
] as const satisfies readonly ResearchObjective[];

export const ResearchObjectiveSchema = z.enum(RESEARCH_OBJECTIVES);

/** The one shape every research-oriented tool builds its query around,
 * instead of each tool inventing its own bag of ad hoc parameters
 * (companyName, geography, listingStatus, industry, ...). Threading the
 * same context through router → pipeline → engines is what makes a given
 * tool call deterministic: the same context always resolves to the same
 * sources and the same query. */
export const ResearchContextSchema = z.object({
  company: z.string().optional().describe("Company name, when the research subject is a company"),
  companyDomain: z.string().optional().describe("Company's own website domain, e.g. acme.com"),
  sector: z.string().optional().describe("Industry/sector name, when the research subject is a sector rather than a single company"),
  country: z.enum(["india", "global"]).default("india"),
  listed: z.enum(["listed", "unlisted", "unknown"]).default("unknown"),
  objective: ResearchObjectiveSchema,
  date: z
    .string()
    .optional()
    .describe("As-of date (ISO 8601) for the research; defaults to now")
    .default(() => new Date().toISOString()),
});

export type ResearchContext = z.infer<typeof ResearchContextSchema>;

/** The caller-facing subset of ResearchContext: `objective` is dropped
 * because it's intrinsic to which tool was called, not something the LLM
 * should have to (re)supply — each tool fills it in before handing the
 * context to the search pipeline. */
export const ResearchContextInputSchema = ResearchContextSchema.omit({ objective: true });

export type ResearchContextInput = z.infer<typeof ResearchContextInputSchema>;

/** Fills in a tool's fixed objective to turn caller input into a full
 * ResearchContext ready for the router/pipeline. */
export function withObjective(input: ResearchContextInput, objective: ResearchObjective): ResearchContext {
  return { ...input, objective };
}

import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { screenRedFlags } from "../../core/financial/redFlagEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const redFlagScreenMeta: ToolMeta = {
  name: "red_flag_screen",
  category: "valuation",
  description: "Tallies already-gathered evidence (litigation, negative press, plausibility issues, promoter hits) into a severity-bucketed flag list.",
  inputs: ["litigationCases?", "negativeNewsCount?", "plausibilityIssuesByPeriod?", "promoterRegulatoryHits?", "monthsSinceLastFunding?"],
  outputs: ["flags[]", "overallSeverity"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 10,
};

const litigationCaseSchema = z.object({
  title: z.string(),
  url: z.string(),
  caseReference: z.string().nullable(),
  regulatorsMentioned: z.array(z.string()),
});

const plausibilityIssueSchema = z.object({
  field: z.string(),
  message: z.string(),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  litigationCases: z.array(litigationCaseSchema).optional().describe("Pass through the `cases` array from litigation_history's output"),
  negativeNewsCount: z.number().int().nonnegative().optional().describe("Count of entity-matched hits from negative_news's output"),
  plausibilityIssuesByPeriod: z
    .record(z.string(), z.array(plausibilityIssueSchema))
    .optional()
    .describe("Pass through metadata.plausibilityIssues from ratio_analysis/financial_statements"),
  promoterRegulatoryHits: z.number().int().nonnegative().optional().describe("Count of disqualification/regulatory hits you found in promoter_background's output"),
  monthsSinceLastFunding: z.number().nonnegative().optional(),
});

export function registerRedFlagScreenTool(server: FastMCP): void {
  server.addTool({
    name: "red_flag_screen",
    description:
      "Aggregates evidence you've already gathered from other tools this session — litigation_history's cases, negative_news's hit count, ratio_analysis/financial_statements' plausibility issues, and any promoter regulatory-hit count you derived from promoter_background — into a single severity-bucketed flag list (low/medium/high, plus an overall severity). Every flag traces to a count or record you supplied from a real source; this tool invents no new evidence and renders no investment verdict. All inputs are optional — pass whichever you have; omitted categories simply contribute no flags.",
    parameters: paramsSchema,
    annotations: { title: "Red Flag Screen", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const result = screenRedFlags(args);
        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...result },
          citations: [],
          confidence: 1,
          metadata: {
            calculationMethod: "deterministic-tally",
            note: "This is a tally of evidence you supplied, not an independent investigation — a 'clean' result means no flags were raised by the inputs given, not that none exist.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { computeRatioSet, computeTrend, type FinancialStatement } from "../../core/financial/financialEngine.js";
import { checkFinancialPlausibility, type PlausibilityIssue } from "../../core/quality/validationEngine.js";
import { FinancialStatementSchema } from "../../types/schemas.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const ratioAnalysisMeta: ToolMeta = {
  name: "ratio_analysis",
  category: "financial",
  description: "Deterministic ratio analysis and multi-period CAGR trend over FinancialStatement objects.",
  inputs: ["statements[]"],
  outputs: ["ratios[]", "trend"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 50,
};

const paramsSchema = z.object({
  companyName: z.string().optional(),
  statements: z
    .array(FinancialStatementSchema)
    .min(1)
    .describe("Chronologically ordered (oldest first) financial statements, e.g. from the financial_statements tool"),
});

const LEAF_FIELDS_PER_STATEMENT = 6 /* income statement */ + 7 /* balance sheet */ + 2 /* cash flow */;

function countDefinedLeafFields(statement: FinancialStatement): number {
  const leaves = [
    ...Object.values(statement.incomeStatement),
    ...Object.values(statement.balanceSheet),
    ...Object.values(statement.cashFlow),
  ];
  return leaves.filter((v) => v !== undefined).length;
}

export function registerRatioAnalysisTool(server: FastMCP): void {
  server.addTool({
    name: "ratio_analysis",
    description:
      "Performs deterministic financial ratio analysis (profitability, liquidity, leverage, returns) plus multi-period CAGR trend over a set of FinancialStatement objects (Income Statement / Balance Sheet / Cash Flow). Pure calculation — no search, no LLM tokens.",
    parameters: paramsSchema,
    annotations: { title: "Ratio Analysis", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const ratioSets = args.statements.map(computeRatioSet);
        const trend = computeTrend(args.statements);

        const plausibilityIssues: Record<string, PlausibilityIssue[]> = {};
        for (const statement of args.statements) {
          const issues = checkFinancialPlausibility(statement);
          if (issues.length > 0) plausibilityIssues[statement.period] = issues;
        }

        const fieldsPresent = args.statements.reduce((sum, s) => sum + countDefinedLeafFields(s), 0);
        const maxFields = args.statements.length * LEAF_FIELDS_PER_STATEMENT;
        const dataCompleteness = Math.round((fieldsPresent / maxFields) * 100) / 100;
        const hasPlausibilityIssues = Object.keys(plausibilityIssues).length > 0;

        return buildResponse({
          success: true,
          data: {
            companyName: args.companyName,
            ratios: ratioSets,
            trend,
          },
          citations: [],
          confidence: hasPlausibilityIssues ? Math.min(dataCompleteness, 0.5) : dataCompleteness,
          metadata: {
            calculationMethod: "deterministic",
            dataCompleteness,
            plausibilityIssues: hasPlausibilityIssues ? plausibilityIssues : undefined,
            note: "Confidence reflects input data completeness, not source reliability (this tool performs no external lookups).",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

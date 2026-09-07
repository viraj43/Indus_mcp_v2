import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runDcf, validateAssumptions, type DcfAssumptions } from "../../core/financial/dcfEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const dcfValuationMeta: ToolMeta = {
  name: "dcf_valuation",
  category: "valuation",
  description: "Mechanical discounted-cash-flow valuation from explicit, caller-supplied assumptions. Pure calculation, no search.",
  inputs: ["assumptions"],
  outputs: ["projections[]", "enterpriseValue", "equityValue", "fairValuePerShare"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 20,
};

const numberOrPath = z.union([z.number(), z.array(z.number())]);

const assumptionsSchema = z.object({
  baseRevenue: z.number().positive(),
  revenueGrowthPath: z.array(z.number()).min(1).describe("One decimal growth rate per forecast year, oldest first, e.g. [0.15, 0.12, 0.10, 0.08, 0.06]"),
  ebitdaMarginPath: z.array(z.number()).min(1).describe("One decimal EBITDA margin per forecast year, same length as revenueGrowthPath"),
  daPctRevenue: numberOrPath.describe("D&A as a decimal % of revenue — single value or one per year"),
  capexPctRevenue: numberOrPath.describe("Capex as a decimal % of revenue — single value or one per year"),
  incrementalNwcPctRevenueChange: numberOrPath.describe("Incremental NWC as a decimal % of the YoY revenue change — single value or one per year"),
  taxRate: z.number().min(0).max(1),
  wacc: z.number().min(0).max(1).describe("Discount rate as a decimal, e.g. 0.11 for 11%"),
  terminalGrowthRate: z.number().describe("Perpetuity growth rate as a decimal; must be less than wacc"),
  netDebt: z.number().describe("Total debt minus cash as of the valuation date"),
  sharesOutstanding: z.number().positive().optional(),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  assumptions: assumptionsSchema,
});

export function registerDcfValuationTool(server: FastMCP): void {
  server.addTool({
    name: "dcf_valuation",
    description:
      "Runs a mechanical, transparent discounted-cash-flow valuation from assumptions the caller (you) supplies explicitly — revenue growth path, EBITDA margin path, D&A/capex/NWC as % of revenue, tax rate, WACC, terminal growth rate, net debt. This tool does not forecast, guess, or default any of these — you should reason about realistic assumptions from the company's own financials (financial_statements, ratio_analysis) and sector context before calling it, and every assumption you pass is echoed back in the output so the reasoning stays auditable. If wacc <= terminalGrowthRate or another structural issue exists, the `issues` field reports it instead of returning a distorted number. This tool computes; it does not render a verdict — pair its output with your own investment-thesis section marked metadata.kind = \"ai_interpretation\" (see generate_report) rather than treating fairValuePerShare as advice.",
    parameters: paramsSchema,
    annotations: { title: "DCF Valuation", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const issues = validateAssumptions(args.assumptions);
        const result = runDcf(args.assumptions);
        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...result },
          citations: [],
          confidence: issues.length > 0 ? 0.3 : 1,
          metadata: {
            calculationMethod: "deterministic-dcf",
            note: "confidence here reflects assumption-set internal consistency, not source reliability — this tool performs no external lookups and has no view on whether the assumptions themselves are realistic.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

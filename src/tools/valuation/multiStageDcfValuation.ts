import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runMultiStageDcf, validateAssumptions, type MultiStageDcfAssumptions } from "../../core/financial/dcfEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const multiStageDcfValuationMeta: ToolMeta = {
  name: "multi_stage_dcf_valuation",
  category: "valuation",
  description: "3-stage DCF (explicit forecast -> fade to terminal growth -> terminal value) — the structure real initiating-coverage notes use for a company still far from steady-state growth.",
  inputs: ["assumptions"],
  outputs: ["projections[]", "enterpriseValue", "equityValue", "fairValuePerShare"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 20,
};

const numberOrPath = z.union([z.number(), z.array(z.number())]);

const assumptionsSchema = z.object({
  baseRevenue: z.number().positive(),
  stage1GrowthPath: z.array(z.number()).min(1).describe("Explicit-forecast-stage growth rates, oldest first — e.g. a 10-year path for a company still scaling fast"),
  stage1EbitdaMarginPath: z.array(z.number()).min(1).describe("Explicit-forecast-stage EBITDA margins, same length as stage1GrowthPath"),
  fadeYears: z.number().int().min(0).describe("Years to linearly glide growth from stage1's final rate down to terminalGrowthRate before the terminal value kicks in — 0 skips straight to terminal (equivalent to the single-stage dcf_valuation)"),
  daPctRevenue: numberOrPath,
  capexPctRevenue: numberOrPath,
  incrementalNwcPctRevenueChange: numberOrPath,
  taxRate: z.number().min(0).max(1),
  wacc: z.number().min(0).max(1),
  terminalGrowthRate: z.number(),
  netDebt: z.number(),
  sharesOutstanding: z.number().positive().optional(),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  assumptions: assumptionsSchema,
});

export function registerMultiStageDcfValuationTool(server: FastMCP): void {
  server.addTool({
    name: "multi_stage_dcf_valuation",
    description:
      "Runs a 3-stage DCF: an explicit forecast stage (your stage1GrowthPath/stage1EbitdaMarginPath, however many years you want — a fast-growing company's real initiating-coverage model often runs 8-10 years here, not 5), a fade stage (fadeYears — growth glides linearly from stage 1's final rate down to terminalGrowthRate), then the terminal value. This is the structure ICICI Securities' Vishal Mega Mart note actually uses (a 10-year explicit stage, then a 10-year fade, then terminal) — jumping a fast-growing company straight from year-5 growth to a ~6% terminal rate (what the single-stage dcf_valuation does) understates a name that's genuinely still years from steady-state. Same rules as dcf_valuation: every assumption is caller-supplied and echoed back, nothing is guessed or defaulted, and this computes — it doesn't render a verdict.",
    parameters: paramsSchema,
    annotations: { title: "Multi-Stage DCF Valuation", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const flatEquivalent = {
          baseRevenue: args.assumptions.baseRevenue,
          revenueGrowthPath: args.assumptions.stage1GrowthPath,
          ebitdaMarginPath: args.assumptions.stage1EbitdaMarginPath,
          daPctRevenue: args.assumptions.daPctRevenue,
          capexPctRevenue: args.assumptions.capexPctRevenue,
          incrementalNwcPctRevenueChange: args.assumptions.incrementalNwcPctRevenueChange,
          taxRate: args.assumptions.taxRate,
          wacc: args.assumptions.wacc,
          terminalGrowthRate: args.assumptions.terminalGrowthRate,
          netDebt: args.assumptions.netDebt,
          sharesOutstanding: args.assumptions.sharesOutstanding,
        };
        const issues = validateAssumptions(flatEquivalent);
        const result = runMultiStageDcf(args.assumptions as MultiStageDcfAssumptions);
        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...result },
          citations: [],
          confidence: issues.length > 0 ? 0.3 : 1,
          metadata: {
            calculationMethod: "deterministic-multi-stage-dcf",
            note: "confidence here reflects assumption-set internal consistency, not source reliability — this tool performs no external lookups.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

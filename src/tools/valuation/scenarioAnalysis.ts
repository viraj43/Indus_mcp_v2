import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runScenarioAnalysis, runSensitivityGrid } from "../../core/financial/scenarioEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const scenarioAnalysisMeta: ToolMeta = {
  name: "scenario_analysis",
  category: "valuation",
  description: "Base/Bull/Bear DCF scenarios from caller-supplied deltas, plus an optional 2D sensitivity grid (e.g. WACC x terminal growth).",
  inputs: ["baseAssumptions", "bullDelta", "bearDelta", "sensitivity?"],
  outputs: ["base", "bull", "bear", "sensitivityGrid?"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 30,
};

const numberOrPath = z.union([z.number(), z.array(z.number())]);

const assumptionsSchema = z.object({
  baseRevenue: z.number().positive(),
  revenueGrowthPath: z.array(z.number()).min(1),
  ebitdaMarginPath: z.array(z.number()).min(1),
  daPctRevenue: numberOrPath,
  capexPctRevenue: numberOrPath,
  incrementalNwcPctRevenueChange: numberOrPath,
  taxRate: z.number().min(0).max(1),
  wacc: z.number().min(0).max(1),
  terminalGrowthRate: z.number(),
  netDebt: z.number(),
  sharesOutstanding: z.number().positive().optional(),
});

const deltaSchema = z.object({
  revenueGrowthDelta: z.number().optional().describe("Added to every year of revenueGrowthPath, e.g. +0.03 for a bull case"),
  ebitdaMarginDelta: z.number().optional().describe("Added to every year of ebitdaMarginPath"),
  waccDelta: z.number().optional().describe("Added to wacc"),
  terminalGrowthDelta: z.number().optional().describe("Added to terminalGrowthRate"),
});

const sensitivityAxisSchema = z.object({
  variable: z.enum(["wacc", "terminalGrowthRate"]),
  values: z.array(z.number()).min(1).describe("Absolute values to test for this axis, not deltas"),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  baseAssumptions: assumptionsSchema,
  bullDelta: deltaSchema.default({}),
  bearDelta: deltaSchema.default({}),
  sensitivity: z
    .object({ rowAxis: sensitivityAxisSchema, columnAxis: sensitivityAxisSchema })
    .optional()
    .describe("Optional 2D grid, e.g. rowAxis=wacc values [0.09..0.13], columnAxis=terminalGrowthRate values [0.02..0.05]"),
});

export function registerScenarioAnalysisTool(server: FastMCP): void {
  server.addTool({
    name: "scenario_analysis",
    description:
      "Runs the same mechanical DCF three times — as given (base), and perturbed by bull/bear deltas you supply (e.g. +3% revenue growth and -1% WACC for a bull case) — and optionally builds a 2D sensitivity grid (typically WACC x terminal growth rate) of fair-value outcomes. Like dcf_valuation, this invents no assumptions of its own: you choose the deltas/grid values based on your own read of the company's upside/downside case, and the tool reports each case's own validity issues (e.g. a bear-case WACC bump that breaks wacc > terminalGrowthRate) rather than a distorted number. Pure calculation — no search.",
    parameters: paramsSchema,
    annotations: { title: "Scenario Analysis", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const scenarios = runScenarioAnalysis(args.baseAssumptions, args.bullDelta, args.bearDelta);
        const sensitivityGrid = args.sensitivity
          ? runSensitivityGrid(args.baseAssumptions, args.sensitivity.rowAxis, args.sensitivity.columnAxis)
          : undefined;

        const anyIssues = [scenarios.base, scenarios.bull, scenarios.bear].some((s) => s.issues.length > 0);

        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...scenarios, sensitivityGrid },
          citations: [],
          confidence: anyIssues ? 0.3 : 1,
          metadata: {
            calculationMethod: "deterministic-scenario-dcf",
            note: "confidence reflects assumption-set internal consistency across the three cases, not source reliability.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

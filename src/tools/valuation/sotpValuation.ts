import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runSotpValuation, type SotpSegment } from "../../core/financial/sotpEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const sotpValuationMeta: ToolMeta = {
  name: "sotp_valuation",
  category: "valuation",
  description: "Sum-of-the-Parts valuation for a multi-segment business — each segment valued on its own multiple, summed, then bridged to equity value / per-share.",
  inputs: ["segments[]", "cash", "netDebt", "sharesOutstanding?"],
  outputs: ["segments[]", "totalEnterpriseValue", "equityValue", "fairValuePerShare"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 20,
};

const segmentSchema = z.object({
  name: z.string(),
  metric: z.enum(["EV/EBITDA", "EV/Sales", "EV/Revenue", "P/E", "Direct EV"]),
  multiple: z.number().describe("The multiple to apply — for 'Direct EV' this IS the segment's enterprise value directly, not a multiple"),
  baseValue: z.number().describe("The segment's underlying metric value (e.g. FY28E EBITDA) — ignored for 'Direct EV'"),
  rationale: z.string().optional().describe("Why this multiple was chosen for this segment — e.g. peer set, growth premium/discount — carried through to output for auditability"),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  segments: z.array(segmentSchema).min(1),
  cash: z.number().default(0),
  netDebt: z.number().default(0),
  sharesOutstanding: z.number().positive().optional(),
});

export function registerSotpValuationTool(server: FastMCP): void {
  server.addTool({
    name: "sotp_valuation",
    description:
      "Runs a Sum-of-the-Parts valuation: each business segment gets its own multiple (EV/EBITDA, EV/Sales, EV/Revenue, P/E, or a directly-stated EV), the segment values sum to a total enterprise value, cash is added and net debt subtracted to reach equity value, then divided by shares outstanding for a fair value per share. Use this instead of a single blended DCF/multiple for a company whose segments have genuinely different economics (Motilal Oswal valued PhysicsWallah this way: 50x EV/EBITDA for the online segment, 15x for offline, 1x EV/Sales for other businesses, plus cash). This tool does NOT choose the multiples for you — that's the analyst judgment call; reason about each segment's multiple from real peer multiples (see global_peer_comps / listed_peer_comparison) or your own view, state your rationale in each segment's `rationale` field, and mark the section that presents this as your own valuation call with metadata.kind = \"ai_interpretation\" (see generate_report).",
    parameters: paramsSchema,
    annotations: { title: "Sum-of-the-Parts Valuation", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const result = runSotpValuation(args.segments as SotpSegment[], args.cash, args.netDebt, args.sharesOutstanding);
        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...result },
          citations: [],
          confidence: 1,
          metadata: {
            calculationMethod: "deterministic-sotp",
            note: "confidence reflects arithmetic correctness only — this tool has no view on whether the multiples you supplied are realistic; that judgment is yours to make and disclose.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

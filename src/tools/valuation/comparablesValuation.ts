import { z } from "zod";
import type { FastMCP } from "fastmcp";
import { runComparablesValuation } from "../../core/financial/comparablesEngine.js";
import { buildResponse, errorResponse } from "../../types/common.js";
import type { ToolMeta } from "../../types/toolMeta.js";

export const comparablesValuationMeta: ToolMeta = {
  name: "comparables_valuation",
  category: "valuation",
  description: "Implied valuation range from a peer multiple set (EV/EBITDA, P/E, EV/Sales) applied to the target's own metrics.",
  inputs: ["peers[]", "target"],
  outputs: ["bands[]", "blendedEquityValueRange"],
  requiredSources: [],
  caching: false,
  estimatedRuntimeMs: 20,
};

const peerSchema = z.object({
  name: z.string(),
  evToEbitda: z.number().positive().optional(),
  peRatio: z.number().positive().optional(),
  evToSales: z.number().positive().optional(),
});

const targetSchema = z.object({
  ebitda: z.number().optional(),
  netProfit: z.number().optional(),
  revenue: z.number().optional(),
  netDebt: z.number().optional().describe("Total debt minus cash — used to bridge enterprise-value bands to equity value"),
  sharesOutstanding: z.number().positive().optional(),
});

const paramsSchema = z.object({
  companyName: z.string().optional(),
  peers: z.array(peerSchema).min(1).describe("Peer multiples — e.g. sourced from listed_peer_comparison output or your own research"),
  target: targetSchema,
});

export function registerComparablesValuationTool(server: FastMCP): void {
  server.addTool({
    name: "comparables_valuation",
    description:
      "Applies a supplied set of peer trading multiples (EV/EBITDA, P/E, EV/Sales) to the target company's own financial metrics to derive an implied low/median/high valuation band per multiple type, plus a single blended equity-value range (enterprise-value bands are bridged to equity via netDebt). This tool picks no peers and invents no multiples — pass real peer figures (e.g. from listed_peer_comparison) and it does the banding/blending arithmetic deterministically. A multiple type is silently omitted (see `issues`) if you didn't supply both the peer multiples and the matching target metric — it never guesses a missing input.",
    parameters: paramsSchema,
    annotations: { title: "Comparables Valuation", readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    execute: async (args) => {
      try {
        const result = runComparablesValuation(args.peers, args.target);
        return buildResponse({
          success: true,
          data: { companyName: args.companyName, ...result },
          citations: [],
          confidence: result.bands.length > 0 ? Math.min(1, 0.5 + 0.15 * result.bands.length) : 0.2,
          metadata: {
            calculationMethod: "deterministic-comparables",
            note: "confidence reflects how many multiple types could be computed from the supplied inputs, not the reliability of the peer set itself.",
          },
        });
      } catch (err) {
        return errorResponse((err as Error).message);
      }
    },
  });
}

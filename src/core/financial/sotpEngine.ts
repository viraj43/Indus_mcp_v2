import { safeRound } from "../normalization/normalizer.js";

/** Sum-of-the-Parts valuation — pure arithmetic over caller-supplied
 * per-segment multiples, the same "MCP computes, LLM/analyst judges" split
 * as dcfEngine.ts. This exists because a multi-segment business (the
 * PhysicsWallah Online/Offline/Other split Motilal Oswal used) can't be
 * valued with one blended multiple or one blended DCF without hiding the
 * fact that segments have genuinely different economics and deserve
 * genuinely different multiples. The multiple itself (why 50x EV/EBITDA
 * for the online segment, not 30x or 70x) is exactly the kind of judgment
 * call this server refuses to invent — the caller supplies it, reasoned
 * from real peer multiples (see global_peer_comps) or their own view, and
 * this engine only does the sum + net-debt bridge + per-share division
 * correctly. */

export type SotpMetric = "EV/EBITDA" | "EV/Sales" | "EV/Revenue" | "P/E" | "Direct EV";

export interface SotpSegment {
  name: string;
  metric: SotpMetric;
  multiple: number;
  /** The metric's base value for this segment (e.g. FY28E EBITDA for an
   * EV/EBITDA line, FY28E Sales for an EV/Sales line) — ignored for
   * "Direct EV" where `multiple` itself is treated as the segment's value. */
  baseValue: number;
  /** Free-text note on why this multiple was chosen — carried straight
   * through to the output so a reader can audit the judgment call, not
   * just the arithmetic. */
  rationale?: string;
}

export interface SotpSegmentResult extends SotpSegment {
  segmentValue: number;
}

export interface SotpResult {
  segments: SotpSegmentResult[];
  cash: number;
  netDebt: number;
  totalEnterpriseValue: number;
  equityValue: number;
  sharesOutstanding?: number;
  fairValuePerShare: number | null;
}

function segmentValue(segment: SotpSegment): number {
  if (segment.metric === "Direct EV") return segment.multiple;
  return segment.baseValue * segment.multiple;
}

export function runSotpValuation(segments: SotpSegment[], cash: number, netDebt: number, sharesOutstanding?: number): SotpResult {
  const segmentResults: SotpSegmentResult[] = segments.map((s) => ({ ...s, segmentValue: safeRound(segmentValue(s), 2) }));
  const totalEnterpriseValue = safeRound(
    segmentResults.reduce((sum, s) => sum + s.segmentValue, 0) + cash,
    2,
  );
  const equityValue = safeRound(totalEnterpriseValue - netDebt, 2);
  const fairValuePerShare = sharesOutstanding ? safeRound(equityValue / sharesOutstanding, 2) : null;

  return { segments: segmentResults, cash, netDebt, totalEnterpriseValue, equityValue, sharesOutstanding, fairValuePerShare };
}

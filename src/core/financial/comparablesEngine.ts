import { safeRound } from "../normalization/normalizer.js";

/** Comparable-company ("comps") valuation: applies a peer set's trading
 * multiples to the target's own financial metrics to get an implied
 * valuation range. Like dcfEngine.ts, this does no research and picks no
 * peers — it takes whatever peer multiples the caller supplies (e.g. from
 * listed_peer_comparison output or the calling LLM's own peer set) and
 * just does the arithmetic + the low/median/high banding deterministically. */

export interface PeerMultiple {
  name: string;
  /** EV / EBITDA, if known for this peer. */
  evToEbitda?: number;
  /** Price / Earnings, if known for this peer. */
  peRatio?: number;
  /** EV / Revenue, if known for this peer. */
  evToSales?: number;
}

export interface TargetMetrics {
  ebitda?: number;
  netProfit?: number;
  revenue?: number;
  netDebt?: number;
  sharesOutstanding?: number;
}

export interface MultipleBand {
  multipleType: "evToEbitda" | "peRatio" | "evToSales";
  peerCount: number;
  low: number;
  median: number;
  high: number;
  impliedValueLow: number;
  impliedValueMedian: number;
  impliedValueHigh: number;
  /** "enterprise" for EV-based multiples, "equity" for P/E. */
  valueBasis: "enterprise" | "equity";
}

export interface ComparablesResult {
  peerCount: number;
  bands: MultipleBand[];
  /** A single blended equity-value range, converting every enterprise-value
   * band to equity value via netDebt so it's comparable to the P/E band.
   * Only populated for multiple types the target has both the metric and
   * at least one peer multiple for. */
  blendedEquityValueRange: { low: number; median: number; high: number } | null;
  blendedFairValuePerShare: { low: number; median: number; high: number } | null;
  issues: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildBand(
  multipleType: MultipleBand["multipleType"],
  values: number[],
  metric: number,
  valueBasis: MultipleBand["valueBasis"],
): MultipleBand {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const med = median(values);
  return {
    multipleType,
    peerCount: values.length,
    low: safeRound(low, 2),
    median: safeRound(med, 2),
    high: safeRound(high, 2),
    impliedValueLow: safeRound(metric * low, 2),
    impliedValueMedian: safeRound(metric * med, 2),
    impliedValueHigh: safeRound(metric * high, 2),
    valueBasis,
  };
}

/** Computes implied-valuation bands from a peer multiple set against the
 * target's own metrics. Every multiple type degrades gracefully: if the
 * target metric or peer multiples for a type are missing, that band is
 * simply omitted (with a note in `issues`) rather than guessed. */
export function runComparablesValuation(peers: PeerMultiple[], target: TargetMetrics): ComparablesResult {
  const issues: string[] = [];
  const bands: MultipleBand[] = [];

  if (peers.length === 0) issues.push("No peer multiples supplied — cannot compute a comparables valuation.");

  const evToEbitdaValues = peers.map((p) => p.evToEbitda).filter((v): v is number => typeof v === "number" && v > 0);
  const peValues = peers.map((p) => p.peRatio).filter((v): v is number => typeof v === "number" && v > 0);
  const evToSalesValues = peers.map((p) => p.evToSales).filter((v): v is number => typeof v === "number" && v > 0);

  if (evToEbitdaValues.length > 0 && typeof target.ebitda === "number") {
    bands.push(buildBand("evToEbitda", evToEbitdaValues, target.ebitda, "enterprise"));
  } else if (evToEbitdaValues.length === 0) {
    issues.push("No peer EV/EBITDA multiples supplied.");
  } else {
    issues.push("Target EBITDA not supplied — cannot apply EV/EBITDA multiples.");
  }

  if (peValues.length > 0 && typeof target.netProfit === "number") {
    bands.push(buildBand("peRatio", peValues, target.netProfit, "equity"));
  } else if (peValues.length === 0) {
    issues.push("No peer P/E multiples supplied.");
  } else {
    issues.push("Target net profit not supplied — cannot apply P/E multiples.");
  }

  if (evToSalesValues.length > 0 && typeof target.revenue === "number") {
    bands.push(buildBand("evToSales", evToSalesValues, target.revenue, "enterprise"));
  } else if (evToSalesValues.length === 0) {
    issues.push("No peer EV/Sales multiples supplied.");
  } else {
    issues.push("Target revenue not supplied — cannot apply EV/Sales multiples.");
  }

  // Convert every band to an equity-value figure so they can be blended
  // together, using netDebt for the EV -> equity bridge. A band whose
  // basis is already "equity" (P/E) passes through unchanged.
  const equityLows: number[] = [];
  const equityMedians: number[] = [];
  const equityHighs: number[] = [];
  const netDebt = target.netDebt ?? 0;
  if (target.netDebt === undefined && bands.some((b) => b.valueBasis === "enterprise")) {
    issues.push("netDebt not supplied — enterprise-value bands were bridged to equity assuming netDebt = 0.");
  }

  for (const band of bands) {
    const bridge = band.valueBasis === "enterprise" ? -netDebt : 0;
    equityLows.push(band.impliedValueLow + bridge);
    equityMedians.push(band.impliedValueMedian + bridge);
    equityHighs.push(band.impliedValueHigh + bridge);
  }

  const blendedEquityValueRange =
    equityLows.length > 0
      ? {
          low: safeRound(Math.min(...equityLows), 2),
          median: safeRound(median(equityMedians), 2),
          high: safeRound(Math.max(...equityHighs), 2),
        }
      : null;

  const blendedFairValuePerShare =
    blendedEquityValueRange && target.sharesOutstanding
      ? {
          low: safeRound(blendedEquityValueRange.low / target.sharesOutstanding, 2),
          median: safeRound(blendedEquityValueRange.median / target.sharesOutstanding, 2),
          high: safeRound(blendedEquityValueRange.high / target.sharesOutstanding, 2),
        }
      : null;

  return { peerCount: peers.length, bands, blendedEquityValueRange, blendedFairValuePerShare, issues };
}

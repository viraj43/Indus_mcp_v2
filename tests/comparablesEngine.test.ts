import { describe, it, expect } from "vitest";
import { runComparablesValuation, type PeerMultiple } from "../src/core/financial/comparablesEngine.js";

const peers: PeerMultiple[] = [
  { name: "PeerA", evToEbitda: 18, peRatio: 30, evToSales: 3 },
  { name: "PeerB", evToEbitda: 22, peRatio: 35, evToSales: 4 },
  { name: "PeerC", evToEbitda: 20, peRatio: 32, evToSales: 3.5 },
];

describe("runComparablesValuation", () => {
  it("computes low/median/high bands for every multiple type when target metrics are complete", () => {
    const result = runComparablesValuation(peers, { ebitda: 100, netProfit: 50, revenue: 500, netDebt: 200, sharesOutstanding: 20 });
    expect(result.bands).toHaveLength(3);
    const evEbitdaBand = result.bands.find((b) => b.multipleType === "evToEbitda")!;
    expect(evEbitdaBand.low).toBe(18);
    expect(evEbitdaBand.median).toBe(20);
    expect(evEbitdaBand.high).toBe(22);
    expect(evEbitdaBand.impliedValueMedian).toBe(2000);
  });

  it("bridges enterprise-value bands to equity using netDebt and blends with the P/E band", () => {
    const result = runComparablesValuation(peers, { ebitda: 100, netProfit: 50, revenue: 500, netDebt: 200, sharesOutstanding: 20 });
    expect(result.blendedEquityValueRange).not.toBeNull();
    // EV/EBITDA median implied EV = 2000, bridged to equity = 2000 - 200 = 1800
    // P/E median implied equity = 50 * 32 = 1600
    // EV/Sales median implied EV = 500*3.5=1750, bridged = 1550
    // median of [1800, 1600, 1550] = 1600
    expect(result.blendedEquityValueRange!.median).toBeCloseTo(1600, 0);
    expect(result.blendedFairValuePerShare!.median).toBeCloseTo(80, 0);
  });

  it("omits a band and records an issue when the target metric is missing", () => {
    const result = runComparablesValuation(peers, { ebitda: 100 });
    expect(result.bands).toHaveLength(1);
    expect(result.issues.some((i) => i.includes("net profit"))).toBe(true);
    expect(result.issues.some((i) => i.includes("revenue"))).toBe(true);
  });

  it("flags when no peers are supplied", () => {
    const result = runComparablesValuation([], { ebitda: 100 });
    expect(result.issues.some((i) => i.includes("No peer multiples"))).toBe(true);
    expect(result.bands).toHaveLength(0);
  });

  it("notes when netDebt is missing but still bridges assuming zero", () => {
    const result = runComparablesValuation(peers, { ebitda: 100 });
    expect(result.issues.some((i) => i.includes("netDebt not supplied"))).toBe(true);
  });
});

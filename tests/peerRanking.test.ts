import { describe, expect, it } from "vitest";
import { rankPeerCandidates, topPeers } from "../src/core/competitor/peerRanking.js";

describe("rankPeerCandidates", () => {
  it("ranks a candidate mentioned with a listed-company signal above one without", () => {
    const texts = [
      "Zen Technologies (NSE: ZENTEC) is a leading defence electronics player with strong share price growth.",
      "Tonbo Imaging is a private defence-tech startup with no public financials.",
    ];
    const ranked = rankPeerCandidates(["Zen Technologies", "Tonbo Imaging"], texts);
    expect(ranked[0].name).toBe("Zen Technologies");
    expect(ranked[0].listedSignal).toBe(true);
    expect(ranked[1].listedSignal).toBe(false);
  });

  it("ranks a candidate mentioned across more results higher", () => {
    const texts = [
      "Data Patterns is a defence electronics company.",
      "Data Patterns reported strong quarterly results.",
      "ideaForge makes commercial drones.",
    ];
    const ranked = rankPeerCandidates(["Data Patterns", "ideaForge"], texts);
    expect(ranked[0].name).toBe("Data Patterns");
    expect(ranked[0].mentionCount).toBe(2);
  });

  it("gives an unmentioned candidate a zero score", () => {
    const ranked = rankPeerCandidates(["Ghost Corp"], ["Some unrelated text about a different company."]);
    expect(ranked[0].score).toBe(0);
    expect(ranked[0].mentionCount).toBe(0);
  });
});

describe("topPeers", () => {
  it("limits to the requested count", () => {
    const ranked = rankPeerCandidates(["A", "B", "C"], ["A mentioned here. B mentioned here. C mentioned here."]);
    expect(topPeers(ranked, 2)).toHaveLength(2);
  });
});

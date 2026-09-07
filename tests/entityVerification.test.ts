import { describe, expect, it } from "vitest";
import { filterByEntity, matchesEntity } from "../src/core/quality/entityVerification.js";

describe("matchesEntity", () => {
  it("matches the correct entity by its full name", () => {
    const result = matchesEntity(
      "Big Bang Boom Solutions",
      "Big Bang Boom Solutions Private Limited is a defence-tech startup based in Chennai.",
    );
    expect(result.matched).toBe(true);
  });

  it("rejects an unrelated company that shares only a common word (Nirmal Bang)", () => {
    const result = matchesEntity(
      "Big Bang Boom Solutions",
      "Nirmal Bang Securities is a leading Indian stockbroking firm offering trading services.",
    );
    expect(result.matched).toBe(false);
  });

  it("rejects an unrelated company that shares only a common word (BB Food)", () => {
    const result = matchesEntity("Big Bang Boom Solutions", "BB Food Industries recently expanded its snack product line.");
    expect(result.matched).toBe(false);
  });

  it("still matches when the result omits the corporate suffix", () => {
    const result = matchesEntity("Big Bang Boom Solutions Private Limited", "Big Bang Boom raised funding this quarter.");
    expect(result.matched).toBe(true);
  });

  it("treats a subject with fewer than two distinctive tokens leniently", () => {
    const result = matchesEntity("Infosys", "Infosys reported quarterly earnings today.");
    expect(result.matched).toBe(true);
  });
});

describe("filterByEntity", () => {
  it("keeps matching items and counts rejected ones", () => {
    const items = [
      { text: "Big Bang Boom Solutions won a new defence contract." },
      { text: "Nirmal Bang Securities issued a market note." },
      { text: "BB Food Industries launched a new product." },
      { text: "Big Bang Boom Solutions Private Limited filed its annual return." },
    ];
    const { kept, rejected } = filterByEntity(items, "Big Bang Boom Solutions", (i) => i.text);
    expect(kept).toHaveLength(2);
    expect(rejected).toBe(2);
  });
});

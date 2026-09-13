import { describe, expect, it } from "vitest";
import { decide, type PriceCandidate } from "../src/decide";

const c = (valueCents: number, source: PriceCandidate["source"], confidence: number, extra: Partial<PriceCandidate> = {}): PriceCandidate => ({
  valueCents,
  source,
  confidence,
  ...extra,
});

describe("decide", () => {
  it("auto-accepts a single confident candidate", () => {
    const d = decide([c(299990, "jsonld", 0.95)]);
    expect(d.selected?.valueCents).toBe(299990);
    expect(d.needsReview).toBe(false);
  });

  it("auto-accepts when two independent sources agree", () => {
    const d = decide([c(299990, "jsonld", 0.9), c(299990, "adapter", 0.7)]);
    expect(d.selected?.valueCents).toBe(299990);
    expect(d.needsReview).toBe(false);
  });

  it("requests review when sources disagree (à vista vs parcelado)", () => {
    const d = decide([
      c(299990, "jsonld", 0.85, { label: "à vista" }),
      c(333322, "generic", 0.7, { label: "parcelado 10x", isInstallment: true }),
    ]);
    // installment never auto-wins, so the à vista price is selected
    expect(d.selected?.valueCents).toBe(299990);
    expect(d.needsReview).toBe(false);
  });

  it("requests review on genuine ambiguity (bundle vs solo)", () => {
    const d = decide([
      c(299990, "generic", 0.6, { label: "preço 1" }),
      c(349990, "generic", 0.6, { label: "preço 2" }),
    ]);
    expect(d.needsReview).toBe(true);
    expect(d.ranked).toHaveLength(2);
  });

  it("returns null selected with no candidates", () => {
    const d = decide([]);
    expect(d.selected).toBeNull();
    expect(d.needsReview).toBe(false);
  });

  it("forces review when only installment prices exist", () => {
    const d = decide([
      c(33332, "generic", 0.6, { isInstallment: true, label: "10x" }),
    ]);
    expect(d.needsReview).toBe(true);
  });

  it("AI candidate can break a tie by boosting matching group", () => {
    const d = decide([
      c(299990, "generic", 0.6),
      c(349990, "generic", 0.6),
      c(299990, "ai", 0.8, { label: "ia" }),
    ]);
    expect(d.selected?.valueCents).toBe(299990);
    expect(d.needsReview).toBe(false);
  });

  it("merges values within tolerance as same price", () => {
    const d = decide([c(299990, "jsonld", 0.9), c(299890, "adapter", 0.7)]);
    expect(d.ranked).toHaveLength(1);
    expect(d.needsReview).toBe(false);
  });

  it("single generic-only candidate below 0.6 goes to review (css heuristics are noisy)", () => {
    const d = decide([c(500000, "generic", 0.55, { label: "css price" })]);
    expect(d.needsReview).toBe(true);
    expect(d.selected?.valueCents).toBe(500000);
  });

  it("single generic candidate with high confidence still auto-accepts", () => {
    const d = decide([c(500000, "generic", 0.7, { label: "pix" })]);
    expect(d.needsReview).toBe(false);
  });

  it("single jsonld candidate auto-accepts at lower confidence than generic", () => {
    const d = decide([c(500000, "jsonld", 0.55)]);
    expect(d.needsReview).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateTransition, isPriceDrop, hitTarget, backInStock, acceptPriceTransition } from "../src/alerts";
import { nextCheckAt, formatCountdown, intervalProgress } from "../src/schedule";
import { computeSavings, dashboardStats } from "../src/savings";

describe("alerts", () => {
  it("detects drop with absolute threshold", () => {
    expect(isPriceDrop(10000, 9000, { absCents: 500 })).toBe(true);
    expect(isPriceDrop(10000, 9800, { absCents: 1000 })).toBe(false);
    expect(isPriceDrop(10000, 10500, { absCents: 500 })).toBe(false);
  });

  it("detects drop with pct threshold", () => {
    expect(isPriceDrop(10000, 9000, { pct: 5 })).toBe(true);
    expect(isPriceDrop(10000, 9600, { pct: 5 })).toBe(false);
  });

  it("detects target hit only on crossing", () => {
    expect(hitTarget(10000, 9000, 9500)).toBe(true);
    expect(hitTarget(9000, 9200, 9500)).toBe(false); // ja estava abaixo
    expect(hitTarget(null, 9000, 9500)).toBe(true); // primeira leitura abaixo do alvo
  });

  it("detects back in stock", () => {
    expect(backInStock("out_of_stock", "in_stock")).toBe(true);
    expect(backInStock("in_stock", "out_of_stock")).toBe(false);
    expect(backInStock("unknown", "in_stock")).toBe(true);
  });

  it("sem threshold configurado: queda precisa de 1% mínimo (anti-ruído)", () => {
    expect(isPriceDrop(10000, 9900)).toBe(true); // -1% exato
    expect(isPriceDrop(10000, 9950)).toBe(false); // -0,5% = ruído
    expect(isPriceDrop(152010, 152000)).toBe(false); // R$ 1.520,10 → R$ 1.520,00
  });

  it("evaluateTransition: primeira leitura (prev null) não dispara back_in_stock", () => {
    const events = evaluateTransition(null, 50000, "unknown", "in_stock", null);
    expect(events.map((e) => e.kind)).not.toContain("back_in_stock");
  });

  it("evaluateTransition combines events", () => {
    const events = evaluateTransition(10000, 8500, "out_of_stock", "in_stock", 9000, { absCents: 1 });
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("price_drop");
    expect(kinds).toContain("target_hit");
    expect(kinds).toContain("back_in_stock");
  });
});

describe("schedule", () => {
  it("computes next check with jitter within bounds", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const next = nextCheckAt(now, 60, () => 0.5); // jitter = 0
    expect(next.getTime() - now.getTime()).toBe(3_600_000);
  });

  it("formats countdowns", () => {
    expect(formatCountdown(0)).toBe("agora");
    expect(formatCountdown(45 * 60_000)).toBe("45m");
    expect(formatCountdown(134 * 60_000)).toBe("2h 14m");
    expect(formatCountdown(60 * 60_000 * 26)).toBe("1d 2h");
  });

  it("computes interval progress", () => {
    const now = new Date();
    const next = new Date(now.getTime() + 30 * 60_000);
    expect(intervalProgress(60, next, now)).toBeCloseTo(0.5, 1);
  });
});

describe("wild-swing protection", () => {
  it("aceita variação moderada de fonte forte", () => {
    expect(acceptPriceTransition(382400, 750054, "jsonld").accept).toBe(true); // 1.96x < 3x
    expect(acceptPriceTransition(254900, 210000, "adapter").accept).toBe(true); // 0.82x ok
  });

  it("rejeita swings paranormais até de fonte forte", () => {
    expect(acceptPriceTransition(254900, 49000, "adapter").accept).toBe(false); // 0.19x < 0.33x
    expect(acceptPriceTransition(5999, 254900, "adapter").accept).toBe(false); // 42x > 3x
  });

  it("rejeita swings extremos vindo de CSS genérico", () => {
    expect(acceptPriceTransition(382400, 750054, "generic").accept).toBe(false);
    expect(acceptPriceTransition(254900, 49000, "generic").accept).toBe(false);
  });

  it("aceita variação moderada de fonte genérica", () => {
    expect(acceptPriceTransition(100000, 92000, "generic").accept).toBe(true);
    expect(acceptPriceTransition(100000, 115000, "generic").accept).toBe(true);
  });

  it("primeira leitura sempre aceita", () => {
    expect(acceptPriceTransition(null, 99999, "generic").accept).toBe(true);
  });
});

describe("savings", () => {
  it("computes savings and aggregates", () => {
    expect(computeSavings(299990, 279990)).toBe(20000);
    expect(computeSavings(279990, 299990)).toBe(-20000);
  });

  it("dashboard stats", () => {
    const stats = dashboardStats([
      { status: "active", minPriceCents: 9000, lowestEverCents: 9000, targetCents: 9500 },
      { status: "active", minPriceCents: 9000, lowestEverCents: 8000, targetCents: 5000 },
      { status: "archived_bought", minPriceCents: 1, lowestEverCents: 1 },
    ]);
    expect(stats.totalProducts).toBe(2);
    expect(stats.atLowestPrice).toBe(1);
    expect(stats.atTargetPrice).toBe(1);
  });
});

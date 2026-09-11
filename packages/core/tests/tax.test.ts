import { describe, expect, it } from "vitest";
import { calculateRemessaConforme, isCrossBorderDomain } from "../src/tax";

describe("calculateRemessaConforme", () => {
  it("applies 20% II below the US$50 threshold", () => {
    // US$ 40 product, fx 5.00
    const r = calculateRemessaConforme(4000, { fxRate: 5 });
    // II = 20% of 4000 = 800 (USD cents)
    // base = 4800; ICMS 20% por dentro: total = 4800 / 0.8 = 6000; ICMS = 1200
    expect(r.importTaxBrlCents).toBe(4000); // R$ 40,00
    expect(r.totalBrlCents).toBe(30000); // R$ 300,00 = US$60 * 5
    expect(r.icmsBrlCents).toBe(6000);
    expect(r.effectiveMultiplier).toBeCloseTo(1.5, 3);
  });

  it("applies 60% with US$20 discount above the threshold", () => {
    // US$ 100 product, fx 5.00
    const r = calculateRemessaConforme(10000, { fxRate: 5 });
    // II = 6000 - 2000 = 4000 usd cents
    // base = 14000; total = 14000/0.8 = 17500; icms = 3500
    expect(r.importTaxBrlCents).toBe(20000); // R$ 200
    expect(r.totalBrlCents).toBe(87500); // US$175 * 5
    expect(r.effectiveMultiplier).toBeCloseTo(1.75, 2);
  });

  it("respects custom ICMS rate", () => {
    const r = calculateRemessaConforme(4000, { fxRate: 5, icmsRate: 0.17 });
    // base = 4800; total = 4800/0.83 = 5783.13...
    expect(r.totalBrlCents).toBe(Math.round((4800 / 0.83) * 5));
  });
});

describe("isCrossBorderDomain", () => {
  it("detects cross-border stores", () => {
    expect(isCrossBorderDomain("pt.aliexpress.com")).toBe(true);
    expect(isCrossBorderDomain("www.banggood.com")).toBe(true);
    expect(isCrossBorderDomain("www.amazon.com")).toBe(true);
    expect(isCrossBorderDomain("www.amazon.com.br")).toBe(false);
    expect(isCrossBorderDomain("www.mercadolivre.com.br")).toBe(false);
    expect(isCrossBorderDomain("www.kabum.com.br")).toBe(false);
  });
});

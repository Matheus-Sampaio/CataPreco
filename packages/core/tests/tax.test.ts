import { describe, expect, it } from "vitest";
import { calculateRemessaConforme, calculateRemessaConformeBrl, isCrossBorderDomain } from "../src/tax";

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

describe("calculateRemessaConformeBrl (preço já em BRL)", () => {
  it("espelha a faixa de 20% (R$ 200 a fx 5 = US$ 40)", () => {
    const r = calculateRemessaConformeBrl(20000, { fxRate: 5 });
    expect(r.importTaxBrlCents).toBe(4000); // 20% de R$ 200
    expect(r.totalBrlCents).toBe(30000); // 24000 / 0.8
    expect(r.icmsBrlCents).toBe(6000);
    expect(r.effectiveMultiplier).toBeCloseTo(1.5, 3);
  });

  it("faixa de 60% com desconto convertido (R$ 500 a fx 5 = US$ 100)", () => {
    const r = calculateRemessaConformeBrl(50000, { fxRate: 5 });
    // II = 0.6*50000 - 2000*5 = 30000 - 10000 = 20000
    expect(r.importTaxBrlCents).toBe(20000);
    expect(r.totalBrlCents).toBe(87500); // 70000 / 0.8
    expect(r.effectiveMultiplier).toBeCloseTo(1.75, 2);
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

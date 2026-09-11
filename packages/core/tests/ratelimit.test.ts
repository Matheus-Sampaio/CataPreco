import { describe, expect, it } from "vitest";
import { banCooldownMs, domainOf, gapForDomain, nextAllowedAt, normalizeProductUrl, sameProductUrl } from "../src/ratelimit";

describe("ratelimit", () => {
  it("extracts domains", () => {
    expect(domainOf("https://www.amazon.com.br/dp/x")).toBe("amazon.com.br");
    expect(domainOf("https://produto.mercadolivre.com.br/MLB-1")).toBe("mercadolivre.com.br");
    expect(domainOf("not a url")).toBe("unknown");
  });

  it("returns configured gaps", () => {
    expect(gapForDomain("amazon.com.br")).toBe(45_000);
    expect(gapForDomain("pt.aliexpress.com")).toBe(60_000);
    expect(gapForDomain("loja-qualquer.com.br")).toBe(20_000);
  });

  it("allows immediately with no previous run", () => {
    expect(nextAllowedAt(null, 1000, 5000)).toBe(1000);
  });

  it("applies gap + bounded jitter", () => {
    const at = nextAllowedAt(0, 10_000, 5_000, () => 1);
    expect(at).toBe(6500); // 5000 + 30% jitter max (rand=1)
  });

  it("backoff grows with consecutive failures", () => {
    expect(banCooldownMs(1)).toBe(0);
    expect(banCooldownMs(2)).toBe(3_600_000);
    expect(banCooldownMs(3)).toBe(21_600_000);
    expect(banCooldownMs(5)).toBe(86_400_000);
  });

  it("canonicaliza urls para dedup (amazon ASIN, ML produto)", () => {
    expect(normalizeProductUrl("https://www.amazon.com.br/Fifine-AM8/dp/B0D17P4Q7J?source=x&ref_=fplfs"))
      .toBe("https://www.amazon.com.br/dp/B0D17P4Q7J");
    expect(normalizeProductUrl("https://www.amazon.com.br/dp/B0D17P4Q7J"))
      .toBe("https://www.amazon.com.br/dp/B0D17P4Q7J");
    expect(normalizeProductUrl("https://www.mercadolivre.com.br/ssd-x/p/MLB20675986#position=1&tracking_id=abc"))
      .toBe("https://www.mercadolivre.com.br/ssd-x/p/MLB20675986");
    expect(sameProductUrl(
      "https://www.amazon.com.br/Outro-Nome/dp/B0D17P4Q7J?ref=x",
      "https://www.amazon.com.br/dp/B0D17P4Q7J",
    )).toBe(true);
  });
});

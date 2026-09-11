import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractJsonLd } from "../src/extractors/jsonld";
import { extractGeneric, visibleTextSummary } from "../src/extractors/generic";
import { mercadolivre } from "../src/adapters/mercadolivre";
import { amazon } from "../src/adapters/amazon";
import { looksLikeBotWall } from "../src/ports";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf-8",
  );
}

describe("extractJsonLd", () => {
  it("extracts product from schema.org data", () => {
    const r = extractJsonLd({ html: fixture("jsonld-product.html"), url: "https://lojax.com/p/1" });
    expect(r.name).toContain("SSD Kingston");
    expect(r.currency).toBe("BRL");
    expect(r.stock).toBe("in_stock");
    expect(r.candidates[0]?.valueCents).toBe(39990);
    expect(r.candidates[0]?.source).toBe("jsonld");
  });

  it("handles pages without JSON-LD", () => {
    const r = extractJsonLd({ html: "<html><body>nada</body></html>", url: "https://x" });
    expect(r.candidates).toHaveLength(0);
    expect(r.name).toBeNull();
  });

  it("tolerates trailing commas", () => {
    const html = `<script type="application/ld+json">{"@context":"x","@type":"Product","name":"A","offers":{"@type":"Offer","price":"10,00",}}</script>`;
    const r = extractJsonLd({ html, url: "https://x" });
    expect(r.name).toBe("A");
    expect(r.candidates[0]?.valueCents).toBe(1000);
  });
});

describe("extractGeneric", () => {
  it("finds meta price, installments and stock on a BR page", () => {
    const r = extractGeneric({ html: fixture("generic-br.html"), url: "https://loja.com/p/2" });
    expect(r.name).toContain("Galaxy A54");
    expect(r.currency).toBe("BRL");
    expect(r.stock).toBe("in_stock");

    const values = r.candidates.map((c) => c.valueCents);
    expect(values).toContain(189900); // meta price
    const inst = r.candidates.find((c) => c.isInstallment);
    expect(inst?.valueCents).toBe(21090); // 10x 210,90
    // struck price is kept as candidate but labeled/low-confidence
    const listPrice = r.candidates.find((c) => c.valueCents === 249900);
    expect(listPrice?.label).toContain("lista");
    expect(listPrice?.confidence).toBeLessThan(0.5);
  });
});

describe("mercadolivre adapter", () => {
  it("parses ML product page", () => {
    const r = mercadolivre.extract({ html: fixture("mercadolivre.html"), url: "https://www.mercadolivre.com.br/x" });
    expect(r).not.toBeNull();
    expect(r!.name).toContain("RTX 3050");
    expect(r!.currency).toBe("BRL");
    const prices = r!.candidates.map((c) => c.valueCents);
    expect(prices).toContain(169900);
  });
});

describe("amazon adapter", () => {
  it("parses amazon product page", () => {
    const r = amazon.extract({ html: fixture("amazon.html"), url: "https://www.amazon.com.br/dp/B0TEST" });
    expect(r).not.toBeNull();
    expect(r!.name).toContain("i5-12400F");
    const prices = r!.candidates.map((c) => c.valueCents);
    expect(prices).toContain(80910);
    expect(prices).toContain(109900); // basis price
    expect(r!.stock).toBe("in_stock");
    expect(r!.currency).toBe("BRL");
  });
});

describe("bot wall detection", () => {
  it("flags captcha pages", () => {
    expect(looksLikeBotWall('<html><body><div class="g-recaptcha"></div></body></html>')).toBe(true);
    expect(looksLikeBotWall(fixture("mercadolivre.html"))).toBe(false);
  });
});

describe("visibleTextSummary", () => {
  it("corta texto de página, prioriza título e preços (modo IA-friendly)", () => {
    const text = visibleTextSummary(fixture("generic-br.html"), 400);
    expect(text).toContain("Galaxy A54"); // og:title antes de tudo
    expect(text.length).toBeLessThanOrEqual(600); // sem gargalo, headers elevados aceitos
    expect(text).toContain("TÍTULO:"); // header estruturado de navegação da IA
  });
});

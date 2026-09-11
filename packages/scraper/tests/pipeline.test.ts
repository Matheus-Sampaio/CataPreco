import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scrapeProduct } from "../src/pipeline";
import type { AIPort, FetchPort } from "../src/ports";
import { buildQuery, parseMlSearch, ML_SEARCH_URL } from "../src/search";
import { findAdapter, marketplaceName } from "../src/adapters/registry";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf-8");
}

const fakeFetch = (html: string, status = 200): FetchPort => ({
  get: async (url) => ({ url, finalUrl: url, status, html, usedBrowser: false }),
});

const fakeAi = (response: string): AIPort => ({
  complete: async () => response,
  describe: () => "fake-ai",
});

describe("scrapeProduct pipeline", () => {
  it("extracts via JSON-LD without AI", async () => {
    const r = await scrapeProduct("https://lojax.com/p/1", fakeFetch(fixture("jsonld-product.html")), {});
    expect(r.ok).toBe(true);
    expect(r.name).toContain("SSD Kingston");
    expect(r.selected?.valueCents).toBe(39990);
    expect(r.usedAi).toBe(false);
    expect(r.logs.join("\n")).toContain("jsonld");
  });

  it("uses adapter for ML and merges installment candidates", async () => {
    const r = await scrapeProduct("https://www.mercadolivre.com.br/p/MLB1", fakeFetch(fixture("mercadolivre.html")), {});
    expect(r.name).toContain("RTX 3050");
    expect(r.selected?.valueCents).toBe(169900);
    expect(r.candidates.some((c) => c.isInstallment)).toBe(true);
  });

  it("calls AI when static extractors find nothing", async () => {
    const html = "<html><body><h1>Produto Estranho</h1><p>Oferta especial por apenas R$ 499,90!</p></body></html>";
    const ai = fakeAi('{"name":"Produto Estranho","price":499.90,"currency":"BRL","in_stock":true,"confidence":0.85}');
    const r = await scrapeProduct("https://desconhecido.com/p/9", fakeFetch(html), { ai });
    expect(r.usedAi).toBe(true);
    expect(r.selected?.valueCents).toBe(49990);
    expect(r.name).toBe("Produto Estranho");
  });

  it("asks AI to arbitrate conflicting candidates", async () => {
    // generic finds 2 close-confidence prices -> needsReview -> AI decides
    const html = `
      <html><body>
        <h1>Console X</h1>
        <div class="price-a">R$ 2.099,00</div>
        <div class="price-b">R$ 2.399,00</div>
      </body></html>`;
    const ai = fakeAi('{"price":2099.00,"confidence":0.9,"reason":"preco de venda"}');
    const r = await scrapeProduct("https://loja.com/console", fakeFetch(html), { ai });
    expect(r.usedAi).toBe(true);
    expect(r.selected?.valueCents).toBe(209900);
    expect(r.needsReview).toBe(false);
  });

  it("fails cleanly on HTTP errors", async () => {
    const r = await scrapeProduct("https://loja.com/500", fakeFetch("Internal Error", 500));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("500");
  });

  it("forces review when nothing is found at all", async () => {
    const r = await scrapeProduct("https://loja.com/vazio", fakeFetch("<html><body><p>Loja esquisita</p></body></html>"), { ai: null });
    expect(r.needsReview).toBe(true);
    expect(r.selected).toBeNull();
  });

  it("strips price suffix from product titles", async () => {
    const html = `<html><head><title>Placa de Vídeo RTX 3050 8GB - R$ 1.999</title><script type="application/ld+json">{"@type":"Product","name":"Placa de Vídeo RTX 3050 8GB - R$ 1.999","offers":{"@type":"Offer","price":"1999"}}</script></head><body></body></html>`;
    const r = await scrapeProduct("https://loja.com/rtx", fakeFetch(html), {});
    expect(r.name).toBe("Placa de Vídeo RTX 3050 8GB");
    expect(r.selected?.valueCents).toBe(199900);
  });
});

describe("cross-marketplace search", () => {
  it("builds compact queries with model tokens", () => {
    expect(buildQuery("Placa de Vídeo Gigabyte GeForce RTX 3050 8GB GDDR6 Windforce")).toContain("3050");
    expect(buildQuery("Placa de Vídeo Gigabyte GeForce RTX 3050 8GB GDDR6 Windforce")).toContain("8gb");
  });

  it("parses ML API search results", () => {
    const json = {
      results: [
        { title: "RTX 3050 8GB", permalink: "https://produto.mercadolivre.com.br/MLB-1", price: 1699, thumbnail: "t.jpg", available_quantity: 3 },
        { title: "Item sem preco", permalink: "https://x" },
      ],
    };
    const hits = parseMlSearch(json);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ marketplace: "Mercado Livre", priceCents: 169900 });
  });

  it("builds ML search url", () => {
    expect(ML_SEARCH_URL("rtx 3050")).toBe("https://lista.mercadolivre.com.br/rtx-3050");
  });
});

describe("registry", () => {
  it("finds adapters by domain", () => {
    expect(findAdapter("https://www.mercadolivre.com.br/x")?.id).toBe("mercadolivre");
    expect(findAdapter("https://produto.mercadolivre.com.br/MLB-1")?.id).toBe("mercadolivre");
    expect(findAdapter("https://www.amazon.com.br/dp/x")?.id).toBe("amazon");
    expect(findAdapter("https://desconhecido.com/")).toBeNull();
  });

  it("resolves marketplace display names", () => {
    expect(marketplaceName("https://www.kabum.com.br/p")).toBe("KaBuM!");
    expect(marketplaceName("https://loja-desconhecida.com.br/")).toBe("loja-desconhecida.com.br");
  });
});

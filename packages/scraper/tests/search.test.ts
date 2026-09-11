import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMlSearchHtml, filterMatchingHits, buildQuery, queryLadder } from "../src/search";
import { normalizeProductUrl } from "@catapreco/core";

const lista = readFileSync(
  fileURLToPath(new URL("./fixtures/ml-lista.html", import.meta.url)),
  "utf8",
);

describe("parseMlSearchHtml (fixture real do Mercado Livre)", () => {
  it("extrai produtos com link direto, título e preço", () => {
    const hits = parseMlSearchHtml(lista);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.length).toBeLessThan(60);
    for (const h of hits) {
      expect(h.url).toContain("/p/MLB");
      expect(h.url).not.toContain("click");
      expect(h.priceCents).toBeGreaterThan(1000);
      expect(h.title.length).toBeGreaterThan(5);
    }
    const titles = hits.map((h) => h.title.toLowerCase()).join(" ");
    expect(titles).toContain("kingston");
  });

  it("matching: hit com modelo igual (nv2) pontua acima do de modelo diferente (nv3)", () => {
    const hitsNv2 = [{ marketplace: "Mercado Livre", title: "SSD Kingston NV2 1TB NVMe", url: "https://x.com/p/MLB1", priceCents: 39900, image: null }];
    const hitsNv3 = [{ marketplace: "Mercado Livre", title: "SSD Kingston NV3 1TB NVMe", url: "https://x.com/p/MLB2", priceCents: 39900, image: null }];
    const target = "SSD Kingston NV2 1TB";
    const good = filterMatchingHits(target, hitsNv2, 0.3);
    const bad = filterMatchingHits(target, hitsNv3, 0.3);
    expect(good.length).toBe(1);
    expect(bad.length).toBe(0);
  });
});

describe("queryLadder", () => {
  it("gera degraus do específico ao genérico", () => {
    const ladder = queryLadder("SSD M2 1TB Kingston Nvme2 Pcie 4.0 3500 Mb/s Cor Preto SNV2 1000G");
    expect(ladder[0]!.split(" ").length).toBeLessThanOrEqual(6);
    expect(ladder).toContain("ssd kingston 1tb");
    expect(ladder.length).toBeGreaterThanOrEqual(3);
  });

  it("ps5 sem gigabytes: só cat + brand + modelo", () => {
    const ladder = queryLadder("Console Sony PlayStation 5 SSD 825GB Controle");
    expect(ladder.some((q) => q.includes("825gb"))).toBe(true);
  });
});

describe("normalizeProductUrl", () => {
  it("remove tracking params mantendo o identificador do produto", () => {
    const dirty =
      "https://www.mercadolivre.com.br/ssd-kingston/p/MLB20675986#polycard_client=search-desktop&position=5&tracking_id=abc&type=product";
    expect(normalizeProductUrl(dirty)).toBe(
      "https://www.mercadolivre.com.br/ssd-kingston/p/MLB20675986",
    );
  });

  it("mantém URLs limpas e retorna inválidas como vieram", () => {
    expect(normalizeProductUrl("https://x.com/p?item=42")).toBe("https://x.com/p?item=42");
    expect(normalizeProductUrl("não é url")).toBe("não é url");
  });
});

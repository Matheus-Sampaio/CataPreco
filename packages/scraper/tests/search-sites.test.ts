import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseAmazonSearchHtml,
  parseKabumSearchHtml,
  parseMlSearchHtml,
  buildQuery,
  filterMatchingHits,
} from "../src/search";

const fx = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf-8");

describe("busca: KaBuM (fixture real, __NEXT_DATA__)", () => {
  const hits = parseKabumSearchHtml(fx("search-kabum.html"));

  it("extrai produtos com preço e URL canônica", () => {
    expect(hits.length).toBeGreaterThan(10);
    for (const h of hits.slice(0, 10)) {
      expect(h.url).toMatch(/^https:\/\/www\.kabum\.com\.br\/produto\/\d+\//);
      expect(h.priceCents).toBeGreaterThan(1000);
      expect(h.title.length).toBeGreaterThan(10);
    }
  });

  it("matching: a RTX 3050 8GB específica é encontrada", () => {
    const target = "Placa de Vídeo Pcyes Nvidia GeForce RTX 3050 8GB GDDR6 4K Black Edition";
    const matches = filterMatchingHits(target, hits);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.title.toLowerCase()).toContain("rtx 3050");
  });

  it("um match do ML pontua também no formato com traços", () => {
    const target = "SSD M2 1TB Kingston Nvme2 Pcie 4.0 3500 Mb/s Cor Preto SNV2 1000G";
    const q = buildQuery(target);
    expect(q.split(" ").length).toBeLessThanOrEqual(6);
    expect(q).toContain("snv2");
    expect(q).toContain("1tb");
  });
});

describe("busca: Amazon BR (fixture real)", () => {
  const hits = parseAmazonSearchHtml(fx("search-amazonbr.html"));

  it("usa links diretos /dp/ sem tracker sspa", () => {
    expect(hits.length).toBeGreaterThan(3);
    for (const h of hits) {
      expect(h.url).toMatch(/amazon\.com\.br\/dp\/B[A-Z0-9]{9}$/);
      expect(h.url).not.toContain("sspa");
    }
  });

  it("matching: microfone FIFINE AM8 encontrado", () => {
    const target = "Fifine AM8 Filtro Pop de Microfone";
    const matches = filterMatchingHits(target, hits, 0.3);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.title.toLowerCase()).toContain("am8");
  });
});

describe("busca: ML (fixture real 2)", () => {
  it("extrai e emparelha RTX 3050", () => {
    const hits = parseMlSearchHtml(fx("search-ml2.html"));
    expect(hits.length).toBeGreaterThan(3);
    const matches = filterMatchingHits("Placa de Vídeo RTX 3050 8GB GDDR6", hits);
    expect(matches.length).toBeGreaterThan(0);
  });
});

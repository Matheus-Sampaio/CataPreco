import { describe, expect, it } from "vitest";
import { matchScore, normalizeName } from "../src/matching";

describe("normalizeName", () => {
  it("normalizes accents and punctuation", () => {
    expect(normalizeName("Placa de Vídeo RTX 3050 8GB!!!")).toBe(
      "placa de video rtx 3050 8gb",
    );
  });

  it("funde 'M.2' em 'm2' sem quebrar 'com 2 jogos'", () => {
    expect(normalizeName("SSD M.2 NVMe 1TB")).toBe("ssd m2 nvme 1tb");
    expect(normalizeName("Console com 2 jogos digitais")).toBe("console com 2 jogos digitais");
    expect(normalizeName("Ryzen 5 5600")).toBe("ryzen 5 5600");
  });
});

describe("matchScore", () => {
  it("scores identical products high", () => {
    const s = matchScore(
      "Placa de Vídeo Gigabyte GeForce RTX 3050 8GB GDDR6",
      "GeForce RTX 3050 8GB GDDR6 Gigabyte - Placa de Vídeo",
    );
    expect(s.score).toBeGreaterThan(0.8);
  });

  it("penalizes wrong model numbers", () => {
    const s = matchScore(
      "Placa de Vídeo RTX 3050 8GB",
      "Placa de Vídeo RTX 3060 12GB",
    );
    expect(s.score).toBeLessThan(0.6);
  });

  it("rejects unrelated products", () => {
    const s = matchScore("iPhone 15 Pro Max 256GB", "Capa para iPhone 15");
    expect(s.score).toBeLessThan(0.5);
  });

  it("handles capacity tokens (8gb, 1tb)", () => {
    const same = matchScore("SSD Kingston NV2 1TB NVMe", "SSD NV2 1TB Kingston");
    expect(same.score).toBeGreaterThan(0.7);
    const diff = matchScore("SSD Kingston NV2 1TB NVMe", "SSD Kingston NV2 500GB NVMe");
    expect(diff.score).toBeLessThan(same.score);
  });

  it("accessórios compatíveis não batem com o produto original", () => {
    const s = matchScore(
      "Fifine AM8 Filtro Pop de Microfone - Capa de Microfone",
      "YOUSHARES Microfone compatível com Fifine AM8 - filtro pop",
    );
    expect(s.score).toBeLessThan(0.55);
  });

  it("caso da listagem errada por quantidade: 94 peças ≠ 8 peças", () => {
    const dexter = "Jogo de Ferramentas 94 Peças Dexter";
    const wrong = matchScore(dexter, "Jogo de Soquetes com Chave Catraca 8 Peças");
    const right = matchScore(dexter, "Jogo de Ferramentas 94 Peças com Maleta Dexter");
    expect(right.score).toBeGreaterThan(wrong.score);
    expect(wrong.score).toBeLessThan(0.55);
  });

  it("modelo com/sem unidade casa (3500 vs 3500mb/s), mas 500gb ≠ 1tb", () => {
    const a = matchScore("SSD Kingston NV2 1TB 3500 MB/s", "SSD Kingston NV2 1TB 3500MB/s");
    expect(a.score).toBeGreaterThan(0.7);
    const b = matchScore("SSD Kingston NV2 1TB", "SSD Kingston NV2 500GB");
    expect(b.score).toBeLessThan(0.55);
  });

  it("part number da loja (PvRTX5060tib2f16g) não impede o match do mesmo modelo", () => {
    const s = matchScore(
      "Placa De Vídeo PCyes Nvidia Geforce RTX 5060 Ti, 16gb, Gddr7, Dlss, Ray Tracing, PvRTX5060tib2f16g",
      "Placa de Vídeo ASUS GeForce RTX 5060 Ti Dual OC 16GB GDDR7",
    );
    expect(s.score).toBeGreaterThanOrEqual(0.55);
  });

  it("modelo errado continua rejeitado mesmo com PN embutido", () => {
    const s = matchScore(
      "Placa De Vídeo PCyes RTX 5060 Ti 16gb Gddr7 PvRTX5060tib2f16g",
      "Placa de Vídeo RTX 3050 8GB GDDR6",
    );
    expect(s.score).toBeLessThan(0.55);
  });
});

import { describe, expect, it } from "vitest";
import { specMatch, looksCommodityCategory } from "../src/specmatch";

const SSD_SPECS = ["1tb", "m2", "nvme", "gen4"];

describe("specMatch", () => {
  it("aceita mesma spec em marca diferente", () => {
    const r = specMatch("SSD Sandisk 1TB M.2 NVMe PCIe Gen4 x4", SSD_SPECS);
    expect(r.ok).toBe(true);
    expect(r.score).toBe(1);
  });

  it("rejeita capacidade diferente (eixo conflitante)", () => {
    const r = specMatch("SSD Kingston 500GB M.2 NVMe Gen4", SSD_SPECS);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("capacity");
  });

  it("rejeita geração PCIe diferente", () => {
    const r = specMatch("SSD 1TB M2 NVMe PCIe Gen3", SSD_SPECS);
    expect(r.ok).toBe(false);
  });

  it("aceita quando spec é subconjunto", () => {
    const r = specMatch("SSD 1TB NVMe M.2 Gen 4 Kingston", ["1tb", "nvme"]);
    expect(r.ok).toBe(true);
  });

  it("falha com specs vazias ou não encontradas", () => {
    expect(specMatch("SSD qualquer", []).ok).toBe(false);
    expect(specMatch("Placa de vídeo RTX 3050", ["1tb", "nvme"]).ok).toBe(false);
  });

  it("rejeita 256gb quando pedindo 1tb", () => {
    expect(specMatch("Cartão SD 256GB", ["1tb"]).ok).toBe(false);
  });
});

describe("looksCommodityCategory", () => {
  it("detecta commodities óbvias", () => {
    expect(looksCommodityCategory("SSD Kingston 1TB")).toBe("ssd");
    expect(looksCommodityCategory("Memória DDR4 16GB")).toBe("memoria");
  });

  it("não detecta para itens de marca", () => {
    expect(looksCommodityCategory("Console PlayStation 5")).toBeNull();
    expect(looksCommodityCategory("iPhone 15 Pro Max")).toBeNull();
  });
});

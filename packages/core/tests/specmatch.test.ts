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

  it("une unidade separada por espaço ('27 Pol' = '27pol')", () => {
    const r = specMatch("Monitor Gamer 27 Pol 180 Hz QHD", ["27pol", "180hz", "qhd"]);
    expect(r.ok).toBe(true);
    expect(r.score).toBe(1);
  });

  it("rejeita monitor de polegadas diferentes", () => {
    const r = specMatch("Monitor Gamer 24pol 180Hz IPS", ["27pol", "180hz"]);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("screen");
  });

  it("rejeita monitor com taxa de atualização diferente", () => {
    expect(specMatch("Monitor 27pol QHD 165Hz", ["27pol", "180hz"]).ok).toBe(false);
  });

  it("rejeita fonte com potência diferente", () => {
    expect(specMatch("Fonte 650W 80 Plus Bronze", ["750w"]).ok).toBe(false);
  });

  it("não confunde 'HDMI' do anúncio com resolução 'hd'", () => {
    const r = specMatch("Monitor 27pol QHD 180Hz HDMI DP", ["27pol", "180hz"]);
    expect(r.ok).toBe(true);
  });

  it("spec 'fhd' ausente do título não é conflito de eixo (só score menor)", () => {
    const r = specMatch("Monitor 27pol 180Hz HDMI", ["27pol", "180hz", "fhd"]);
    expect(r.reasons[0]).not.toContain("axis conflict");
    expect(r.ok).toBe(false); // 2/3 specs presentes < 0.75
  });

  it("rejeita resolução diferente (4k ≠ fullhd)", () => {
    expect(specMatch("Monitor 32pol 4K 60Hz", ["4k", "32pol"]).ok).toBe(true);
    expect(specMatch("Monitor 32pol Full HD 60Hz", ["4k", "32pol"]).ok).toBe(false);
  });

  it("spec negativa rejeita listing que a contém (RAM desktop ≠ notebook)", () => {
    const r = specMatch(
      "Memória RAM SODIMM DDR4 16GB 3200MHz para Notebook",
      ["16gb", "ddr4"],
      0.75,
      ["notebook", "sodimm"],
    );
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("notebook");
  });

  it("spec negativa ausente não interfere no match", () => {
    const r = specMatch("Memória RAM Desktop DDR4 16GB 3200MHz", ["16gb", "ddr4"], 0.75, ["notebook"]);
    expect(r.ok).toBe(true);
  });

  it("spec negativa é normalizada (acento/caixa/unidade com espaço)", () => {
    const r = specMatch("Memória 16 GB DDR4 p/ notebook", ["16gb", "ddr4"], 0.75, ["Notebook"]);
    expect(r.ok).toBe(false);
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

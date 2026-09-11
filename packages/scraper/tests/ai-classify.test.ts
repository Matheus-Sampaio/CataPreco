import { describe, expect, it } from "vitest";
import { classifyProduct, parseClassification } from "../src/ai-classify";
import type { AIPort } from "../src/ports";

const fakeAi = (response: string): AIPort => ({
  complete: async () => response,
  describe: () => "fake",
});

describe("parseClassification", () => {
  it("parses commodity SSD", () => {
    const r = parseClassification('{"commodity":true,"category":"ssd","specs":["1TB","M.2","NVMe","Gen4"],"brand":"kingston","reason":"memória de estado sólido"}');
    expect(r?.commodity).toBe(true);
    expect(r?.category).toBe("ssd");
    expect(r?.specs).toEqual(["1tb", "m.2", "nvme", "gen4"]);
    expect(r?.brand).toBe("kingston");
  });

  it("parses não-commodity", () => {
    const r = parseClassification('{"commodity":false,"category":"console","specs":[],"brand":"sony","reason":"produto exato"}');
    expect(r?.commodity).toBe(false);
  });

  it("tolerante a fence e texto extra", () => {
    const r = parseClassification('Aqui está: ```json {"commodity":true,"category":"ram","specs":["16gb","ddr4"]} ``` ok');
    expect(r?.category).toBe("ram");
  });

  it("retorna null em lixo", () => {
    expect(parseClassification("não sei")).toBeNull();
    expect(parseClassification("{}")).toBeNull();
  });
});

describe("classifyProduct", () => {
  it("chama AI e normaliza", async () => {
    const r = await classifyProduct("SSD Kingston NV2 1TB", fakeAi('{"commodity":true,"category":"ssd","specs":["1tb","nvme","m2"],"brand":"kingston","reason":"storage"}'));
    expect(r?.commodity).toBe(true);
    expect(r?.specs).toContain("1tb");
  });

  it("falha da IA retorna null (fallback silencioso)", async () => {
    const ai: AIPort = { complete: async () => { throw new Error("off"); }, describe: () => "x" };
    const r = await classifyProduct("produto", ai);
    expect(r).toBeNull();
  });
});

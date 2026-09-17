import { describe, expect, it } from "vitest";
import { detectImportInfo } from "../src/extractors/importinfo";

const ML = "https://www.mercadolivre.com.br/produto-x/p/MLB123";
const ALI = "https://pt.aliexpress.com/item/123.html";
const KABUM = "https://www.kabum.com.br/produto/1";

describe("detectImportInfo", () => {
  it("página nacional comum (kabum, ML doméstico) → desconhecido/nacional", () => {
    const r = detectImportInfo("<html><body>produto legal, entrega rápida</body></html>", KABUM);
    expect(r.imported).toBeNull(); // kabum não dá indício; host BR não assume importação
    expect(r.taxIncluded).toBeNull();
  });

  it("'estoque no brasil' marca como nacional mesmo em host cross-border", () => {
    const r = detectImportInfo("<html><body>Estoque no Brasil. Envio imediato.</body></html>", ALI);
    expect(r.imported).toBe(false);
  });

  it("'envio internacional' marca como importado", () => {
    const r = detectImportInfo("<html><body>Este item tem envio internacional</body></html>", ML);
    expect(r.imported).toBe(true);
  });

  it("'imposto incluído' marca taxIncluded=true", () => {
    const r = detectImportInfo("<html><body>R$ 500 com imposto incluído</body></html>", ALI);
    expect(r.taxIncluded).toBe(true);
  });

  it("'remessa conforme' também indica imposto incluído", () => {
    const r = detectImportInfo("<html><body>Produto no programa Remessa Conforme</body></html>", ALI);
    expect(r.taxIncluded).toBe(true);
  });

  it("'impostos calculados no checkout' marca taxIncluded=false", () => {
    const r = detectImportInfo("<html><body>Impostos calculados no checkout</body></html>", ALI);
    expect(r.taxIncluded).toBe(false);
  });

  it("host de importação sem sinais → imported=true por heurística de host", () => {
    const r = detectImportInfo("<html><body>some product page</body></html>", ALI);
    expect(r.imported).toBe(true);
    expect(detectImportInfo("<html><body>x</body></html>", "https://www.amazon.com/dp/B0123").imported).toBe(true);
    expect(detectImportInfo("<html><body>x</body></html>", KABUM).imported).toBeNull();
  });
});

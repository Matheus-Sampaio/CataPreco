import { describe, expect, it } from "vitest";
import { productNameFromUrl } from "../src/urlname";

describe("productNameFromUrl", () => {
  it("extrai nome do slug do Mercado Livre", () => {
    expect(
      productNameFromUrl("https://www.mercadolivre.com.br/cafeteira-expresso-tramontina-breville-automatica-inox/p/MLB15095263"),
    ).toBe("Cafeteira Expresso Tramontina Breville Automatica Inox");
  });

  it("extrai nome do slug da Amazon", () => {
    expect(
      productNameFromUrl("https://www.amazon.com.br/FIFINE-AM8-Mic-Pop-Filter/dp/B0D17P4Q7J"),
    ).toBe("Fifine Am8 Mic Pop Filter");
  });

  it("extrai nome do slug da KaBuM", () => {
    expect(
      productNameFromUrl("https://www.kabum.com.br/produto/989702/console-sony-playstation-5-ssd-825gb"),
    ).toBe("Console Sony Playstation 5 Ssd 825gb");
  });

  it("decodifica percent-encoding", () => {
    expect(productNameFromUrl("https://x.com.br/placa-de-v%C3%ADdeo-rtx-3050")).toBe("Placa de Vídeo Rtx 3050");
  });

  it("retorna null para urls sem slug útil (aliexpress item por id)", () => {
    expect(productNameFromUrl("https://pt.aliexpress.com/item/1005007871443623.html")).toBeNull();
    expect(productNameFromUrl("https://shopee.com.br/product/1537142489/58260190803")).toBeNull();
  });

  it("ignora migalhas finais curtas e pega o slug descritivo (Magalu)", () => {
    expect(
      productNameFromUrl("https://www.magazineluiza.com.br/geladeira-refrigerador-brastemp-frost-free-duplex-385l-brm46mk/p/240972300/ed/refr/"),
    ).toBe("Geladeira Refrigerador Brastemp Frost Free Duplex 385l Brm46mk");
    expect(
      productNameFromUrl("https://www.magazineluiza.com.br/panela-de-arroz-eletrica-3l-preta-midea/p/cccc1kcjc3/ep/elpz/"),
    ).toBe("Panela de Arroz Eletrica 3l Preta Midea");
  });

  it("retorna null para urls inválidas", () => {
    expect(productNameFromUrl("não é url")).toBeNull();
  });
});
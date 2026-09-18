import { describe, expect, it } from "vitest";
import { parseBingSearchHtml, unwrapBingUrl } from "../src/search";

const ck = (real: string) =>
  "https://www.bing.com/ck/a?pid=1&u=a1" + Buffer.from(real).toString("base64url");

const SAMPLE = `
<html><body><ol id="b_results">
  <li class="b_algo">
    <h2><a href="${ck("https://www.terabyteshop.com.br/produto/39095/placa-de-video-msi-rtx-5060-ti-16gb")}">Placa de Vídeo MSI RTX 5060 Ti 16GB | Terabyte</a></h2>
    <div class="b_caption"><p>Placa de Vídeo MSI RTX 5060 Ti 16GB por R$ 4.939,90.</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="https://www.pichau.com.br/placa-de-video-asus-rtx5060ti-o16g">Placa de Video Asus RTX 5060 Ti Dual OC 16GB</a></h2>
    <div class="b_caption"><p>Sem preço no snippet.</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="${ck("https://lista.mercadolivre.com.br/rtx-5060-ti-16gb")}">Página de busca do ML — não é produto</a></h2>
  </li>
  <li class="b_algo">
    <h2><a href="https://www.youtube.com/watch?v=xyz">Review de GPU no YouTube</a></h2>
  </li>
  <li class="b_algo">
    <h2><a href="${ck("https://www.terabyteshop.com.br/produto/39095/placa-de-video-msi-rtx-5060-ti-16gb")}">Terabyte duplicada</a></h2>
  </li>
</ol></body></html>
`;

describe("unwrapBingUrl", () => {
  it("decodifica redirect /ck/a?u=a1<base64url>", () => {
    expect(unwrapBingUrl(ck("https://loja.com.br/p/1"))).toBe("https://loja.com.br/p/1");
  });
  it("link direto passa intacto", () => {
    expect(unwrapBingUrl("https://loja.com.br/p/2")).toBe("https://loja.com.br/p/2");
  });
  it("bing sem u= válido → null", () => {
    expect(unwrapBingUrl("https://www.bing.com/search?q=x")).toBeNull();
  });
});

describe("parseBingSearchHtml", () => {
  it("extrai lojas, pula páginas de busca e redes, sem duplicar", () => {
    const hits = parseBingSearchHtml(SAMPLE);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.marketplace).toBe("terabyteshop.com.br");
    expect(hits[1]!.marketplace).toBe("pichau.com.br");
  });

  it("preço do snippet quando presente", () => {
    const hits = parseBingSearchHtml(SAMPLE);
    expect(hits[0]!.priceCents).toBe(493990);
    expect(hits[1]!.priceCents).toBeNull();
  });
});

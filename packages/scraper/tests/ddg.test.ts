import { describe, expect, it } from "vitest";
import { parseDuckDuckGoHtml } from "../src/search";

const SAMPLE = `
<html><body>
  <div class="result">
    <a class="result__a" href="https://3dprime.com.br/produto/impressora-3d-bambu-lab-a1-mini-sem-combo/">Impressora 3D Bambu Lab A1 MINI</a>
    <a class="result__snippet" href="#">Impressora 3D Bambu Lab A1 MINI por R$ 2.087,10 à vista na 3D Prime.</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=ads.example&amp;u3=...">Anúncio — não deve entrar</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://www.beehive.com.br/produtos/bambu-lab-impressora-a1-mini/">Bambu Lab - IMPRESSORA A1 MINI</a>
    <a class="result__snippet" href="#">Bambu Lab A1 Mini disponível na Beehive.</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://www.youtube.com/watch?v=xyz">Review no YouTube — não é loja</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://www.beehive.com.br/produtos/bambu-lab-impressora-a1-mini/">Duplicado — mesma URL</a>
  </div>
</body></html>
`;

describe("parseDuckDuckGoHtml", () => {
  it("extrai lojas, ignora ads e redes, sem duplicar URL", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.marketplace).toBe("3dprime.com.br");
    expect(hits[1]!.marketplace).toBe("beehive.com.br");
  });

  it("extrai preço do snippet quando presente", () => {
    const hits = parseDuckDuckGoHtml(SAMPLE);
    expect(hits[0]!.priceCents).toBe(208710);
    expect(hits[1]!.priceCents).toBeNull();
  });

  it("resolve redirect uddg do DDG", () => {
    const html = `<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Floja.com.br%2Fprod%2F1">Produto X</a>`;
    const hits = parseDuckDuckGoHtml(html);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.url).toBe("https://loja.com.br/prod/1");
  });

  it("html vazio → nada", () => {
    expect(parseDuckDuckGoHtml("<html></html>")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { makeSearxngSource, parseSearxngJson } from "../src/search";

const SAMPLE = JSON.stringify({
  results: [
    {
      url: "https://www.gtmax3d.com.br/impressora-3d-bambu-lab-a1-mini",
      title: "Impressora 3D Bambu Lab A1 Mini | GTMax3D",
      content: "Impressora 3D Bambu Lab A1 Mini por R$ 2.599,00 na GTMax3D.",
    },
    {
      url: "https://3dlab.com.br/produto/impressora-3d-bambu-lab-a1",
      title: "Impressora 3D Bambu Lab A1 - 3D Lab",
      content: "Compre na 3D Lab.",
    },
    { url: "https://lista.mercadolivre.com.br/bambu-a1", title: "Busca no ML — não é produto" },
    { url: "https://www.youtube.com/watch?v=xyz", title: "Review YouTube" },
    { url: "https://3dlab.com.br/produto/impressora-3d-bambu-lab-a1", title: "Duplicado" },
  ],
});

describe("parseSearxngJson", () => {
  it("extrai lojas, filtra busca/redes, sem duplicar", () => {
    const hits = parseSearxngJson(SAMPLE);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.marketplace).toBe("gtmax3d.com.br");
    expect(hits[1]!.marketplace).toBe("3dlab.com.br");
  });

  it("preço do snippet quando presente", () => {
    const hits = parseSearxngJson(SAMPLE);
    expect(hits[0]!.priceCents).toBe(259900);
    expect(hits[1]!.priceCents).toBeNull();
  });

  it("JSON inválido → vazio", () => {
    expect(parseSearxngJson("<html>erro</html>")).toHaveLength(0);
    expect(parseSearxngJson("{}")).toHaveLength(0);
  });
});

describe("makeSearxngSource", () => {
  it("monta URL com format=json e pt-BR", () => {
    const s = makeSearxngSource("http://searxng:8080/");
    expect(s.buildUrl("impressora 3d")).toBe("http://searxng:8080/search?q=impressora%203d&format=json&language=pt-BR");
    expect(s.accumulate).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { firecrawlHtml } from "../src/runtime/firecrawl";

describe("firecrawlHtml", () => {
  it("extrai html de rawHtml/html", () => {
    expect(firecrawlHtml({ data: { rawHtml: "<h1>ok</h1>", metadata: { sourceURL: "https://x", statusCode: 200 } } })?.html).toBe("<h1>ok</h1>");
    expect(firecrawlHtml({ data: { html: "<p>a</p>" } })?.html).toBe("<p>a</p>");
  });

  it("usa markdown quando não há html", () => {
    expect(firecrawlHtml({ data: { markdown: "# Título\n\npreco R$ 10" } })?.html).toContain("# Título");
  });

  it("retorna null em payload vazio", () => {
    expect(firecrawlHtml({})).toBeNull();
    expect(firecrawlHtml({ data: {} })).toBeNull();
  });
});
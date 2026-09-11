import { load } from "cheerio";
import { parsePrice } from "@catapreco/core";
import type { SiteAdapter } from "./types.js";
import { extractJsonLd } from "../extractors/jsonld.js";

/**
 * VTEX-family adapter (FastShop, e outros).
 * VTEX SSR traz JSON-LD Product na maioria dos casos; quando não,
 * caímos no state embutido / meta tags e no genérico.
 */
export function makeVtexAdapter(
  id: string,
  name: string,
  domains: string[],
): SiteAdapter {
  return {
    id,
    name,
    domains,
    extract(ctx) {
      const viaJsonLd = extractJsonLd(ctx);
      if (viaJsonLd.candidates.length > 0) return viaJsonLd;

      const $ = load(ctx.html);
      const candidates: typeof viaJsonLd.candidates = [];
      // VTEX classic: window.__RUNTIME__.offer / priceRange
      const runtime = $("script")
        .map((_, el) => $(el).html() ?? "")
        .get()
        .filter((s) => s.includes("priceRange") || s.includes("__RUNTIME__"))
        .join("\n");
      const priceMatch = runtime.match(/"listPrice"\s*:\s*(\d+(?:[.,]\d+)?)/i) ?? runtime.match(/"spotPrice"\s*:\s*(\d+(?:[.,]\d+)?)/i);
      if (priceMatch) {
        const v = parsePrice(priceMatch[1]!);
        if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.7, label: `${id} runtime` });
      }
      if (!viaJsonLd.name && candidates.length === 0) return null;
      return { ...viaJsonLd, candidates };
    },
  };
}

export const fastshop = makeVtexAdapter("fastshop", "Fast Shop", ["site.fastshop.com.br", "fastshop.com.br"]);

// Sites no-registry (sem adapter próprio) que seguem por JSON-LD/genérico,
// registrados para nomeação na UI e sinalização de browser.
export { makeVtexAdapter as vtexFactory };

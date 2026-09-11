import { load } from "cheerio";
import { parsePrice, type PriceCandidate } from "@catapreco/core";
import type { SiteAdapter } from "./types";
import { extractJsonLd } from "../extractors/jsonld";

/**
 * AliExpress — client-heavy; needs browser. Extracts from JSON-LD or
 * price container classes. Currency is typically USD on .com.
 */
export const aliexpress: SiteAdapter = {
  id: "aliexpress",
  name: "AliExpress",
  domains: ["aliexpress.com"],
  needsBrowser: true,
  extract(ctx) {
    const viaJsonLd = extractJsonLd(ctx);
    const $ = load(ctx.html);
    const candidates: PriceCandidate[] = [...viaJsonLd.candidates];

    if (candidates.length === 0) {
      const sel = '[class*="price--currentPrice"], [class*="product-price-value"], [class*="uniform-banner-box-price"]';
      const text = $(sel).first().text().trim();
      const v = parsePrice(text);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.75, label: "aliexpress current price" });
    }

    const name = viaJsonLd.name ?? $('meta[property="og:title"]').attr("content") ?? $("h1").first().text().trim() ?? null;
    const image = viaJsonLd.image ?? $('meta[property="og:image"]').attr("content") ?? null;
    const currency = viaJsonLd.currency ?? "USD";

    if (!name && candidates.length === 0) return null;
    return { name, image, currency, stock: viaJsonLd.stock === "unknown" ? "in_stock" : viaJsonLd.stock, candidates };
  },
};

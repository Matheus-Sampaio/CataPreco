import { load } from "cheerio";
import { parsePrice } from "@catapreco/core";
import type { SiteAdapter } from "./types";
import { extractJsonLd } from "../extractors/jsonld";

/**
 * Magazine Luiza — data-testid based price nodes plus JSON-LD.
 */
export const magalu: SiteAdapter = {
  id: "magalu",
  name: "Magazine Luiza",
  domains: ["magazineluiza.com.br", "magalu.com"],
  needsBrowser: true,
  extract(ctx) {
    const viaJsonLd = extractJsonLd(ctx);
    const $ = load(ctx.html);
    const candidates = [...viaJsonLd.candidates];

    const push = (sel: string, confidence: number, label: string) => {
      const text = $(sel).first().text().trim();
      const v = parsePrice(text);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence, label });
    };

    if (candidates.length === 0) {
      push('p[data-testid="price-value"]', 0.85, "magalu price-value");
      push('[data-testid="price-value"]', 0.8, "magalu price-value");
    }

    const inst = $("body").text().match(/(\d{1,2})x\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
    if (inst) {
      const v = parsePrice(inst[2]);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.35, label: `parcelado ${inst[1]}x`, isInstallment: true });
    }

    const name = viaJsonLd.name ?? $('h1[data-testid="heading-product-title"]').first().text().trim() ?? null;
    const image = viaJsonLd.image ?? $('meta[property="og:image"]').attr("content") ?? null;
    let stock = viaJsonLd.stock;
    if (stock === "unknown") {
      const bodyText = $("body").text();
      stock = /produto indispon[ií]vel|avise[- ]me/i.test(bodyText) ? "out_of_stock" : "in_stock";
    }

    if (!name && candidates.length === 0) return null;
    return { name, image, currency: "BRL", stock, candidates };
  },
};

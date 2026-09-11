/**
 * Adapters for marketplaces with hostile anti-bot (DataDome/Akamai).
 * They stay minimal — the pipeline's browser path + proxy pool does the
 * heavy lifting; these just add tuned selectors/flags.
 */

import { load } from "cheerio";
import { parsePrice, type StockStatus } from "@catapreco/core";
import type { SiteAdapter } from "./types.js";
import { extractJsonLd } from "../extractors/jsonld.js";

/** Shopee Brasil — DataDome; often needs cookies warm-up. */
export const shopee: SiteAdapter = {
  id: "shopee",
  name: "Shopee",
  domains: ["shopee.com.br", "shopee.com"],
  needsBrowser: true,
  extract(ctx) {
    const viaJsonLd = extractJsonLd(ctx);
    const $ = load(ctx.html);
    const candidates = [...viaJsonLd.candidates];

    if (candidates.length === 0) {
      // Shopee embeds product data in scripts: prefer window.__INITIAL_STATE__
      const stateMatch = $.html().match(/__INITIAL_STATE__\s*=\s*({.+?})\s*<\/script/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]!) as Record<string, unknown>;
          const item = (state?.["itemDetail"] as Record<string, unknown> | undefined)?.["itemInfo"]
            ?? (state?.["data"] as Record<string, unknown> | undefined)?.["item"];
          const price = (item as Record<string, unknown> | undefined)?.["price_min"] ?? (item as Record<string, unknown> | undefined)?.["price"];
          const v = parsePrice(Number(price) / 100000); // shopee prices are ×100000
          if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.8, label: "shopee state" });
        } catch { /* fallthrough */ }
      }
    }

    const name = viaJsonLd.name ?? $('meta[property="og:title"]').attr("content") ?? $("title").text().trim() ?? null;
    const image = viaJsonLd.image ?? $('meta[property="og:image"]').attr("content") ?? null;

    let stock: StockStatus = viaJsonLd.stock;
    if (stock === "unknown") {
      const t = $("body").text();
      stock = /esgotado|sem estoque|produto indisponível/i.test(t) ? "out_of_stock" : "in_stock";
    }

    if (!name && candidates.length === 0) return null;
    return { name, image, currency: "BRL", stock, candidates };
  },
};

/** Leroy Merlin — DataDome CAPTCHA. */
export const leroymerlin: SiteAdapter = {
  id: "leroymerlin",
  name: "Leroy Merlin",
  domains: ["leroymerlin.com.br"],
  needsBrowser: true,
  extract(ctx) {
    return extractJsonLd(ctx);
  },
};


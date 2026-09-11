import { load } from "cheerio";
import { parsePrice, type StockStatus } from "@catapreco/core";
import type { SiteAdapter } from "./types";
import { extractJsonLd } from "../extractors/jsonld";

/**
 * Kabum! — Next.js SSR with JSON-LD and stable price classes.
 */
export const kabum: SiteAdapter = {
  id: "kabum",
  name: "KaBuM!",
  domains: ["kabum.com.br"],
  needsBrowser: true,
  extract(ctx) {
    const viaJsonLd = extractJsonLd(ctx);
    const $ = load(ctx.html);
    const candidates = [...viaJsonLd.candidates];

    const push = (sel: string, confidence: number, label: string, isInstallment = false) => {
      const text = $(sel).first().text().trim();
      const v = parsePrice(text);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence, label, isInstallment });
    };

    if (candidates.length === 0) {
      push("h4.finalPrice", 0.85, "kabum finalPrice");
      push(".finalPrice", 0.8, "kabum finalPrice");
      push('[class*="finalPrice"]', 0.75, "kabum finalPrice*");
    }

    // Installment & list prices
    const inst = $("body").text().match(/(\d{1,2})\s*x\s*de\s*R?\$?\s*([\d.,]+)/i);
    if (inst) {
      const v = parsePrice(inst[2]);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.35, label: `parcelado ${inst[1]}x`, isInstallment: true });
    }
    push(".regularPrice", 0.4, "lista (riscado)");
    push('[class*="oldPrice"]', 0.4, "lista (riscado)");

    let stock: StockStatus = viaJsonLd.stock;
    if (stock === "unknown") {
      const bodyText = $("body").text();
      stock = /produto indispon[ií]vel|avise[- ]me/i.test(bodyText) ? "out_of_stock" : "in_stock";
    }

    const name = viaJsonLd.name ?? $("h1").first().text().trim() ?? null;
    const image = viaJsonLd.image ?? $('meta[property="og:image"]').attr("content") ?? null;

    if (!name && candidates.length === 0) return null;
    return { name, image, currency: "BRL", stock, candidates };
  },
};

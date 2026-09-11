import { load } from "cheerio";
import { parsePrice, type StockStatus } from "@catapreco/core";
import type { SiteAdapter } from "./types";
import { extractJsonLd } from "../extractors/jsonld";

/**
 * Mercado Livre BR.
 * ML server-renders JSON-LD reliably; DOM fallback targets .ui-pdp-* classes.
 */
export const mercadolivre: SiteAdapter = {
  id: "mercadolivre",
  name: "Mercado Livre",
  domains: ["mercadolivre.com.br", "mercadolibre.com", "mercadolivre.com"],
  extract(ctx) {
    const viaJsonLd = extractJsonLd(ctx);
    const $ = load(ctx.html);

    // DOM fallback/refinement for price
    const candidates = [...viaJsonLd.candidates];
    if (candidates.length === 0) {
      const fraction = $(".ui-pdp-price .andes-money-amount__fraction, .ui-pdp-price__second-line .andes-money-amount__fraction").first().text().trim();
      const centsEl = $(".ui-pdp-price .andes-money-amount__cents").first().text().trim();
      if (fraction) {
        const raw = centsEl ? `${fraction},${centsEl}` : fraction;
        const value = parsePrice(raw);
        if (value) candidates.push({ valueCents: value, source: "adapter", confidence: 0.85, label: "ML ui-pdp-price" });
      }
    }

    // Last resort: first money rendered anywhere on the page (catalog pages
    // lack the classic ui-pdp-price wrapper)
    if (candidates.length === 0) {
      const fraction = $(".andes-money-amount__fraction").first().text().trim();
      const centsEl = $(".andes-money-amount__cents").first().text().trim();
      if (fraction) {
        const raw = centsEl ? `${fraction},${centsEl}` : fraction;
        const value = parsePrice(raw);
        if (value) candidates.push({ valueCents: value, source: "adapter", confidence: 0.55, label: "ML money-amount genérico" });
      }
    }

    // Installment info: "em 10x R$ 333" — never the main price
    const instText = $(".ui-pdp-price__subtitles, .ui-pdp-price .ui-pdp-color--GREEN, .ui-pdp-price__subtitles").first().text();
    const inst = instText.match(/(\d{1,2})x\s*R?\$?\s*([\d.,]+)/i);
    if (inst) {
      const v = parsePrice(inst[2]);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.35, label: `parcelado ${inst[1]}x`, isInstallment: true });
    }

    // Stock
    let stock: StockStatus = viaJsonLd.stock;
    if (stock === "unknown") {
      const stockText = $(".ui-pdp-stock-information__title, #buybox-form .ui-pdp-color--RED").text();
      if (/sem estoque|esgotado/i.test(stockText)) stock = "out_of_stock";
      else if ($("#buybox-form button[type='submit'], .andes-button--loud").length > 0) stock = "in_stock";
    }

    const name = viaJsonLd.name ?? $("h1.ui-pdp-title").first().text().trim() ?? null;
    const image = viaJsonLd.image ?? $(".ui-pdp-gallery__figure img").first().attr("src") ?? null;

    if (!name && candidates.length === 0) return null;
    return {
      name: name || null,
      image,
      currency: viaJsonLd.currency ?? "BRL",
      stock,
      candidates,
    };
  },
};

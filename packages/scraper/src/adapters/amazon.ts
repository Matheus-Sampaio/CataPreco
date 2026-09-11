import { load } from "cheerio";
import { parsePrice, type PriceCandidate, type StockStatus } from "@catapreco/core";
import type { SiteAdapter } from "./types";

/**
 * Amazon (BR + .com). Heavy anti-bot: pipeline escalates to browser.
 * Price lives in hidden .a-offscreen spans (machine-readable plain text).
 */
export const amazon: SiteAdapter = {
  id: "amazon",
  name: "Amazon",
  domains: ["amazon.com.br", "amazon.com"],
  needsBrowser: true,
  extract(ctx) {
    const $ = load(ctx.html);
    const candidates: PriceCandidate[] = [];

    const pushOffscreen = (selector: string, confidence: number, label: string, isInstallment = false) => {
      const el = $(selector)
        .filter((_, e) => /\d/.test($(e).text()))
        .first();
      const text = el.text().trim();
      if (!text) return;
      const v = parsePrice(text);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence, label, isInstallment });
    };

    pushOffscreen("#corePrice_feature_div .a-offscreen", 0.82, "amazon corePrice");
    pushOffscreen("#corePriceDisplay_desktop_feature_div .a-offscreen", 0.82, "amazon corePriceDisplay");
    pushOffscreen("#apex_desktop .a-price .a-offscreen", 0.78, "amazon apex");
    pushOffscreen("#priceblock_ourprice", 0.78, "amazon ourprice");
    pushOffscreen("#priceblock_dealprice", 0.78, "amazon dealprice");
    pushOffscreen(".basisPrice .a-offscreen", 0.4, "lista (riscado)");

    // Whole/fraction split fallback ("1.234" + "56")
    if (candidates.length === 0) {
      const whole = $(".a-price .a-price-whole").first().text().trim();
      const frac = $(".a-price .a-price-fraction").first().text().trim();
      if (whole) {
        const v = parsePrice(`${whole}${frac}`);
        if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 1 * 0.7, label: "amazon whole+fraction" });
      }
    }

    // Buybox installments ("em até 10x de R$ ...") — never the main price
    const inst = $("#installmentCalculator_feature_div, .best-offer-name").first().text().match(/(\d{1,2})x\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i);
    if (inst) {
      const v = parsePrice(inst[2]);
      if (v) candidates.push({ valueCents: v, source: "adapter", confidence: 0.3, label: `parcelado ${inst[1]}x`, isInstallment: true });
    }

    const avail = $("#availability span").first().text().trim();
    let stock: StockStatus = "unknown";
    if (avail) {
      if (/em estoque|in stock/i.test(avail)) stock = "in_stock";
      else if (/indispon|unavailable|esgotad/i.test(avail)) stock = "out_of_stock";
    }

    const name = $("#productTitle").first().text().trim() || $("title").text().trim() || null;
    const image = $("#landingImage").attr("src") ?? $('meta[property="og:image"]').attr("content") ?? null;
    const host = new URL(ctx.url).hostname;
    const currency = host.endsWith(".br") ? "BRL" : "USD";

    if (!name && candidates.length === 0) return null;
    return { name, image, currency, stock, candidates };
  },
};

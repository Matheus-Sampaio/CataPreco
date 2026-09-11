/**
 * Generic CSS extractor — smart heuristics that find price patterns on any page:
 * meta tags, itemprop microdata, price-looking classes, installment detection,
 * list (struck-through) prices, Pix prices, stock signals.
 * Pure: HTML string in, ExtractionResult out.
 */

import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { parsePrice } from "@catapreco/core";
import type { ExtractionContext, ExtractionResult } from "./types";

const INSTALLMENT_RE = /(\d{1,2})\s*x\s*(?:de\s*)?R?\$?\s*([\d.,]+)/i;
const PIX_RE = /pix/i;
const STRUCK_TAGS = new Set(["DEL", "S", "STRIKE"]);
const STRUCK_CLASS_RE = /(old|regular|de:|riscado|original|list-price|listprice|was-price)/i;
const PRICE_CLASS_RE = /(price|preco|valor|amount)/i;
const OUT_OF_STOCK_RE = /(avise[- ]me|indispon[ií]vel|esgotado|fora de estoque|out of stock|currently unavailable|sem estoque)/i;
const IN_STOCK_RE = /(adicionar ao carrinho|adicionar \u00e0 sacola|comprar agora|add to cart|buy now|em estoque)/i;

function isHidden($: CheerioAPI, el: AnyNode): boolean {
  let node: AnyNode | null = el;
  while (node && node.type === "tag") {
    const style = ($(node).attr("style") ?? "").replace(/\s/g, "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
    const cls = ($(node).attr("class") ?? "").toLowerCase();
    if (/hidden|sr-only|visually-hidden/.test(cls)) return true;
    node = node.parent as AnyNode | null;
  }
  return false;
}

function isStruck($: CheerioAPI, el: AnyNode): boolean {
  let node: AnyNode | null = el;
  while (node && node.type === "tag") {
    if (STRUCK_TAGS.has(node.tagName.toUpperCase())) return true;
    node = node.parent as AnyNode | null;
  }
  return false;
}

export function extractGeneric({ html }: ExtractionContext): ExtractionResult {
  const $ = load(html);
  const candidates: ExtractionResult["candidates"] = [];
  const seen = new Set<number>();

  const push = (raw: string | number | null, confidence: number, label: string, isInstallment = false) => {
    const cents = parsePrice(raw);
    if (!cents || seen.has(cents)) return;
    seen.add(cents);
    candidates.push({ valueCents: cents, source: "generic", confidence, label, isInstallment });
  };

  // 1. Meta tags (strong signals)
  const metaPrice =
    $('meta[itemprop="price"]').attr("content") ??
    $('meta[property="product:price:amount"]').attr("content") ??
    $('meta[property="og:price:amount"]').attr("content");
  if (metaPrice) push(metaPrice, 0.8, "meta price");

  const metaCurrency = $('meta[itemprop="priceCurrency"]').attr("content")
    ?? $('meta[property="product:price:currency"]').attr("content") ?? null;

  // 2. Microdata elements
  $('[itemprop="price"]').each((_, el) => {
    if (isHidden($, el)) return;
    const content = $(el).attr("content");
    push(content ?? $(el).text(), 0.75, "itemprop=price");
  });

  // 3. Price-looking classes/ids
  const $els = $('[class*="price" i], [id*="price" i], [class*="preco" i], [id*="preco" i]');
  $els.slice(0, 120).each((_, el) => {
    if (isHidden($, el)) return;
    const text = ($(el).text() ?? "").trim();
    if (text.length === 0 || text.length > 200) return;

    const installment = text.match(INSTALLMENT_RE);
    if (installment) {
      push(installment[2] ?? "", 0.35, `parcelado ${installment[1]}x`, true);
      return; // don't double-count the installment value as main price
    }
    if (isStruck($, el) || STRUCK_CLASS_RE.test($(el).attr("class") ?? "")) {
      push(text, 0.3, "lista (riscado)");
      return;
    }
    if (PIX_RE.test(text)) {
      push(text.replace(PIX_RE, ""), 0.7, "à vista/pix");
      return;
    }
    if (/R\$/.test(text)) push(text, 0.55, "css price");
  });

  // 3b. Installments anywhere ("10x de R$ 210,90") — not price-class-bound
  $("*").slice(0, 800).each((_, el) => {
    if (isHidden($, el)) return;
    const own = $(el).contents().filter((_, n) => n.type === "text").text().trim();
    if (own.length === 0 || own.length > 160) return;
    const inst = own.match(INSTALLMENT_RE);
    if (inst) push(inst[2] ?? "", 0.35, `parcelado ${inst[1]}x`, true);
  });

  // 4. Title
  const name =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    null;

  const image =
    $('meta[property="og:image"]').attr("content") ??
    $('img[itemprop="image"]').attr("src") ??
    null;

  // 5. Stock from visible text
  const bodyText = $("body").text().replace(/\s+/g, " ");
  let stock: ExtractionResult["stock"] = "unknown";
  if (OUT_OF_STOCK_RE.test(bodyText) && !IN_STOCK_RE.test(bodyText)) stock = "out_of_stock";
  else if (IN_STOCK_RE.test(bodyText)) stock = "in_stock";

  return { name, image, currency: metaCurrency, stock, candidates };
}

/** Compact visible text for AI analysis (bounded to keep prompts small). */
export function visibleTextSummary(html: string, limit = 6000): string {
  const $ = load(html);
  // schema/prices metas
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const metaPrice =
    $('meta[itemprop="price"]').attr("content") ??
    $('meta[property="product:price:amount"]').attr("content") ??
    "";

  $("script, style, noscript, svg, header, footer, nav, iframe, form").remove();

  // pega blocos de preço candidatos primeiro (o sinal mais rico pro LLM)
  const priceBits: string[] = [];
  $('[class*="price" i], [id*="price" i], [class*="preco" i], [id*="preco" i], [class*="valor" i]')
    .slice(0, 30)
    .each((_, el) => {
      const t = ($(el).text() ?? "").replace(/\s+/g, " ").trim();
      if (t.length > 3 && t.length < 120) priceBits.push(t);
    });

  const body = $("body").text().replace(/\s+/g, " ").trim();
  // monta: título + preços explicitos + início do texto
  const head = [
    ogTitle ? `TÍTULO: ${ogTitle}` : "",
    metaPrice ? "PREÇO META: " + metaPrice : "",
    priceBits.length ? `CANDIDATOS DE PREÇO NA TELA:\n- ${priceBits.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const remaining = Math.max(0, limit - head.length);
  return head + (head ? "\n\nTEXTO DA PÁGINA:\n" : "") + body.slice(0, remaining);
}

/**
 * Cross-marketplace product search.
 *
 * Mercado Livre exposes a public JSON search API (no key needed).
 * Other marketplaces fall back to internal endpoints or HTML search pages.
 * All parsers are pure functions — URL builders + JSON/HTML parsers.
 */

import { load } from "cheerio";
import { parsePrice, normalizeName, modelTokensOf, matchScore, DEFAULT_MATCH_THRESHOLD } from "@catapreco/core";
import type { SearchHit } from "./adapters/types";

export interface ScoredHit extends SearchHit {
  score: number;
}

/** Scores and filters search hits against the tracked product name. */
export function filterMatchingHits(
  productName: string,
  hits: SearchHit[],
  threshold: number = DEFAULT_MATCH_THRESHOLD,
): ScoredHit[] {
  return hits
    .map((h) => ({ ...h, score: matchScore(productName, h.title).score }))
    .filter((h) => h.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

const FILLER_TOKENS = new Set([
  "de", "com", "para", "cor", "preto", "preta", "branco", "branca", "novo", "nova",
  "the", "and", "with", "gb", "tb", // units usually paired; model tokens still kept via regex
]);

/**
 * Builds a compact search query: first tokens (category words) + brand +
 * every model token, capped at 6. Long queries return no results on ML.
 */
export function buildQuery(productName: string): string {
  const norm = normalizeName(productName);
  const tokens = norm.split(" ").filter((t) => t.length > 1);
  const models = modelTokensOf(norm);

  const picked: string[] = [];
  const add = (t: string) => {
    if (!picked.includes(t) && !FILLER_TOKENS.has(t) && picked.length < 6) picked.push(t);
  };

  // 1) primeiros 2 tokens (categoria do produto)
  for (const t of tokens.slice(0, 4)) {
    if (picked.length >= 2) break;
    add(t);
  }
  // 2) todos os model tokens (códigos de marca/modelo importam)
  for (const m of models) add(m);
  // 3) preenche o restante com os próximos tokens (geralmente a marca)
  for (const t of tokens) add(t);

  return picked.join(" ");
}

/**
 * Query ladder: from most specific to broadest. The caller tries each
 * until it finds >= 1 matching hit — very specific queries return
 * noisy/zero results on many sites.
 */
export function queryLadder(productName: string): string[] {
  const full = buildQuery(productName);
  const norm = normalizeName(productName);
  const tokens = norm.split(" ").filter((t) => t.length > 0);
  const models = modelTokensOf(norm);
  const nonModelNonFiller = (t: string) => !FILLER_TOKENS.has(t) && !models.has(t);
  const cat = tokens.find(nonModelNonFiller) ?? tokens[0];
  const brand = tokens.find((t) => t !== cat && nonModelNonFiller(t));
  const size = tokens.find((t) => /^\d+(gb|tb)$/i.test(t));

  const ladder = [
    full,
    [cat, brand, size].filter(Boolean).join(" "),
    [cat, size].filter(Boolean).join(" "),
    cat ?? "",
  ].filter((q) => q.length >= 3);

  return [...new Set(ladder)];
}

// ---------------- Mercado Livre ----------------

/** Public JSON API (needs an access token on most IPs today — kept for reference). */
export const ML_API_SEARCH_URL = (q: string) =>
  `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=8`;

/** HTML search page — works via the browser path. */
export const ML_SEARCH_URL = (q: string) =>
  `https://lista.mercadolivre.com.br/${normalizeName(q).replace(/\s+/g, "-")}`;

/**
 * Parses ML's lista.mercadolivre.com.br search page (poly-card layout).
 * Sponsored cards wrapped in click-trackers are skipped (URL isn't resolvable
 * without following the tracker); cards with direct /p/MLB links are kept.
 */
export function parseMlSearchHtml(html: string): SearchHit[] {
  const $ = load(html);
  const hits: SearchHit[] = [];
  $(".poly-card").slice(0, 20).each((_, el) => {
    const card = $(el);
    const a = card
      .find('a[href*="mercadolivre.com.br/"][href*="/p/MLB"]')
      .filter((_, x) => !/click\d*\./.test($(x).attr("href") ?? ""))
      .first();
    const href = a.attr("href");
    const title =
      card.find(".poly-component__title").first().text().trim() ||
      card.find("img.poly-component__picture").first().attr("alt")?.trim() ||
      "";
    const frac = card.find(".andes-money-amount__fraction").first().text().trim();
    const cents = card.find(".andes-money-amount__cents").first().text().trim();
    const priceCents = frac ? parsePrice(cents ? `${frac},${cents}` : frac) : null;
    const image = card.find("img.poly-component__picture").first().attr("src") ?? null;
    if (href && title && priceCents) {
      hits.push({ marketplace: "Mercado Livre", title, url: href.split("#")[0]!, priceCents, image });
    }
  });
  return hits;
}

interface MlApiItem {
  title?: string;
  permalink?: string;
  price?: number;
  thumbnail?: string;
  available_quantity?: number;
  catalog_listing?: boolean;
}

export function parseMlSearch(json: unknown): SearchHit[] {
  const results = (json as { results?: MlApiItem[] })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => r && r.title && r.permalink && typeof r.price === "number")
    .map((r) => ({
      marketplace: "Mercado Livre",
      title: r.title!,
      url: r.permalink!,
      priceCents: Math.round((r.price as number) * 100),
      image: r.thumbnail ?? null,
    }));
}

// ---------------- Amazon BR (HTML search page, best effort) ----------------

export const AMAZON_BR_SEARCH_URL = (q: string) =>
  `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}`;

export function parseAmazonSearchHtml(html: string): SearchHit[] {
  const $ = load(html);
  const hits: SearchHit[] = [];
  $('[data-component-type="s-search-result"]').slice(0, 12).each((_, el) => {
    const title = $(el).find("h2 span, h2").first().text().trim();
    // only direct /dp/ links — skip sponsored click-trackers (sspa/click)
    const href = $(el)
      .find('a[href*="/dp/"]')
      .filter((_, a) => /\/dp\/B[A-Z0-9]{9}/.test($(a).attr("href") ?? ""))
      .first()
      .attr("href");
    const priceText = $(el).find(".a-price .a-offscreen").first().text().trim();
    const image = $(el).find("img.s-image").first().attr("src") ?? null;
    const priceCents = parsePrice(priceText);
    if (title && href && priceCents) {
      const asin = href.match(/\/dp\/(B[A-Z0-9]{9})/);
      hits.push({
        marketplace: "Amazon Brasil",
        title,
        url: asin ? `https://www.amazon.com.br/dp/${asin[1]}` : `https://www.amazon.com.br${href}`,
        priceCents,
        image,
      });
    }
  });
  return hits;
}

// ---------------- Kabum (Next.js __NEXT_DATA__ embedded) ----------------

export const KABUM_SEARCH_URL = (q: string) =>
  `https://www.kabum.com.br/busca/${encodeURIComponent(q)}`;

interface KabumProduct {
  code?: number | string;
  friendlyName?: string;
  name?: string;
  price?: number;
  priceWithDiscount?: number | null;
  available?: boolean;
  image?: string;
  thumbnail?: string;
}

/** Kabum search pages embed results in __NEXT_DATA__ (SSR Next.js). */
export function parseKabumSearchHtml(html: string): SearchHit[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
  if (!m) return [];
  try {
    const json = JSON.parse(m[1]!);
    const list: KabumProduct[] = json?.props?.pageProps?.data?.catalogServer?.data ?? [];
    return list
      .filter((p) => p?.code && p.name && (p.priceWithDiscount ?? p.price) != null)
      .slice(0, 12)
      .map((p) => {
        const price = p.priceWithDiscount ?? p.price!;
        return {
          marketplace: "KaBuM!",
          title: p.name!,
          url: `https://www.kabum.com.br/produto/${p.code}/${p.friendlyName ?? ""}`,
          priceCents: Math.round(price * 100),
          image: p.image ?? p.thumbnail ?? null,
        };
      });
  } catch {
    return [];
  }
}

export interface SearchSource {
  id: string;
  marketplace: string;
  buildUrl: (query: string) => string;
  format: "json" | "html";
  parse: (payload: string) => SearchHit[];
}

export const SEARCH_SOURCES: SearchSource[] = [
  { id: "ml", marketplace: "Mercado Livre", buildUrl: ML_SEARCH_URL, format: "html", parse: parseMlSearchHtml },
  { id: "amazon-br", marketplace: "Amazon Brasil", buildUrl: AMAZON_BR_SEARCH_URL, format: "html", parse: parseAmazonSearchHtml },
  { id: "kabum", marketplace: "KaBuM!", buildUrl: KABUM_SEARCH_URL, format: "html", parse: parseKabumSearchHtml },
];

/**
 * JSON-LD extractor — reads schema.org Product structured data.
 * Highest-confidence source (the retailer itself declares the price).
 * Pure: HTML string in, ExtractionResult out.
 */

import { load } from "cheerio";
import { parsePrice, type StockStatus } from "@catapreco/core";
import type { ExtractionContext, ExtractionResult } from "./types";
import { EMPTY_RESULT } from "./types";

type Json = Record<string, unknown>;

function tryParse(raw: string): unknown | null {
  const attempts = [
    raw,
    raw.replace(/,\s*([}\]])/g, "$1"), // trailing commas
  ];
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try next */
    }
  }
  return null;
}

function typeIncludes(node: Json, type: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t.toLowerCase() === type.toLowerCase();
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && x.toLowerCase() === type.toLowerCase());
  return false;
}

/** Depth-first walk collecting Product nodes (handles @graph and arrays). */
function* findProducts(node: unknown, depth = 0): Generator<Json> {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* findProducts(item, depth + 1);
    return;
  }
  const obj = node as Json;
  if (typeIncludes(obj, "Product")) yield obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === "object") yield* findProducts(v, depth + 1);
  }
}

function parseAvailability(value: unknown): StockStatus {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase();
  if (v.includes("instock")) return "in_stock";
  if (v.includes("outofstock") || v.includes("soldout") || v.includes("discontinued")) return "out_of_stock";
  if (v.includes("preorder") || v.includes("backorder")) return "preorder";
  return "unknown";
}

function firstString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === "object") return firstString((v as Json)["url"]) ?? firstString((v as Json)["contentUrl"]);
  return null;
}

export function extractJsonLd({ html }: ExtractionContext): ExtractionResult {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();
  if (scripts.length === 0) return EMPTY_RESULT;

  for (const el of scripts) {
    const raw = $(el).contents().text();
    if (!raw.trim()) continue;
    const parsed = tryParse(raw);
    if (!parsed) continue;

    for (const product of findProducts(parsed)) {
      const name = firstString(product["name"]);
      const image = firstString(product["image"]);
      const offers = product["offers"];
      const offersList: Json[] = [];
      if (offers) {
        const arr = Array.isArray(offers) ? offers : [offers];
        for (const o of arr) {
          if (!o || typeof o !== "object") continue;
          const oj = o as Json;
          if (typeIncludes(oj, "AggregateOffer")) {
            // lowPrice is the meaningful field
            offersList.push(oj);
            const inner = oj["offers"];
            if (inner) offersList.push(...(Array.isArray(inner) ? inner.filter(Boolean) : [inner]) as Json[]);
          } else {
            offersList.push(oj);
          }
        }
      }

      const candidates: ExtractionResult["candidates"] = [];
      let currency: string | null = null;
      let stock: StockStatus = "unknown";

      for (const offer of offersList) {
        const cur = offer["priceCurrency"];
        if (typeof cur === "string" && cur) currency = cur;
        const priceValue = offer["lowPrice"] ?? offer["price"];
        const cents = parsePrice(priceValue as string | number | null);
        if (cents) {
          candidates.push({
            valueCents: cents,
            source: "jsonld",
            confidence: 0.92,
            label: typeof offer["lowPrice"] === "string" ? "JSON-LD lowPrice" : "JSON-LD offers.price",
          });
        }
        const s = parseAvailability(offer["availability"]);
        if (s !== "unknown") stock = s;
      }

      if (name || candidates.length > 0) {
        return { name, image, currency, stock, candidates };
      }
    }
  }
  return EMPTY_RESULT;
}

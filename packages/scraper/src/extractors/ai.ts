/**
 * AI extractor — prompt building and response parsing.
 * The model call itself goes through AIPort, so this stays pure/testable.
 * Works with any OpenAI-compatible model (qwen3, gpt, claude via gateway).
 */

import { parsePrice, type PriceCandidate } from "@catapreco/core";
import type { ExtractionResult } from "./types";

export interface AiExtraction {
  name: string | null;
  priceCents: number | null;
  listPriceCents: number | null;
  currency: string | null;
  in_stock: boolean | null;
  confidence: number;
}

export function buildExtractPrompt(pageText: string, url: string): string {
  return `You are a data extractor for e-commerce product pages. Analyze this page text and return ONLY a JSON object (no markdown, no comments).

URL: ${url}
PAGE TEXT:
"""
${pageText}
"""

Return this exact shape:
{"name": string|null, "price": number|string|null, "list_price": number|string|null, "currency": "BRL"|"USD"|null, "in_stock": boolean|null, "confidence": 0..1}

Rules:
- "price" is the amount the customer actually pays TODAY (à vista/Pix when cheaper than installments). Never return installment (per-month) values such as "10x R$ 299" as price — return the full price instead.
- "list_price" is the crossed-out/original price when present.
- Use the page currency. If the site is a Brazilian marketplace, currency is "BRL".`;
}

export function buildArbitrationPrompt(
  pageText: string,
  url: string,
  candidates: PriceCandidate[],
): string {
  const list = candidates
    .map((c) => `- R$ ${(c.valueCents / 100).toFixed(2)} (source ${c.source}${c.label ? `, ${c.label}` : ""}${c.isInstallment ? ", installment" : ""})`)
    .join("\n");
  return `Several automated extractors disagree about a product's price on this page.

URL: ${url}
CANDIDATES:
${list}

PAGE TEXT:
"""
${pageText.slice(0, 4000)}
"""

Which candidate is the real current purchase price (à vista, not installments)? Return ONLY JSON:
{"price": number, "confidence": 0..1, "reason": string}`;
}

/** Tolerant JSON extraction from model output (fences, extra prose). */
export function parseAiJson<T>(raw: string): T | null {
  const attempts = [raw, raw.replace(/```(?:json)?/g, "")];
  for (const a of attempts) {
    const m = a.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

export interface AiExtractedProduct {
  name: string | null;
  price: number | string | null;
  list_price: number | string | null;
  currency: string | null;
  in_stock: boolean | null;
  confidence?: number;
}

/** Converts parseAiJson output to extraction primitives (null-safe). */
export function aiToResult(parsed: AiExtractedProduct | null, raw: string): {
  result: ExtractionResult | null;
  candidate: PriceCandidate | null;
} {
  if (!parsed) return { result: null, candidate: null };
  const priceCents = parsePrice(parsed.price);
  const candidate: PriceCandidate | null = priceCents
    ? {
        valueCents: priceCents,
        source: "ai",
        confidence: Math.min(0.9, Math.max(0.5, parsed.confidence ?? 0.7)),
        label: "análise de IA",
      }
    : null;
  const result: ExtractionResult = {
    name: parsed.name ?? null,
    image: null,
    currency: parsed.currency ?? null,
    stock:
      parsed.in_stock === true ? "in_stock" : parsed.in_stock === false ? "out_of_stock" : "unknown",
    candidates: [
      ...(candidate ? [candidate] : []),
      ...(parsePrice(parsed.list_price)
        ? [{
            valueCents: parsePrice(parsed.list_price)!,
            source: "ai" as const,
            confidence: 0.5,
            label: "lista (IA)",
          }]
        : []),
    ],
  };
  void raw;
  return { result, candidate };
}

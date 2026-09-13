/**
 * Extraction pipeline — orchestrates the fallback chain:
 *
 *   JSON-LD  →  site adapter  →  generic CSS  →  AI (if configured)
 *
 * Emits merged candidates, runs the arbitration logic, escalates to AI
 * only when needed, and records a step-by-step debug log.
 */

import {
  decide,
  parsePrice,
  type PriceCandidate,
  type StockStatus,
} from "@catapreco/core";
import type { AIPort, FetchPort } from "./ports";
import { looksLikeBotWall } from "./ports";
import { extractJsonLd } from "./extractors/jsonld";
import { extractGeneric, visibleTextSummary } from "./extractors/generic";
import { aiToResult, buildArbitrationPrompt, buildExtractPrompt, parseAiJson, type AiExtractedProduct } from "./extractors/ai";
import { findAdapter } from "./adapters/registry";
import { mergeResults, type ExtractionResult } from "./extractors/types";

export interface PipelineOptions {
  /** Pre-fetched HTML (tests / captured pages). Skips fetch when set. */
  html?: string;
  /** AIPort for arbitration/fallback. When absent, AI steps are skipped. */
  ai?: AIPort | null;
  /** Use AI as final extractor when everything else finds nothing. */
  aiFallbackEnabled?: boolean;
}

export interface PipelineResult {
  url: string;
  ok: boolean;
  error?: string;
  httpStatus?: number;
  name: string | null;
  image: string | null;
  currency: string;
  stock: StockStatus;
  candidates: PriceCandidate[];
  selected: PriceCandidate | null;
  needsReview: boolean;
  usedAi: boolean;
  logs: string[];
  fetchedAt: Date;
}

export async function scrapeProduct(
  url: string,
  fetch: FetchPort,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const logs: string[] = [];
  let html = opts.html;
  let httpStatus: number | undefined;

  if (!html) {
    const res = await fetch.get(url);
    html = res.html;
    httpStatus = res.status;
    logs.push(`fetch ${res.status} (${res.html.length} bytes${res.usedBrowser ? ", browser" : ""})`);
    if (res.status >= 400) {
      return fail(url, `HTTP ${res.status}`, logs, httpStatus);
    }
  } else {
    logs.push(`using provided html (${html.length} bytes)`);
  }

  // Never extract from a challenge page — values there are garbage.
  if (looksLikeBotWall(html)) {
    logs.push("bot wall/challenge page — aborting extraction");
    return fail(url, "anti-bot bloqueou a página (challenge/captcha)", logs, httpStatus);
  }

  const ctx = { html, url };

  // 1. JSON-LD
  const jsonld = extractJsonLd(ctx);
  logs.push(`jsonld: name=${yes(jsonld.name)} candidates=${jsonld.candidates.length} stock=${jsonld.stock}`);

  // 2. Site adapter
  const adapter = findAdapter(url);
  let adapterResult: ExtractionResult | null = null;
  if (adapter) {
    adapterResult = adapter.extract(ctx);
    if (adapterResult) {
      logs.push(`adapter(${adapter.id}): name=${yes(adapterResult.name)} candidates=${adapterResult.candidates.length} stock=${adapterResult.stock}`);
    } else {
      logs.push(`adapter(${adapter.id}): no data`);
    }
  } else {
    logs.push("no site adapter registered for this host");
  }

  // 3. Generic CSS (always — cheap, adds corroborating candidates)
  const generic = extractGeneric(ctx);
  logs.push(`generic: name=${yes(generic.name)} candidates=${generic.candidates.length} stock=${generic.stock}`);

  // Merge scalars with precedence adapter > jsonld > generic; keep ALL candidates.
  const base = adapterResult ?? { name: null, image: null, currency: null, stock: "unknown" as StockStatus, candidates: [] };
  const mergedScalars = mergeResults(mergeResults(base, jsonld), generic);
  let merged: ExtractionResult = {
    ...mergedScalars,
    candidates: [...(adapterResult?.candidates ?? []), ...jsonld.candidates, ...generic.candidates],
  };

  let decision = decide(merged.candidates);
  logs.push(`decide: ${decision.reasoning.join("; ")}`);
  let usedAi = false;

  // 4. AI: full extraction when nothing found
  if (merged.candidates.length === 0 && opts.ai && opts.aiFallbackEnabled !== false) {
    usedAi = true;
    const text = visibleTextSummary(html);
    logs.push(`no candidates from static extractors — calling AI (${opts.ai.describe()}) on ${text.length} chars`);
    const raw = await opts.ai.complete(buildExtractPrompt(text, url));
    const parsed = parseAiJson<AiExtractedProduct>(raw);
    const { result, candidate } = aiToResult(parsed, raw);
    if (result && candidate) {
      merged = mergeResults(merged, result);
      merged.candidates = [...merged.candidates, candidate];
      logs.push(`ai extract: price=${candidate.valueCents} conf=${candidate.confidence}`);
    } else if (result) {
      // JSON válido mas sem preço — página vazia/bloqueada ou produto sem preço exposto
      logs.push("ai extract: resposta válida mas sem preço (página sem conteúdo?)");
    } else {
      logs.push("ai extract: unparseable response");
    }
    decision = decide(merged.candidates);
    logs.push(`decide (after ai): ${decision.reasoning.join("; ")}`);
  }

  // 5. AI arbitration when extractors disagree
  else if (decision.needsReview && opts.ai) {
    usedAi = true;
    const text = visibleTextSummary(html, 4000);
    logs.push(`ambiguous candidates — asking AI to arbitrate (${opts.ai.describe()})`);
    const raw = await opts.ai.complete(buildArbitrationPrompt(text, url, decision.ranked));
    const parsed = parseAiJson<{ price: number | string; confidence?: number }>(raw);
    const aiCents = parsed ? parsePrice(parsed.price) : null;
    if (aiCents) {
      merged.candidates.push({ valueCents: aiCents, source: "ai", confidence: Math.min(0.9, parsed?.confidence ?? 0.75), label: "árbitro IA" });
      logs.push(`ai arbitration: price=${aiCents}`);
      decision = decide(merged.candidates);
      logs.push(`decide (after ai): ${decision.reasoning.join("; ")}`);
    } else {
      logs.push("ai arbitration: unparseable response — keeping review state");
    }
  }

  const cleanName = sanitizeProductName(merged.name);

  return {
    url,
    ok: true,
    httpStatus,
    name: cleanName,
    image: merged.image,
    currency: merged.currency ?? "BRL",
    stock: merged.stock,
    candidates: dedupeSets(merged.candidates),
    selected: decision.selected,
    // zero candidates after everything (incl. AI) => must ask the user
    needsReview: merged.candidates.length === 0 ? true : decision.needsReview && decision.ranked.length > 0,
    usedAi,
    logs,
    fetchedAt: new Date(),
  };
}

/** Some pages embed the price in the <title> — strip it from the product name. */
export function sanitizeProductName(name: string | null): string | null {
  if (!name) return null;
  return name
    .replace(/\s*[-–|·]\s*(?:R\s?\$\s*)?[\d.,]+\s*(?:reais|vis)\b.*$/i, "")
    .replace(/\s*[-–|]\s*R\$\s*[\d.,]+.*$/i, "")
    .trim();
}

function yes(v: unknown): string {
  return v ? "yes" : "no";
}

function fail(url: string, error: string, logs: string[], httpStatus?: number): PipelineResult {
  logs.push(`fail: ${error}`);
  return {
    url, ok: false, error, httpStatus, name: null, image: null, currency: "BRL",
    stock: "unknown", candidates: [], selected: null, needsReview: false,
    usedAi: false, logs, fetchedAt: new Date(),
  };
}

/** Keeps order, collapses exact duplicate (source+value) pairs. */
function dedupeSets(candidates: PriceCandidate[]): PriceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.source}:${c.valueCents}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

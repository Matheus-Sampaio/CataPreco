/**
 * AI classifier: decides whether the tracked product is a
 * "spec commodity" (SSD, RAM — brand doesn't matter, only the spec)
 * or an "exact item" (PlayStation 5, specific 3D printer).
 *
 * I/O goes through AIPort; prompt build + parse are pure.
 */

import { parsePrice } from "@catapreco/core";
import type { AIPort } from "./ports";
import { parseAiJson } from "./extractors/ai";

export interface ProductClassification {
  /** True when the user might accept the same spec on a different brand. */
  commodity: boolean;
  /** e.g. "ssd", "ram", "gpu", "console", "fone". */
  category: string;
  /** spec tokens normalized lowercase, e.g. ["1tb","m2","nvme","gen4"]. */
  specs: string[];
  /** original brand if detectable. */
  brand: string | null;
  /** explanation for debug log. */
  reason: string;
}

export function buildClassifyPrompt(productName: string): string {
  return `Classifique este produto de e-commerce brasileiro.

PRODUTO: "${productName}"

Regras:
- "commodity" = a marca importa menos que a especificação (SSD, memória RAM, pendrive, cabo, fonte genérica). O usuário típico aceita outra marca se a spec bater.
- Não-commodity = o usuário quer exatamente esse produto/modelo (consoles, iPhones, impressoras 3D específicas).
- specs = lista curta de especificações técnicas que definem a peça (ex: ["1tb","m2","nvme","gen4"]). Sem specs vagas como "premium" ou "novo".
- strings sempre minúsculas.

Responda APENAS JSON válido (sem markdown, sem explicação):
{"commodity": boolean, "category": string, "specs": string[], "brand": string|null, "reason": string}`;
}

/** Palavras que não são spec técnica (adjetivos/vagas) — devem ser descartadas. */
const SPEC_BLACKLIST = new Set([
  "descartavel", "descartável", "novo", "nova", "original", "premium", "melhor",
  "top", "bom", "qualidade", "importado", "nacional", "brinde", "frete",
  "gratis", "grátis", "promocao", "promoção", "oferta", "exclusivo", "pro",
]);

/** Tolerant parser — model might wrap JSON in fences or add prose. */
export function parseClassification(raw: string): ProductClassification | null {
  const j = parseAiJson<Record<string, unknown>>(raw);
  if (!j || typeof j.commodity !== "boolean") return null;
  const specs = Array.isArray(j.specs)
    ? (j.specs as unknown[])
        .map((s) => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""))
        .filter((s) => s.length >= 2 && !s.includes(" ") && !SPEC_BLACKLIST.has(s))
        .slice(0, 8)
    : [];
  return {
    commodity: Boolean(j.commodity),
    category: String(j.category ?? "unknown").toLowerCase(),
    specs,
    brand: typeof j.brand === "string" ? j.brand.toLowerCase() : null,
    reason: String(j.reason ?? ""),
  };
}

export async function classifyProduct(
  name: string,
  ai: AIPort,
): Promise<ProductClassification | null> {
  try {
    const raw = await ai.complete(buildClassifyPrompt(name));
    return parseClassification(raw);
  } catch {
    return null;
  }
}

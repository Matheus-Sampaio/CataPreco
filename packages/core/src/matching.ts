/**
 * Product name normalization and cross-marketplace matching.
 *
 * Pure functions used to decide whether a search-result listing
 * is the same product the user is tracking.
 */

/** Lowercase, strip diacritics, collapse non-alphanumerics, fuse split models ("m 2" → "m2"). */
export function normalizeName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // fuse "letra sozinha + número curto" → "m2" (M.2, NV2), sem quebrar "com 2"
  const parts = cleaned.split(" ");
  const fused: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i]!;
    const next = parts[i + 1];
    if (cur.length === 1 && numishToken(next)) {
      fused.push(cur + next);
      i++;
    } else {
      fused.push(cur);
    }
  }
  return fused.join(" ");
}

function numishToken(t: string | undefined): t is string {
  return !!t && /^\d{1,2}$/.test(t);
}

/** Distinctive tokens: model codes (rtx→3050), capacities (1tb), part numbers (snv2). */
const MODEL_PATTERN =
  /^(\d{3,}|\d+(?:gb|tb|mb|ml|w|hz|pol)|[a-z]+\d+[a-z0-9]*)$/i;

/** Quantity units that distinguish kits ("94 peças" ≠ "8 peças"). */
const QTY_RE = /\b(\d+)\s*(pecas?|pcs?|pç|un|unidades?|pacotes?|latas?|metro(?:s)?)\b/gi;

export function tokensOf(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((t) => t.length > 1));
}

export function modelTokensOf(normalized: string): Set<string> {
  const out = new Set(normalized.split(" ").filter((t) => MODEL_PATTERN.test(t)));
  // quantity tokens like tokens "94pecas", "500g"
  for (const m of normalized.matchAll(QTY_RE)) {
    out.add(`${m[1]}${m[2].toLowerCase()}`);
  }
  return out;
}

/** Accessory/refurb markers that make a listing NOT the same product. */
const ACCESSORY_TOKENS = [
  "compativel", "compatível", "capa", "pelicula", "película", "case",
  "reposicao", "reposição", "adicional", "adaptador",
];

export interface MatchScore {
  /** 0..1 */
  score: number;
  reasons: string[];
}

/**
 * Scores whether `listingTitle` matches the tracked `productName`.
 * Coverage: fraction of the product's tokens present in the listing
 * (listings are usually shorter than tracked titles, so Jaccard is unfair),
 * minus a hard penalty per missing model token (nv2 ≠ nv3, 8gb ≠ 6gb).
 */
export function matchScore(productName: string, listingTitle: string): MatchScore {
  const normA = normalizeName(productName);
  const normB = normalizeName(listingTitle);
  const a = tokensOf(normA);
  const b = tokensOf(normB);
  const reasons: string[] = [];
  if (a.size === 0 || b.size === 0) return { score: 0, reasons: ["empty name"] };

  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  let score = intersection / a.size;
  reasons.push(`coverage ${intersection}/${a.size}`);

  const modelsA = modelTokensOf(normA);
  const modelsB = modelTokensOf(normB);
  /** "3500" equals "3500mb" (unit-stripped), "nv2" never merges. */
  const modelEqual = (mA: string, mB: string) => {
    if (mA === mB) return true;
    const strip = (s: string) => s.replace(/(gb|tb|mb|ml|w|hz|pol)$/i, "");
    const a = strip(mA);
    const b = strip(mB);
    if (a !== mA && b !== mB) return false; // ambos têm unidade: decidir por valor exato de a===b
    return a === b;
  };
  const missing = [...modelsA].filter((m) => ![...modelsB].some((b) => modelEqual(m, b)));
  if (modelsA.size > 0) {
    if (missing.length === 0) {
      score += 0.25;
      reasons.push("all model tokens present (+0.25)");
    } else {
      const penalty = 0.5 * missing.length;
      score -= penalty;
      reasons.push(`missing model tokens: ${missing.join(", ")} (-${penalty.toFixed(2)})`);
    }
  }

  // Accessory keywords only in the listing (target isn't the accessory)
  const listTokens = normB.split(" ");
  const accessoryHits = ACCESSORY_TOKENS.filter((t) => {
    const listHas = listTokens.includes(t);
    const targetHas = normA.split(" ").includes(t);
    return listHas && !targetHas;
  });
  if (accessoryHits.length > 0) {
    score -= 0.5 * accessoryHits.length;
    reasons.push(`accessory markers: ${accessoryHits.join(", ")} (-0.5 each)`);
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

/** Default minimum score for a listing to be considered the same product. */
export const DEFAULT_MATCH_THRESHOLD = 0.55;

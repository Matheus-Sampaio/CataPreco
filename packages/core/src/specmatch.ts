/**
 * Spec-based matching for brand-flexible products ("commodities"):
 * o usuário aceita QUALQUER marca desde que a especificação seja idêntica.
 *
 * Ex.: "SSD 1TB NVMe Gen4" bate Sandisk, WD, Crucial, Kingston…
 * mas "500GB" ou "NVMe Gen3" conflita o eixo e é rejeitado.
 */

import { normalizeName } from "./matching";

/** Specifications as free tokens, e.g. ["1tb", "m2", "nvme", "gen4"]. */
export type SpecTokens = string[];

/** Known spec axes: values on the same axis conflict if different. */
const AXES: { name: string; values: string[] }[] = [
  { name: "capacity", values: ["120gb", "128gb", "240gb", "250gb", "256gb", "480gb", "500gb", "512gb", "1tb", "1000gb", "2tb", "2000gb", "4tb"] },
  { name: "memgen", values: ["ddr3", "ddr4", "ddr5"] },
  { name: "pciegen", values: ["gen3", "gen4", "gen5", "pcie 3", "pcie 4", "pcie 5"] },
  { name: "count", values: ["8gb", "16gb", "24gb", "32gb", "64gb"] },
  // monitores: tamanho e taxa de atualização definem o modelo
  { name: "screen", values: ["19pol", "22pol", "24pol", "25pol", "27pol", "29pol", "32pol", "34pol"] },
  { name: "refresh", values: ["60hz", "75hz", "100hz", "120hz", "144hz", "165hz", "180hz", "240hz"] },
  // fontes de alimentação (potência)
  { name: "watts", values: ["400w", "450w", "500w", "550w", "600w", "650w", "700w", "750w", "850w", "1000w"] },
  // resolução (monitores/TVs/projetores) — match de palavra inteira ("hd" ⊄ "hdmi");
  // "fhd" propositalmente fora: é alias de "fullhd" e conflitaria consigo mesmo
  { name: "resolution", values: ["hd", "fullhd", "qhd", "4k", "8k"] },
];

const norm = (s: string) => normalizeName(s);

/**
 * Normalização local: cola unidades separadas por espaço ("27 pol" → "27pol",
 * "180 hz" → "180hz", "1 tb" → "1tb") e alias "full hd" → "fullhd".
 * Contido aqui (não altera o normalizeName global do matching).
 */
const fuseUnits = (s: string): string =>
  s
    .replace(/\bfull\s+hd\b/g, "fullhd")
    .replace(/\b(\d+)\s+(pol|hz|w|gb|tb|mb|ml|kg|g)\b/g, "$1$2");

/** whole-word match sobre texto normalizado (tokens alfanuméricos + espaços) */
function hasValue(normText: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(normText);
}

/** True when the listing has a value of one of the given axes that differs. */
function axisConflict(listingNorm: string, specs: string[]): string | null {
  for (const axis of AXES) {
    const specHits = axis.values.filter((v) => specs.some((s) => s === norm(v)));
    if (specHits.length === 0) continue; // spec doesn't set this axis — any value ok
    // listing has an axis value?
    for (const v of axis.values) {
      const wanted = specHits.some((s) => s === norm(v));
      if (wanted) continue;
      if (hasValue(listingNorm, norm(v))) return `${axis.name}: spec ${specHits[0]} ≠ listing ${v}`;
    }
  }
  return null;
}

export interface SpecMatchResult {
  score: number; // 0..1
  ok: boolean;
  reasons: string[];
}

/**
 * Matches a listing title against the commodity spec.
 * - every spec token must appear in the normalized listing title
 * - axis conflicts → hard reject
 * - negativeSpecs: qualquer uma presente no título → hard reject
 *   (ex.: RAM desktop excluindo "notebook"/"sodimm")
 */
export function specMatch(
  listingTitle: string,
  specs: SpecTokens,
  threshold = 0.75,
  negativeSpecs: SpecTokens = [],
): SpecMatchResult {
  const reasons: string[] = [];
  const listingNorm = fuseUnits(norm(listingTitle));
  const normalizedSpecs = specs.map((s) => fuseUnits(norm(s))).filter((s) => s.length >= 2);
  const negatives = negativeSpecs.map((s) => fuseUnits(norm(s))).filter((s) => s.length >= 2);

  const blocked = negatives.find((n) => listingNorm.includes(n));
  if (blocked) {
    return { score: 0, ok: false, reasons: [`spec excluída presente: ${blocked}`] };
  }

  const conflict = axisConflict(listingNorm, normalizedSpecs);
  if (conflict) {
    return { score: 0, ok: false, reasons: [`axis conflict: ${conflict}`] };
  }

  if (normalizedSpecs.length === 0) {
    return { score: 0, ok: false, reasons: ["no valid specs provided"] };
  }

  const present = normalizedSpecs.filter((s) => listingNorm.includes(s));
  const missing = normalizedSpecs.filter((s) => !listingNorm.includes(s));
  const score = present.length / normalizedSpecs.length;
  reasons.push(`specs: ${present.length}/${normalizedSpecs.length} — missing: ${missing.join(", ") || "nenhuma"}`);

  return { score, ok: score >= threshold, reasons };
}

/** A way to detect likely commodity categories when AI is off. */
const COMMODITY_CATEGORIES = new Set([
  "ssd", "hdd", "ram", "memoria", "memória", "pendrive", "cartao sd", "cartão sd",
  "fonte", "cooler", "gabinete", "cabo", "adaptador", "hub usb",
]);

/** Cheap heuristic pre-guess; the AI classification overrides. */
export function looksCommodityCategory(title: string): string | null {
  const n = norm(title);
  for (const c of COMMODITY_CATEGORIES) {
    if (n.includes(c)) return c;
  }
  return null;
}

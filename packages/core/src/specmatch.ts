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
];

export interface SpecMatchResult {
  score: number; // 0..1
  ok: boolean;
  reasons: string[];
}

const norm = (s: string) => normalizeName(s);

/** True when the listing has a value of one of the given axes that differs. */
function axisConflict(listingNorm: string, specs: string[]): string | null {
  for (const axis of AXES) {
    const specHits = axis.values.filter((v) => specs.some((s) => norm(s) === norm(v)));
    if (specHits.length === 0) continue; // spec doesn't set this axis — any value ok
    // listing has an axis value?
    for (const v of axis.values) {
      const wanted = specHits.some((s) => norm(s) === norm(v));
      if (wanted) continue;
      if (listingNorm.includes(norm(v))) return `${axis.name}: spec ${specHits[0]} ≠ listing ${v}`;
    }
  }
  return null;
}

/**
 * Matches a listing title against the commodity spec.
 * - every spec token must appear in the normalized listing title
 * - axis conflicts → hard reject
 */
export function specMatch(listingTitle: string, specs: SpecTokens, threshold = 0.75): SpecMatchResult {
  const reasons: string[] = [];
  const listingNorm = norm(listingTitle);
  const normalizedSpecs = specs.map(norm).filter((s) => s.length >= 2);

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

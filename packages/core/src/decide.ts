/**
 * Candidate price arbitration — pure decision logic.
 *
 * Every extractor (JSON-LD, site adapter, generic CSS, AI) emits
 * candidates. This module decides whether one value wins outright
 * or the user must review in the Price Selection Modal.
 */

import type { Cents } from "./price";

export type CandidateSource =
  | "jsonld"
  | "adapter"
  | "generic"
  | "ai"
  | "user";

export interface PriceCandidate {
  valueCents: Cents;
  source: CandidateSource;
  /** 0..1 extractor-reported confidence. */
  confidence: number;
  /** Human label, e.g. "à vista/Pix", "parcelado 10x", "lista (riscado)". */
  label?: string;
  /** Candidates flagged as installments are never auto-selected as "the" price. */
  isInstallment?: boolean;
}

export interface Decision {
  /** Winning candidate (pre-selection shown highlighted even when reviewing). */
  selected: PriceCandidate | null;
  /** True when the user must confirm/override in the modal. */
  needsReview: boolean;
  /** Audit trail for debugging. */
  reasoning: string[];
  /** All candidates after merge, sorted best-first. */
  ranked: PriceCandidate[];
}

export interface DecideOptions {
  /** Two values within this pct are considered the same price. Default 1%. */
  tolerancePct?: number;
  /** Merged confidence needed to auto-accept without review. Default 0.8. */
  autoAcceptConfidence?: number;
}

/** Merged candidate group accumulated confidence. */
interface Group {
  valueCents: Cents;
  confidence: number;
  members: PriceCandidate[];
  isInstallment: boolean;
}

export function decide(candidates: PriceCandidate[], opts: DecideOptions = {}): Decision {
  const tolerance = (opts.tolerancePct ?? 1) / 100;
  const autoAccept = opts.autoAcceptConfidence ?? 0.8;
  const reasoning: string[] = [];

  const valid = candidates.filter((c) => c.valueCents > 0 && Number.isFinite(c.valueCents));
  if (valid.length === 0) {
    return { selected: null, needsReview: false, reasoning: ["no candidates"], ranked: [] };
  }
  reasoning.push(`${valid.length} raw candidate(s)`);

  // 1. Group values within tolerance (cheapest member as group anchor).
  const sorted = [...valid].sort((a, b) => a.valueCents - b.valueCents);
  const groups: Group[] = [];
  for (const cand of sorted) {
    const g = groups.find(
      (gr) => Math.abs(cand.valueCents - gr.valueCents) / gr.valueCents <= tolerance,
    );
    if (g) {
      g.members.push(cand);
    } else {
      groups.push({ valueCents: cand.valueCents, confidence: 0, members: [cand], isInstallment: false });
    }
  }

  // 2. Merge confidence: max member confidence + bonus per extra independent source.
  for (const g of groups) {
    const sources = new Set(g.members.map((m) => m.source));
    const maxConf = Math.max(...g.members.map((m) => m.confidence));
    const bonus = 0.1 * (sources.size - 1);
    g.confidence = Math.min(0.98, maxConf + bonus);
    g.isInstallment = g.members.every((m) => m.isInstallment === true);
    // Representative candidate = member closest to group value w/ best label.
    const rep = g.members.find((m) => m.valueCents === g.valueCents) ?? g.members[0]!;
    g.members = [rep, ...g.members.filter((m) => m !== rep)];
  }

  reasoning.push(
    `merged into ${groups.length} group(s): ` +
      groups
        .map((g) => `R$${(g.valueCents / 100).toFixed(2)}(conf ${g.confidence.toFixed(2)}, srcs ${g.members.map((m) => m.source).join("+")})${g.isInstallment ? " [parcelado]" : ""}`)
        .join(" | "),
  );

  // 3. Installment-only groups never auto-win.
  const nonInstallment = groups.filter((g) => !g.isInstallment);
  const pool = nonInstallment.length > 0 ? nonInstallment : groups;
  if (nonInstallment.length === 0) reasoning.push("only installment prices found; review forced");

  // 4. Rank by confidence.
  const ranked = [...pool].sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0]!;
  const runnerUp = ranked[1];

  const rankedCandidates: PriceCandidate[] = ranked.map((g) => ({
    valueCents: g.valueCents,
    source: g.members[0]!.source,
    confidence: g.confidence,
    label: g.members.find((m) => m.label)?.label,
    isInstallment: g.isInstallment,
  }));

  // 5. Decide.
  if (ranked.length === 1) {
    // generic-only CSS heuristics are noisy — demand more confidence than
    // structured sources (jsonld/adapter) before auto-accepting a lone hit
    const genericOnly = best.members.every((m) => m.source === "generic");
    const minConf = genericOnly ? Math.max(autoAccept / 2, 0.6) : autoAccept / 2;
    const single = best.confidence >= minConf && !best.isInstallment;
    reasoning.push(
      single
        ? `single candidate auto-accepted (conf ${best.confidence.toFixed(2)})`
        : `single low-confidence candidate${genericOnly ? " (generic-only)" : ""}; review recommended`,
    );
    return {
      selected: toCandidate(best),
      needsReview: !single,
      reasoning,
      ranked: rankedCandidates,
    };
  }

  const gap = best.confidence - (runnerUp?.confidence ?? 0);
  if (best.confidence >= autoAccept && gap >= 0.15) {
    reasoning.push(
      `winner conf ${best.confidence.toFixed(2)} beats runner-up by ${gap.toFixed(2)}`,
    );
    return { selected: toCandidate(best), needsReview: false, reasoning, ranked: rankedCandidates };
  }

  reasoning.push(
    `ambiguous: top groups within ${gap.toFixed(2)} confidence — user review required`,
  );
  return { selected: toCandidate(best), needsReview: true, reasoning, ranked: rankedCandidates };
}

function toCandidate(g: Group): PriceCandidate {
  const rep = g.members[0]!;
  return {
    valueCents: g.valueCents,
    source: rep.source,
    confidence: g.confidence,
    label: g.members.find((m) => m.label)?.label,
    isInstallment: g.isInstallment,
  };
}

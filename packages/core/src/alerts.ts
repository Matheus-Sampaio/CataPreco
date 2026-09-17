/**
 * Alert decision logic: when a new price/stock reading must fire
 * a notification. Pure functions, unit tested.
 */

import type { Cents } from "./price";

export type StockStatus = "in_stock" | "out_of_stock" | "preorder" | "unknown";

export interface DropThreshold {
  /** Fire when price falls at least this absolute value (cents). */
  absCents?: Cents;
  /** Fire when price falls at least this percent (e.g. 5 = 5%). */
  pct?: number;
}

export function isPriceDrop(
  prevCents: Cents,
  nextCents: Cents,
  threshold: DropThreshold = {},
): boolean {
  if (nextCents >= prevCents) return false;
  const diff = prevCents - nextCents;
  if (threshold.absCents && threshold.pct) {
    return diff >= threshold.absCents || (diff / prevCents) * 100 >= threshold.pct;
  }
  if (threshold.absCents) return diff >= threshold.absCents;
  if (threshold.pct) return (diff / prevCents) * 100 >= threshold.pct;
  return true; // no threshold configured: any drop notifies
}

/** True the first time price is at or below target. */
export function hitTarget(prevCents: Cents | null, nextCents: Cents, targetCents: Cents): boolean {
  const wasAbove = prevCents === null || prevCents > targetCents;
  return wasAbove && nextCents <= targetCents;
}

/** Stock transition worth notifying: became available again. */
export function backInStock(prev: StockStatus, next: StockStatus): boolean {
  const wasOut = prev === "out_of_stock" || prev === "unknown";
  return wasOut && next === "in_stock";
}

export interface AlertEvent {
  kind: "price_drop" | "target_hit" | "back_in_stock" | "alternative_cheaper";
  prevCents?: Cents;
  nextCents: Cents;
}

// ---------- Wild-swing protection ----------

export interface SwingCheck {
  accept: boolean;
  reason: string;
}

/**
 * Anti-garbage guard. Two tiers:
 * - generic source: reject swings > 1.6x rise / < 0.5x drop.
 * - strong source (jsonld/adapter/ai/user): still reject PARANORMAL swings
 *   (> 3x rise / < 0.33x drop) — a single listing's price never triples
 *   between checks; that's a wrong item/carousel being scraped.
 */
export function acceptPriceTransition(
  prevCents: Cents | null,
  nextCents: Cents,
  source: string,
  opts: { maxRise?: number; maxDrop?: number } = {},
): SwingCheck {
  if (prevCents == null || prevCents <= 0) return { accept: true, reason: "primeira leitura" };

  const isGeneric = source === "generic";
  const maxRise = opts.maxRise ?? (isGeneric ? 1.6 : 3);
  const maxDrop = opts.maxDrop ?? (isGeneric ? 0.5 : 0.33);
  const ratio = nextCents / prevCents;
  if (ratio > maxRise) {
    return { accept: false, reason: `alta suspeita: ${ratio.toFixed(2)}x (máx ${maxRise}x) via ${source}` };
  }
  if (ratio < maxDrop) {
    return { accept: false, reason: `queda suspeita: ${ratio.toFixed(2)}x (mín ${maxDrop}x) via ${source}` };
  }
  return { accept: true, reason: isGeneric ? "variação ok (genérica)" : `variação ok (${source})` };
}

/**
 * Evaluates one listing transition into 0..n events.
 * Order matters: target_hit is more specific than price_drop; both may fire.
 */
export function evaluateTransition(
  prevCents: Cents | null,
  nextCents: Cents,
  prevStock: StockStatus,
  nextStock: StockStatus,
  targetCents: Cents | null,
  threshold: DropThreshold = {},
): AlertEvent[] {
  const events: AlertEvent[] = [];
  if (prevCents !== null && isPriceDrop(prevCents, nextCents, threshold)) {
    events.push({ kind: "price_drop", prevCents, nextCents });
  }
  if (targetCents && hitTarget(prevCents, nextCents, targetCents)) {
    events.push({ kind: "target_hit", prevCents: prevCents ?? undefined, nextCents });
  }
  // primeira leitura (prevCents null) não é "voltou ao estoque" — é só o estado inicial
  if (prevCents !== null && backInStock(prevStock, nextStock)) {
    events.push({ kind: "back_in_stock", nextCents });
  }
  return events;
}

/**
 * Price parsing and formatting.
 *
 * All money in the system is represented as integer cents (`Cents`).
 * Parsing is locale-aware: Brazilian pages use "1.234,56", JSON-LD and
 * international sites use "1234.56" or "1,234.56".
 */

export type Cents = number;

export const MAX_REASONABLE_CENTS = 1_000_000_000; // R$ 10.000.000,00 antiguidade guard

/**
 * Parses a price string/number into integer cents.
 * Returns null when the input has no plausible price.
 *
 * Rules:
 * - If both "." and "," exist, the LAST one is the decimal separator.
 * - If only "," exists: decimal when followed by 1-2 digits, thousands otherwise.
 * - If only "." exists: decimal when followed by 1-2 digits, thousands otherwise
 *   (e.g. "1.234" pt-BR thousands, "12.34" decimal).
 */
export function parsePrice(raw: string | number | null | undefined): Cents | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return normalizeCents(Math.round(raw * 100));
  }

  const input = raw.trim();
  if (!input) return null;
  if (input.startsWith("-")) return null; // negative is never a price

  // Keep only digits and separators; drop currency symbols/labels.
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let decimalSep: string | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    decimalSep = classifySingleSeparator(cleaned, lastComma);
  } else if (lastDot >= 0) {
    decimalSep = classifySingleSeparator(cleaned, lastDot);
  }

  let numeric: string;
  if (decimalSep) {
    const thousands = decimalSep === "," ? "." : ",";
    const noThousands = cleaned.split(thousands).join("");
    numeric = noThousands.replace(decimalSep, ".");
  } else {
    // No decimal separator: all remaining separators are thousands markers.
    numeric = cleaned.replace(/[.,]/g, "");
  }

  const value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) return null;
  return normalizeCents(Math.round(value * 100));
}

function classifySingleSeparator(s: string, idx: number): "," | "." | null {
  const sep = s[idx] as "," | ".";
  const after = s.slice(idx + 1).replace(/[^\d]/g, "");
  const occurrences = s.split(sep).length - 1;
  // Multiple occurrences of same separator => thousands ("1.234.567")
  if (occurrences > 1) return null;
  // 1-2 digits after => decimal ("12,34", "12,5")
  if (after.length >= 1 && after.length <= 2) return sep;
  // Exactly 3 digits => thousands ("1.234")
  if (after.length === 3) return null;
  return null;
}

function normalizeCents(cents: Cents): Cents | null {
  if (cents <= 0 || cents > MAX_REASONABLE_CENTS) return null;
  return cents;
}

/** Formats cents as BRL currency string: 123456 -> "R$ 1.234,56" */
export function formatBRL(cents: Cents): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formats cents with an arbitrary ISO currency code. */
export function formatCurrency(cents: Cents, currency: string): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency,
  });
}

/** Percentage discount between list price and current price. */
export function discountPct(listCents: Cents, priceCents: Cents): number {
  if (listCents <= 0 || priceCents <= 0 || priceCents >= listCents) return 0;
  return Math.round(((listCents - priceCents) / listCents) * 100);
}

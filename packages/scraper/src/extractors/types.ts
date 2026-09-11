import type { PriceCandidate, StockStatus } from "@catapreco/core";

export interface ExtractionContext {
  html: string;
  url: string;
}

/** Result of a single extraction pass over a product page. */
export interface ExtractionResult {
  name: string | null;
  image: string | null;
  /** ISO currency, e.g. "BRL", "USD". */
  currency: string | null;
  stock: StockStatus;
  candidates: PriceCandidate[];
}

export const EMPTY_RESULT: ExtractionResult = {
  name: null,
  image: null,
  currency: null,
  stock: "unknown",
  candidates: [],
};

export function mergeResults(base: ExtractionResult, other: ExtractionResult): ExtractionResult {
  return {
    name: base.name ?? other.name,
    image: base.image ?? other.image,
    currency: base.currency ?? other.currency,
    stock: base.stock !== "unknown" ? base.stock : other.stock,
    candidates: [...base.candidates, ...other.candidates],
  };
}

/**
 * Remessa Conforme (PRC) import tax calculator for international purchases
 * (AliExpress, Banggood, Amazon.com etc.) shipping to Brazil.
 *
 * Rules (since 2024-08):
 * - Valor aduaneiro (product + freight) <= US$ 50: import tax = 20%
 * - Above US$ 50: import tax = 60% with a US$ 20 deduction
 * - ICMS (state VAT) is applied "por dentro" (on top of itself):
 *     base = (value + importTax) / (1 - icmsRate)
 *     icms = base * icmsRate
 *
 * Rates are configurable because legislation and state ICMS change.
 */

import type { Cents } from "./price";

export interface RemessaConformeOptions {
  /** ICMS rate as decimal fraction (0.20 = 20%). Default 20%. */
  icmsRate?: number;
  /** Threshold in USD cents where the 60% rule kicks in. Default $50. */
  thresholdUsdCents?: Cents;
  /** Discount in USD cents applied to the 60% bracket. Default $20. */
  discountUsdCents?: Cents;
  /** BRL per 1 USD (e.g. 5.42). */
  fxRate: number;
}

export interface TaxBreakdown {
  productUsdCents: Cents;
  productBrlCents: Cents;
  importTaxBrlCents: Cents;
  icmsBrlCents: Cents;
  totalBrlCents: Cents;
  /** Effective multiplier over base product price in BRL. */
  effectiveMultiplier: number;
}

export const DEFAULT_ICMS_RATE = 0.2;
export const PRC_THRESHOLD_USD_CENTS = 5000;
export const PRC_DISCOUNT_USD_CENTS = 2000;

export function calculateRemessaConforme(
  productUsdCents: Cents,
  opts: RemessaConformeOptions,
): TaxBreakdown {
  const icmsRate = opts.icmsRate ?? DEFAULT_ICMS_RATE;
  const threshold = opts.thresholdUsdCents ?? PRC_THRESHOLD_USD_CENTS;
  const discount = opts.discountUsdCents ?? PRC_DISCOUNT_USD_CENTS;

  const importTaxUsd =
    productUsdCents <= threshold
      ? productUsdCents * 0.2
      : Math.max(0, productUsdCents * 0.6 - discount);

  // ICMS "por dentro": total * icmsRate where total = (value + II) / (1 - rate)
  const baseUsd = productUsdCents + importTaxUsd;
  const totalUsd = icmsRate >= 1 ? baseUsd : baseUsd / (1 - icmsRate);
  const icmsUsd = totalUsd - baseUsd;

  const productBrl = Math.round(productUsdCents * opts.fxRate);
  const importTaxBrl = Math.round(importTaxUsd * opts.fxRate);
  const icmsBrl = Math.round(icmsUsd * opts.fxRate);
  const totalBrl = productBrl + importTaxBrl + icmsBrl;

  return {
    productUsdCents: productUsdCents,
    productBrlCents: productBrl,
    importTaxBrlCents: importTaxBrl,
    icmsBrlCents: icmsBrl,
    totalBrlCents: totalBrl,
    effectiveMultiplier: productBrl > 0 ? totalBrl / productBrl : 0,
  };
}

/** True when a domain is a cross-border store eligible for Remessa Conforme. */
const CROSS_BORDER_DOMAINS = [
  "aliexpress.",
  "banggood.",
  "amazon.com",
  "ebay.",
  "shopee.com",
  "gearbest.",
];

export function isCrossBorderDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // Local (.br) storefronts of global marketplaces are domestic.
  if (host.endsWith(".br")) return false;
  return CROSS_BORDER_DOMAINS.some((d) => host.includes(d));
}

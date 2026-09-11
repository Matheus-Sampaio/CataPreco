/**
 * Savings tracking — the "did you buy it?" flow.
 *
 * When removing a product the user declares whether they bought it and
 * how much they paid. Savings = best reference price - paid price
 * (negative means they paid above the reference — we still show truthfully).
 */

import type { Cents } from "./price";

export function computeSavings(referenceCents: Cents, paidCents: Cents): Cents {
  return referenceCents - paidCents;
}

export interface PurchaseLike {
  savedCents: Cents;
}

export function totalSavings(purchases: PurchaseLike[]): Cents {
  return purchases.reduce((acc, p) => acc + p.savedCents, 0);
}

/**
 * Dashboard aggregate stats.
 */
export interface ProductLike {
  status: string;
  targetCents?: Cents | null;
  minPriceCents?: Cents | null;
  lowestEverCents?: Cents | null;
}

export interface DashboardStats {
  totalProducts: number;
  atLowestPrice: number;
  atTargetPrice: number;
}

export function dashboardStats(products: ProductLike[]): DashboardStats {
  return {
    totalProducts: products.filter((p) => p.status === "active" || p.status === "pending_review" || p.status === "extracting" || p.status === "searching").length,
    atLowestPrice: products.filter(
      (p) =>
        p.status === "active" &&
        p.minPriceCents != null &&
        p.lowestEverCents != null &&
        p.minPriceCents <= p.lowestEverCents,
    ).length,
    atTargetPrice: products.filter(
      (p) =>
        p.status === "active" &&
        p.targetCents != null &&
        p.minPriceCents != null &&
        p.minPriceCents <= p.targetCents,
    ).length,
  };
}

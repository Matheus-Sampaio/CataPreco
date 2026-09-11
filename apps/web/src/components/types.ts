import type { PriceCandidate } from "@catapreco/core";

export interface UiListing {
  id: string;
  marketplace: string;
  url: string;
  title: string | null;
  isPrimary: boolean;
  isAlternative: boolean;
  brand: string | null;
  priceCents: number | null;
  priceBrlCents: number | null;
  listPriceCents: number | null;
  currency: string;
  stock: string;
  lastCheckedAt: string | null;
}

export interface UiProduct {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  image: string | null;
  currency: string;
  targetCents: number | null;
  intervalMin: number;
  nextCheckAt: string;
  status: string;
  remessaConforme: boolean;
  minPriceCents: number | null;
  lowestEverCents: number | null;
  flexBrands: boolean;
  specTokens: string[] | null;
  category: string | null;
  pendingCandidates: PriceCandidate[] | null;
  listings: UiListing[];
}

export interface UiUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface UiStats {
  totalProducts: number;
  atLowestPrice: number;
  atTargetPrice: number;
  totalSavedCents: number;
}

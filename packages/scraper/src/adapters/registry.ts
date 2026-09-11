/**
 * Adapter registry — maps hostnames to marketplace adapters.
 * Sites without a custom adapter still work via JSON-LD + generic + AI fallback.
 */

import type { SiteAdapter } from "./types";
import { mercadolivre } from "./mercadolivre";
import { amazon } from "./amazon";
import { kabum } from "./kabum";
import { magalu } from "./magalu";
import { aliexpress } from "./aliexpress";
import { fastshop } from "./vtex";
import { leroymerlin, shopee } from "./hard";

/** Marketplaces with display names (used by UI/searches even without custom extract). */
export const MARKETPLACES: Record<string, { name: string; needsBrowser?: boolean }> = {
  "mercadolivre.com.br": { name: "Mercado Livre" },
  "amazon.com.br": { name: "Amazon Brasil", needsBrowser: true },
  "kabum.com.br": { name: "KaBuM!", needsBrowser: true },
  "magazineluiza.com.br": { name: "Magazine Luiza", needsBrowser: true },
  "shopee.com.br": { name: "Shopee", needsBrowser: true },
  "pichau.com.br": { name: "Pichau" },
  "terabyteshop.com.br": { name: "Terabyte Shop" },
  "casasbahia.com.br": { name: "Casas Bahia", needsBrowser: true },
  "ponto.com.br": { name: "Ponto", needsBrowser: true },
  "extra.com.br": { name: "Extra", needsBrowser: true },
  "aliexpress.com": { name: "AliExpress", needsBrowser: true },
  "banggood.com": { name: "Banggood", needsBrowser: true },
  "amazon.com": { name: "Amazon US", needsBrowser: true },
  "fastshop.com.br": { name: "Fast Shop" },
  "leroymerlin.com.br": { name: "Leroy Merlin", needsBrowser: true },
};

const ADAPTERS: SiteAdapter[] = [
  mercadolivre, amazon, kabum, magalu, aliexpress,
  fastshop, leroymerlin, shopee,
];

export function findAdapter(url: string): SiteAdapter | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return ADAPTERS.find((a) => a.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}

/** Display name of the marketplace for any URL. */
export function marketplaceName(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
  const found = Object.entries(MARKETPLACES).find(
    ([domain]) => host === domain || host.endsWith(`.${domain}`),
  );
  return found ? found[1].name : host;
}

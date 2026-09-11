import { AWESOME_USD_BRL_URL, parseAwesomeRate } from "@catapreco/core";

let cache: { rate: number; at: number } | null = null;

/** USD→BRL with 6h cache; falls back to stale cache on network errors. */
export async function getUsdBrl(): Promise<number | null> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.rate;
  try {
    const res = await fetch(AWESOME_USD_BRL_URL, { signal: AbortSignal.timeout(10_000) });
    const json = await res.json();
    const rate = parseAwesomeRate(json, "USDBRL");
    if (rate) {
      cache = { rate, at: Date.now() };
      return rate;
    }
  } catch {
    /* keep stale */
  }
  return cache?.rate ?? null;
}

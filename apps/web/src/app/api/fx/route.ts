import { NextResponse } from "next/server";
import { AWESOME_USD_BRL_URL, parseAwesomeRate } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

let cache: { rate: number; at: number } | null = null;

/** USD→BRL rate, cached for 6h. Falls back to last known rate on failure. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  if (!cache || Date.now() - cache.at > 6 * 3600_000) {
    try {
      const res = await fetch(AWESOME_USD_BRL_URL, { signal: AbortSignal.timeout(10_000) });
      const json = await res.json();
      const rate = parseAwesomeRate(json, "USDBRL");
      if (rate) cache = { rate, at: Date.now() };
    } catch {
      /* keep stale cache */
    }
  }
  return NextResponse.json({ usdBrl: cache?.rate ?? null, stale: cache ? Date.now() - cache.at : null });
}

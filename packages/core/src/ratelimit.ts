/**
 * Per-domain rate limiting — polite scraping to avoid bans.
 * Pure helpers; the worker keeps the in-memory map.
 */

/** Minimum gap between requests to the same domain (ms). */
export const DOMAIN_GAPS: Record<string, number> = {
  "mercadolivre.com": 20_000,
  "amazon.com.br": 45_000,
  "amazon.com": 45_000,
  "kabum.com.br": 25_000,
  "magazineluiza.com.br": 30_000,
  "shopee.com.br": 60_000,
  "aliexpress.com": 60_000,
  "banggood.com": 60_000,
  "pichau.com.br": 20_000,
  "terabyteshop.com.br": 20_000,
  "casasbahia.com.br": 45_000,
  "ponto.com.br": 45_000,
  "extra.com.br": 45_000,
};

export const DEFAULT_GAP_MS = 20_000;

export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split(".");
    // BR-style: "foo.com.br" → registrable has 3 parts
    if (parts.length >= 3 && /^(com|net|org|gov|edu|adm|ind|leg)$/.test(parts[parts.length - 2]!)) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch {
    return "unknown";
  }
}

export function gapForDomain(domain: string): number {
  const match = Object.entries(DOMAIN_GAPS).find(
    ([d]) => domain === d || domain.endsWith(`.${d}`),
  );
  return match ? match[1] : DEFAULT_GAP_MS;
}

/**
 * When may the next request to this domain happen?
 * Returns an absolute timestamp (ms epoch) with jitter applied via rand.
 */
export function nextAllowedAt(
  lastRequestAt: number | null,
  now: number,
  gapMs: number,
  rand: () => number = Math.random,
  jitterPct = 0.3,
): number {
  if (lastRequestAt === null) return now;
  const jitter = gapMs * jitterPct * rand();
  return lastRequestAt + gapMs + Math.round(jitter);
}

/** Consecutive-failure cooldown backoff: 1h → 6h → 24h. */
export function banCooldownMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 1) return 0;
  if (consecutiveFailures === 2) return 1 * 60 * 60 * 1000;
  if (consecutiveFailures === 3) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/** Tracking query params dropped when normalizing product URLs. */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "tracking_id", "polycard_client", "be_origin", "overlay_label",
  "search_layout", "position", "type", "initiative", "wid", "sid",
  "float_highlight", "ref", "tag", "linkCode", "ascsubtag",
  "msockid", "gclid", "gad_source", "gad_campaignid", "fbclid",
]);

/**
 * Normalizes a product URL for dedup: strips tracking junk and
 * collapses canonical product ids (Amazon /dp/ASIN, ML /p/MLBxxxx).
 */
export function normalizeProductUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    // canonical product id reducers
    const asin = u.pathname.match(/\/dp\/(B[A-Z0-9]{9})/i) ?? u.pathname.match(/\/gp\/product\/(B[A-Z0-9]{9})/i);
    if (asin && host.includes("amazon")) return `${u.protocol}//${u.hostname}/dp/${asin[1]}`;
    const mlb = u.pathname.match(/\/p\/(MLB\d+)/i);
    if (mlb && host.includes("mercadolivre")) {
      // corta tudo após o /p/MLBxxxx (ignorando case)
      const upper = u.pathname.toUpperCase();
      const idx = upper.indexOf(`/P/${mlb[1]!.toUpperCase()}`) + `/p/${mlb[1]}`.length;
      return `${u.protocol}//${u.hostname}${u.pathname.slice(0, idx)}`;
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/** Compare two URLs canonically. */
export function sameProductUrl(a: string, b: string): boolean {
  return normalizeProductUrl(a) === normalizeProductUrl(b);
}

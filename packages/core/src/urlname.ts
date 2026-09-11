/**
 * Fallback product name derived from the URL slug.
 *
 * When the page fails to provide a name (blocked, JS shell, empty HTML),
 * the URL often still encodes it: "/cafeteira-expresso-tramontina-breville.../p/MLB15095263"
 * or "FIFINE-transmissao.../dp/B0D17P4Q7J". With a name we can still search
 * other marketplaces and classify specs even without a price.
 */

const STRUCTURAL_SEGMENTS = new Set(["p", "item", "product", "dp", "gp", "produto", "mlb"]);

export function productNameFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const path = decodeURIComponent(u.pathname);
    const segments = path
      .split("/")
      .filter(Boolean)
      .map((s) => s.replace(/\.(html?|php|aspx?|jsp)$/i, ""));

    // keep the LONGEST valid slug segment — the product name is the descriptive
    // one ("geladeira-refrigerador-brastemp-.../p/240972300/ed/refr/" → geladeira…),
    // not the trailing crumbs ("refr", "elpz").
    let slug: string | null = null;
    for (const s of segments) {
      if (!s || s.length < 5) continue;
      if (/^\d+$/i.test(s)) continue; // pure numeric id
      if (/^mlb\d+$/i.test(s)) continue; // mercado livre product code
      if (/^b[a-z0-9]{9}$/i.test(s)) continue; // amazon ASIN
      if (STRUCTURAL_SEGMENTS.has(s.toLowerCase())) continue;
      if (!slug || s.length > slug.length) slug = s;
    }
    if (!slug) return null;

    const name = slug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 5) return null;

    // title-case (unicode-aware, mantém conectivos do pt-br minúsculos)
    const STOPWORDS = new Set(["de", "da", "do", "dos", "das", "em", "com", "para", "a", "o", "e", "sem", "na", "no"]);
    return name
      .toLowerCase()
      .split(" ")
      .map((w) => (STOPWORDS.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase())))
      .join(" ");
  } catch {
    return null;
  }
}
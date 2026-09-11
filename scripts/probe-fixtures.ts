/**
 * Probe: run current extractors over captured fixtures and print what they found.
 * Usage: npx tsx scripts/probe-fixtures.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractJsonLd } from "../packages/scraper/src/extractors/jsonld";
import { extractGeneric } from "../packages/scraper/src/extractors/generic";
import { findAdapter } from "../packages/scraper/src/adapters/registry";

const DIR = join(__dirname, "../packages/scraper/tests/fixtures");

const sites: [string, string, string][] = [
  ["kabum-ps5", "kabum-ps5.html", "https://www.kabum.com.br/produto/989702"],
  ["ml-breville", "ml-breville.html", "https://www.mercadolivre.com.br/p/MLB15095263"],
  ["aliexpress-ram", "aliexpress-ram.html", "https://pt.aliexpress.com/item/1005007871443623.html"],
  ["aliexpress-hdd", "aliexpress-hdd.html", "https://pt.aliexpress.com/item/1005005806103364.html"],
  ["amazonbr-fifine", "amazonbr-fifine.html", "https://www.amazon.com.br/dp/B0D17P4Q7J"],
  ["shopee-monitor", "shopee-monitor.html", "https://shopee.com.br/product/1537142489/58260190803"],
  ["fastshop-fogao", "fastshop-fogao.html", "https://site.fastshop.com.br/x"],
  ["magalu-geladeira", "magalu-geladeira.html", "https://www.magazineluiza.com.br/p/240972300"],
  ["leroymerlin", "leroymerlin-ferramentas.html", "https://www.leroymerlin.com.br/x"],
];

for (const [label, file, url] of sites) {
  const html = readFileSync(join(DIR, file), "utf-8");
  const ctx = { html, url };
  const jl = extractJsonLd(ctx);
  const gen = extractGeneric(ctx);
  const adapter = findAdapter(url);
  const ad = adapter ? adapter.extract(ctx) : null;
  const botwall = /suspicious-traffic|g-recaptcha|captcha|Robot Check|challenge-platform|access denied/i.test(html);
  console.log("=".repeat(70));
  console.log(label, "| bytes", html.length, "| botwall:", botwall);
  console.log("  jsonld :", JSON.stringify({ name: jl.name?.slice(0, 48), cands: jl.candidates.map((c) => c.valueCents), stock: jl.stock, cur: jl.currency }));
  console.log("  generic:", JSON.stringify({ name: gen.name?.slice(0, 48), cands: gen.candidates.slice(0, 6).map((c) => [c.valueCents, c.confidence, c.label]), stock: gen.stock }));
  console.log("  adapter:", adapter ? adapter.id : "-", ad ? JSON.stringify({ name: ad.name?.slice(0, 45), cands: ad.candidates.map((c) => [c.valueCents, c.confidence, c.label]), stock: ad.stock, currency: ad.currency }) : null);
}

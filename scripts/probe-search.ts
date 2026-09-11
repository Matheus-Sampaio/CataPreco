import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";
import { parseAmazonSearchHtml, parseMlSearchHtml } from "../packages/scraper/src/search";

const DIR = join(__dirname, "../packages/scraper/tests/fixtures");

for (const [name, parser] of [
  ["search-amazonbr", parseAmazonSearchHtml],
  ["search-ml2", parseMlSearchHtml],
] as const) {
  const html = readFileSync(join(DIR, `${name}.html`), "utf-8");
  const hits = parser(html);
  console.log("=".repeat(60));
  console.log(name, "→", hits.length, "hits");
  for (const h of hits.slice(0, 3)) {
    console.log(`  [${h.priceCents / 100}] ${h.title.slice(0, 60)} | ${h.url.slice(0, 70)}`);
  }
}

// Explore kabum structure
const kabum = readFileSync(join(DIR, "search-kabum.html"), "utf-8");
const $ = load(kabum);
console.log("=".repeat(60));
console.log("kabum: productCard count:", $('[class*="productCard"]').length);
console.log("kabum: article count:", $("article").length);
const firstCard = $('[class*="productCard"]').first();
console.log("kabum first card href:", firstCard.find("a").first().attr("href"));
console.log("kabum first card price:", firstCard.find('[class*="price"]').first().text().slice(0, 60));
console.log("kabum first card title:", firstCard.find('[class*="name"]').first().text().slice(0, 60));

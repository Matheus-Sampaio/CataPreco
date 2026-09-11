import { readFileSync } from "node:fs";
const html = readFileSync("packages/scraper/tests/fixtures/search-amazonbr.html", "utf-8");

const results = html.match(/data-component-type="s-search-result"/g);
console.log("result cards:", results?.length);

const dpLinks = html.match(/href="[^"]*\/dp\/B[A-Z0-9]{9}[^"]*"/g);
console.log("dp links:", dpLinks?.length, dpLinks?.slice(0, 3));

const sspa = html.match(/href="\/sspa\/click\?[^"]*"/g);
console.log("sspa click links:", sspa?.length);
console.log(sspa?.[0]?.slice(0, 140));

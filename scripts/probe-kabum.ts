import { readFileSync } from "node:fs";
const html = readFileSync("packages/scraper/tests/fixtures/search-kabum.html", "utf-8");

console.log("__NEXT_DATA__:", html.includes("__NEXT_DATA__"));
const m = html.match(/"(catalogServer|breadCrumb|description|price|priceDiscount|code|name)"\s*:/g);
console.log((m ?? []).slice(0, 20));
const pm = html.match(/"price"\s*:\s*([\d.]+)/);
console.log("price sample:", pm?.[0]);
const cm = html.match(/"code"\s*:\s*(\d+)/);
console.log("code sample:", cm?.[0]);
const tj = html.match(/<script id="__NEXT_DATA__"[^>]*>(.{0,400})/s);
console.log("nextData head:", tj?.[1]?.slice(0, 300));

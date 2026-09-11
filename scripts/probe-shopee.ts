import { readFileSync } from "node:fs";
const html = readFileSync("packages/scraper/tests/fixtures/shopee-monitor.html", "utf-8");
console.log("bytes:", html.length);
console.log("__INITIAL_STATE__:", html.includes("__INITIAL_STATE__"));
console.log("cdc / pc item:", html.includes("pdp_"));
console.log("datadome:", html.includes("datadome") || html.includes("captcha-delivery"));
console.log("verify:", html.includes("verifica") || html.includes("Deixe-me verificar"));

// any ld+json?
const ld = html.match(/application\/ld\+json[^>]*>([\s\S]{0,200})/);
console.log("ld+json:", ld ? ld[1]!.slice(0, 200) : "nenhum");

// price-ish patterns
const priceMatches = html.match(/"price"\s*:\s*"?\d+(\.\d+)?"?/g);
console.log('price tokens:', priceMatches?.slice(0, 6));
const title = html.match(/<title>([^<]{0,120})<\/title>/);
console.log("TITLE:", title?.[1]);

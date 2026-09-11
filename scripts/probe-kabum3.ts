import { readFileSync } from "node:fs";
const html = readFileSync("packages/scraper/tests/fixtures/search-kabum.html", "utf-8");
const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/)!;
const data = JSON.parse(m[1]!).props.pageProps.data.catalogServer.data;
for (const p of data) {
  if (/3050/i.test(p.name)) console.log(`${p.price} | ${p.name}`);
}

import { readFileSync } from "node:fs";
const html = readFileSync("packages/scraper/tests/fixtures/search-kabum.html", "utf-8");
const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
if (!m) {
  console.log("next data not found");
  process.exit(1);
}
const json = JSON.parse(m[1]!);
const data = json.props.pageProps.data;
console.log("data keys:", Object.keys(data));
console.log("catalogServer keys:", Object.keys(data.catalogServer ?? {}));
const cat = data.catalogServer;
if (cat?.data && Array.isArray(cat.data)) {
  const prod = cat.data[0];
  console.log("product keys:", Object.keys(prod));
  console.log(JSON.stringify({
    code: prod.code,
    name: prod.name,
    price: prod.price,
    priceDiscount: prod.priceDiscount,
    img: prod.img ?? prod.imagem,
    seller: prod.seller,
  }, null, 1).slice(0, 700));
  console.log("total products:", cat.data.length);
}

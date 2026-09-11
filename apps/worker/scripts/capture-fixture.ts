/**
 * Capture a real product page into a test fixture.
 *
 * Usage:
 *   npx tsx scripts/capture-fixture.ts <url> <name> [--browser]
 *
 * Writes packages/scraper/tests/fixtures/<name>.html so you can
 * build/regression-test an adapter against the real page.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NativeFetchPort } from "../src/runtime/fetch-native";
import { BrowserFetchPort } from "../src/runtime/fetch-browser";

const [url, name, ...flags] = process.argv.slice(2);
if (!url || !name) {
  console.error("uso: capture-fixture <url> <name> [--browser]");
  process.exit(1);
}

async function main() {
  const useBrowser = flags.includes("--browser");
  const port = useBrowser ? new BrowserFetchPort() : new NativeFetchPort();
  const res = await port.get(url);
  const out = join(__dirname, "..", "..", "..", "packages", "scraper", "tests", "fixtures", `${name}.html`);
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, res.html, "utf-8");
  console.log(`saved ${res.html.length} bytes → ${out}`);
  if (port instanceof BrowserFetchPort) await port.close();
}

void main();

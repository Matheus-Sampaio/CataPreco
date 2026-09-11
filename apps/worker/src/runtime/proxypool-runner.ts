/**
 * Live free-proxy rotation for the worker. Opt-in via PROXY_POOL=1.
 *
 * Sources are public lists; proxies are validated against a fast,
 * reliable endpoint and rotated least-recently-used. Proxies that fail
 * twice are dropped. Nothing here runs in packages/ — network lives here.
 */

import { ProxyPool, parseProxyList } from "@catapreco/core";

const SOURCES = [
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&protocol=http&proxy_format=ipport&format=text&timeout=10000",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
];

const VALIDATION_URL = "https://www.gstatic.com/generate_204";

export class LiveProxyPool {
  pool = new ProxyPool({ maxSize: 25, maxFailures: 2 });
  private refreshing = false;

  constructor(private log: (msg: string) => void = console.log) {}

  async refresh(): Promise<number> {
    if (this.refreshing) return 0;
    this.refreshing = true;
    try {
      const texts: string[] = [];
      for (const src of SOURCES) {
        try {
          const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
          if (res.ok) texts.push(await res.text());
        } catch (err) {
          this.log(`proxy source failed: ${src.slice(0, 60)} (${(err as Error).message})`);
        }
      }
      const candidates = texts.flatMap(parseProxyList);
      this.log(`proxy pool: ${candidates.length} candidates fetched`);

      // validate concurrently, bounded — free proxies mostly fail, that's fine
      let added = 0;
      const batches = chunk(candidates.slice(0, 200), 20);
      for (const batch of batches) {
        const results = await Promise.all(
          batch.map(async (p) => ({ proxy: p, ok: await this.validate(p) })),
        );
        for (const r of results) {
          if (r.ok) added += this.pool.add([r.proxy]);
        }
        if (this.pool.aliveCount >= 15) break; // enough
      }
      this.log(`proxy pool: ${this.pool.aliveCount} working`);
      return added;
    } finally {
      this.refreshing = false;
    }
  }

  async validate(proxy: string): Promise<boolean> {
    try {
      const { ProxyAgent, fetch: undiciFetch } = await import("undici");
      const agent = new ProxyAgent(`http://${proxy}`);
      const res = await undiciFetch(VALIDATION_URL, {
        dispatcher: agent as never,
        signal: AbortSignal.timeout(7_000),
      });
      return res.status === 204;
    } catch {
      return false;
    }
  }

  /** Next usable proxy; triggers background refill when running low. */
  next(): string | null {
    if (this.pool.needsRefill(3)) void this.refresh();
    return this.pool.next();
  }

  markResult(server: string, ok: boolean): void {
    this.pool.markResult(server, ok);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

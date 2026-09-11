/**
 * Free rotating proxy pool — pure management logic.
 * Fetching lists and validating proxies happens in the worker;
 * this module just decides which proxy to use next.
 */

export interface ProxyEntry {
  server: string; // "host:port"
  failures: number;
  lastUsedAt: number;
  lastOkAt: number | null;
}

/** Parse "ip:port" list lines (any text with proxies embedded). */
export function parseProxyList(text: string): string[] {
  const re = /\b(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\b/g;
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    const host = m[1]!;
    const port = Number(m[2]);
    // sanity: octets + valid port
    if (host.split(".").every((o) => Number(o) <= 255) && port >= 1 && port <= 65535) {
      out.add(`${host}:${port}`);
    }
  }
  return [...out];
}

export interface ProxyUsage extends ProxyEntry {
  uses: number;
}

export class ProxyPool {
  private entries: ProxyUsage[] = [];

  constructor(
    private opts: { maxFailures?: number; maxSize?: number } = {},
  ) {}

  add(servers: string[]): number {
    const maxSize = this.opts.maxSize ?? 30;
    let added = 0;
    for (const s of servers) {
      if (this.entries.length >= maxSize) break;
      if (this.entries.some((e) => e.server === s)) continue;
      this.entries.push({ server: s, failures: 0, lastUsedAt: 0, lastOkAt: null, uses: 0 });
      added++;
    }
    return added;
  }

  /**
   * Next proxy: least-used (round-robin successivo — não depende de timestamps,
   * então chamadas em sequência intensa também distribuem bem).
   */
  next(now = Date.now()): string | null {
    const alive = this.entries.filter((e) => e.failures < (this.opts.maxFailures ?? 3));
    if (alive.length === 0) return null;
    alive.sort((a, b) => a.uses - b.uses);
    const pick = alive[0]!;
    pick.uses++;
    pick.lastUsedAt = now;
    return pick.server;
  }

  markResult(server: string, ok: boolean): void {
    const e = this.entries.find((x) => x.server === server);
    if (!e) return;
    if (ok) {
      e.failures = 0;
      e.lastOkAt = Date.now();
    } else {
      e.failures++;
    }
  }

  get size(): number {
    return this.entries.length;
  }

  get aliveCount(): number {
    return this.entries.filter((e) => e.failures < (this.opts.maxFailures ?? 3)).length;
  }

  /** Proxy list needs refilling when alive < minAlive. */
  needsRefill(minAlive = 3): boolean {
    return this.aliveCount < minAlive;
  }
}

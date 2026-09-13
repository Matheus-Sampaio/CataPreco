/**
 * CataPreço worker main loop.
 *
 * Ticks on a short interval, claims due products, and runs jobs
 * under per-domain rate limits with ban-po cooldowns.
 */

import { prisma, Prisma } from "@catapreco/db";
import {
  banCooldownMs,
  domainOf,
  gapForDomain,
  isCrossBorderDomain,
  nextAllowedAt,
} from "@catapreco/core";
import { looksLikeBotWall, type AIPort, type FetchPort, type FetchResponse } from "@catapreco/scraper";
import { NativeFetchPort } from "./runtime/fetch-native";
import { BrowserFetchPort } from "./runtime/fetch-browser";
import { CascadeFetchPort } from "./runtime/fetch-cascade";
import { buildAiPort } from "./runtime/ai";
import { LiveProxyPool } from "./runtime/proxypool-runner";
import { FirecrawlPort } from "./runtime/firecrawl";
import { jobCheck, jobClassify, jobExtract, jobSearch, jobSearchFlex } from "./jobs";

const LOG = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 15_000);
const BROWSER_DISABLED = process.env.SCRAPER_DISABLE_BROWSER === "1";
const PROXY_INTERNATIONAL = process.env.PROXY_INTERNATIONAL_URL || undefined;
const PROXY_ALL = process.env.PROXY_URL || undefined;
const PROXY_POOL_ENABLED = process.env.PROXY_POOL === "1";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || undefined;
const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || undefined;

// free rotating proxy pool (opt-in) — refreshes every 20min in background
const livePool = PROXY_POOL_ENABLED ? new LiveProxyPool(LOG) : null;
if (livePool) {
  void livePool.refresh();
  setInterval(() => void livePool.refresh(), 20 * 60_000).unref();
}

// ---------- runtime ports ----------
const native = new NativeFetchPort();
const browser: FetchPort = new BrowserFetchPort({ proxyServer: PROXY_ALL });

class NullBrowser implements FetchPort {
  constructor(private fallback: FetchPort) {}
  get(url: string) {
    LOG("browser disabled — native fetch used");
    return this.fallback.get(url);
  }
}
const browserOrNull = BROWSER_DISABLED ? new NullBrowser(native) : browser;

// cascade: cross-border URLs go through the proxy browser when configured
const proxyBrowser: FetchPort | null = PROXY_INTERNATIONAL
  ? new BrowserFetchPort({ proxyServer: PROXY_INTERNATIONAL })
  : null;

const cascade = new CascadeFetchPort(native, browserOrNull, LOG);

/** Fetch via next pool proxy (browser). Último recurso local — NUNCA caminho padrão. */
const poolFetch: FetchPort = {
  async get(url) {
    const proxy = livePool!.next();
    if (!proxy) {
      LOG("proxy pool empty — skipping pool escalation");
      throw new Error("proxy pool empty");
    }
    LOG(`fetch via pool proxy ${proxy}`);
    const port = new BrowserFetchPort({ proxyServer: `http://${proxy}` });
    try {
      const res = await port.get(url);
      livePool!.markResult(proxy, true);
      return res;
    } catch (err) {
      livePool!.markResult(proxy, false);
      throw err;
    } finally {
      await port.close();
    }
  },
};

// Firecrawl é o último recurso (anti-bot de verdade / proxies) — env-gateado
const firecrawlPort = FIRECRAWL_API_KEY
  ? new FirecrawlPort({ apiKey: FIRECRAWL_API_KEY, baseUrl: FIRECRAWL_API_URL })
  : null;

/** Fetch cascata: nativo → browser direto → (pool, se ligado) → firecrawl. */
async function fetchFor(url: string) {
  const domain = domainOf(url);
  if (proxyBrowser && isCrossBorderDomain(domain)) {
    LOG(`cross-border fetch via proxy: ${domain}`);
    return proxyBrowser.get(url);
  }

  let primary: FetchResponse | null = null;
  try {
    primary = await cascade.get(url);
  } catch (err) {
    LOG(`cascade fetch error (${(err as Error).message})`);
  }

  const blockedDirect = !primary || primary.status >= 400 || looksLikeBotWall(primary.html);

  // Pool de proxies grátis: só tenta quando o acesso DIRETO foi bloqueado
  // (proxies grátis pioram o acesso a sites que passam direto — ML/KaBuM/Amazon)
  if (blockedDirect && livePool) {
    try {
      LOG(`cascade bloqueado para ${domain} — tentando proxy pool`);
      const viaPool = await poolFetch.get(url);
      if (viaPool.status < 400 && !looksLikeBotWall(viaPool.html)) return viaPool;
      LOG(`pool também bloqueado para ${domain} (status ${viaPool.status})`);
    } catch (err) {
      LOG(`pool fetch error: ${(err as Error).message}`);
    }
  }

  if (blockedDirect && firecrawlPort) {
    LOG(`escalando ${domain} para firecrawl`);
    return firecrawlPort.get(url);
  }

  if (!primary) return cascade.get(url); // re-lança o erro original
  return primary;
}

const fetchPort: FetchPort = { get: fetchFor };

// Dedicated low-key port for search APIs (ML public API is liberal)
const searchFetch: FetchPort = new NativeFetchPort(25_000);

// ---------- rate limiting ----------
const lastRequest = new Map<string, number>();
const domainCooldownUntil = new Map<string, number>();
const domainFailures = new Map<string, number>();

async function acquireDomain(url: string): Promise<void> {
  const domain = domainOf(url);
  const cooldown = domainCooldownUntil.get(domain);
  if (cooldown && cooldown > Date.now()) {
    const wait = cooldown - Date.now();
    LOG(`domain ${domain} in cooldown, waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  const allowedAt = nextAllowedAt(lastRequest.get(domain) ?? null, Date.now(), gapForDomain(domain));
  const wait = allowedAt - Date.now();
  if (wait > 0) await sleep(wait);
}

function markRequest(url: string, failed: boolean): void {
  const domain = domainOf(url);
  lastRequest.set(domain, Date.now());
  if (failed) {
    const fails = (domainFailures.get(domain) ?? 0) + 1;
    domainFailures.set(domain, fails);
    const cooldown = banCooldownMs(fails);
    if (cooldown > 0) {
      domainCooldownUntil.set(domain, Date.now() + cooldown);
      LOG(`domain ${domain}: ${fails} consecutive failures → cooldown ${cooldown / 60000}min`);
    }
  } else {
    domainFailures.set(domain, 0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- AI per user ----------
const aiCache = new Map<string, AIPort | null>();

async function aiForUser(userId: string): Promise<AIPort | null> {
  if (aiCache.has(userId)) return aiCache.get(userId) ?? null;
  const cfg = await prisma.aiConfig.findUnique({ where: { userId } });
  let port: AIPort | null = null;
  if (cfg?.enabled) {
    port = buildAiPort({
      provider: cfg.provider as "ollama" | "openai" | "anthropic",
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    });
  }
  aiCache.set(userId, port);
  return port;
}

// ---------- main loop ----------
async function tick(): Promise<void> {
  const now = new Date();

  // 1. New products awaiting extraction
  const extracting = await prisma.product.findMany({
    where: {
      OR: [
        { status: "extracting" },
        // retry failed extractions after the backoff window
        { status: "error", nextCheckAt: { lte: now } },
      ],
    },
    take: 2,
    orderBy: { createdAt: "asc" },
  });
  for (const product of extracting) {
    await acquireDomain(product.url);
    try {
      await jobExtract({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product);
      markRequest(product.url, false);
    } catch (err) {
      markRequest(product.url, true);
      LOG(`jobExtract error: ${(err as Error).message}`);
    }
  }

  // 2. Products searching marketplaces
  const searching = await prisma.product.findMany({ where: { status: "searching" }, take: 2 });
  for (const product of searching) {
    try {
      await jobSearch({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product);
      // após a busca exata, classifica o produto (uma vez, com IA)
      const fresh = await prisma.product.findUnique({ where: { id: product.id } });
      if (fresh) {
        await jobClassify({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, fresh);
      }
    } catch (err) {
      LOG(`jobSearch error: ${(err as Error).message}`);
      await prisma.product.update({ where: { id: product.id }, data: { status: "active" } }).catch(() => {});
    }
  }

  // 2.25. Produtos SEM preço (pending_review) continuam trabalhando:
  // busca ofertas por nome + classifica specs, mantendo o estado de revisão.
  const pendingSearch = await prisma.product.findMany({
    where: {
      status: "pending_review",
      OR: [
        { searchedAt: null },
        { searchedAt: { lt: new Date(Date.now() - 6 * 60 * 60_000) } },
      ],
    },
    take: 2,
    orderBy: { updatedAt: "asc" },
  });
  for (const product of pendingSearch) {
    try {
      await jobSearch({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product, { keepPending: true });
      const fresh = await prisma.product.findUnique({ where: { id: product.id } });
      if (fresh) {
        await jobClassify({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, fresh);
      }
    } catch (err) {
      LOG(`pending review search error: ${(err as Error).message}`);
    }
  }

  // 2.3. pending_review por FALHA DE FETCH (sem candidatos pra revisão):
  // não adianta esperar o modal — re-tenta a extração a cada 6h.
  // (pendingCandidates != null significa revisão genuína esperando o usuário)
  const pendingRetry = await prisma.product.findMany({
    where: {
      status: "pending_review",
      pendingCandidates: { equals: Prisma.DbNull },
      updatedAt: { lt: new Date(Date.now() - 6 * 60 * 60_000) },
    },
    take: 1,
    orderBy: { updatedAt: "asc" },
  });
  for (const product of pendingRetry) {
    await acquireDomain(product.url);
    try {
      LOG(`re-tentando extração de pending_review ${product.id}`);
      await jobExtract({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product);
      markRequest(product.url, false);
    } catch (err) {
      markRequest(product.url, true);
      LOG(`pending retry extract error: ${(err as Error).message}`);
    }
  }

  // 2.4. Backfill de classificação: produtos antigos (ativos/revisão) nunca classificados
  const unclassified = await prisma.product.findMany({
    where: {
      status: { in: ["active", "pending_review"] },
      category: null,
      classifiedAt: null,
    },
    take: 2,
    orderBy: { updatedAt: "asc" },
  });
  for (const product of unclassified) {
    try {
      await jobClassify({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product);
    } catch (err) {
      LOG(`backfill classify error: ${(err as Error).message}`);
    }
  }

  // 2.5. Brand-flexible search for products that opted in
  const flexDue = await prisma.product.findMany({
    where: {
      status: { in: ["active", "pending_review"] },
      flexBrands: true,
      specTokens: { not: Prisma.DbNull },
      OR: [
        { lastFlexSearchAt: null },
        { lastFlexSearchAt: { lt: new Date(Date.now() - 6 * 60 * 60_000) } },
      ],
    },
    take: 2,
  });
  for (const product of flexDue) {
    try {
      await jobSearchFlex({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG }, product);
      await prisma.product.update({ where: { id: product.id }, data: { lastFlexSearchAt: new Date() } });
    } catch (err) {
      LOG(`jobSearchFlex error: ${(err as Error).message}`);
    }
  }

  // 3. Due price checks
  const due = await prisma.product.findMany({
    where: { status: "active", nextCheckAt: { lte: now } },
    include: { listings: true },
    take: 3,
    orderBy: { nextCheckAt: "asc" },
  });
  for (const product of due) {
    try {
      await jobCheck({ db: prisma, fetch: fetchPort, ai: null, aiForUser, searchFetch, log: LOG, acquire: acquireDomain }, product);
      for (const listing of product.listings) markRequest(listing.url, false);
    } catch (err) {
      for (const listing of product.listings) markRequest(listing.url, true);
      LOG(`jobCheck error: ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  LOG(`catapreco worker starting (tick ${TICK_MS}ms, browser ${BROWSER_DISABLED ? "OFF" : "on"}, proxy intl: ${PROXY_INTERNATIONAL ? "yes" : "no"})`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      LOG(`tick error: ${(err as Error).message}`);
    }
    await sleep(TICK_MS);
  }
}

const isDirectRun = process.argv[1]?.includes("index.ts") || process.argv[1]?.includes("index.js");
if (isDirectRun) {
  void main();
}

export { acquireDomain, markRequest };

/**
 * Worker jobs: extract (new products), search (cross-marketplace),
 * check (price refresh + alerts + notifications).
 * Prisma + scraper integrated here; rate limiting in the caller loop.
 */

import type { PrismaClient, Product, Listing } from "@catapreco/db";
import { Prisma } from "@catapreco/db";
import {
  acceptPriceTransition,
  evaluateTransition,
  nextCheckAt,
  normalizeName,
  normalizeProductUrl,
  productNameFromUrl,
  toBrlCents,
  type StockStatus,
} from "@catapreco/core";
import {
  classifyProduct,
  filterMatchingHits,
  looksLikeBotWall,
  makeSearxngSource,
  queryLadder,
  scrapeProduct,
  SEARCH_SOURCES,
  marketplaceName,
  type AIPort,
  type FetchPort,
  type PipelineResult,
} from "@catapreco/scraper";
import { specMatch, hasNegativeSpec } from "@catapreco/core";
import { dispatchEvent } from "./runtime/notifier";
import { getUsdBrl } from "./runtime/fx";

/** Convert native-currency price into BRL cents when needed. */
async function toBrl(cents: number | null, currency: string): Promise<number | null> {
  if (cents == null) return null;
  if (currency === "BRL") return cents;
  const rate = await getUsdBrl();
  return rate ? toBrlCents(cents, rate) : null;
}

export interface JobDeps {
  db: PrismaClient;
  fetch: FetchPort;
  ai: AIPort | null;
  log: (msg: string) => void;
  /** called to resolve per-user AI config lazily */
  aiForUser: (userId: string) => Promise<AIPort | null>;
  searchFetch: FetchPort;
  /** rate-limit hook — chamado antes de CADA fetch de listing dentro de um job */
  acquire?: (url: string) => Promise<void>;
}

async function persistCheck(
  db: PrismaClient,
  listingId: string,
  result: PipelineResult,
  startedAt: number,
) {
  await db.priceCheck.create({
    data: {
      listingId,
      ok: result.ok,
      method: result.selected?.source ?? null,
      error: result.error ?? null,
      durationMs: Date.now() - startedAt,
      candidates: JSON.parse(JSON.stringify(result.candidates)),
      logs: result.logs,
    },
  });
}

/** Recompute denormalized aggregates on the product from its listings. */
async function refreshProductAggregates(db: PrismaClient, productId: string) {
  // isAlternative (outra marca) NÃO entra no preço do produto — poluiria o
  // min e quebraria a referência do alerta "alternativa mais barata".
  // Listings que batem numa spec NEGATIVA também não (ex.: A1 mini quando o
  // usuário só quer a A1).
  const prod = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const negatives = (prod.negativeSpecs as string[] | null) ?? [];
  const listings = await db.listing.findMany({
    where: { productId, isAlternative: false, OR: [{ priceBrlCents: { not: null } }, { priceCents: { not: null } }] },
    select: { title: true, priceCents: true, priceBrlCents: true },
  });
  const eligible = negatives.length
    ? listings.filter((l) => !l.title || !hasNegativeSpec(l.title, negatives))
    : listings;
  const prices = eligible.map((l) => l.priceBrlCents ?? (l.priceCents as number));
  if (prices.length === 0) {
    // sem preço em nenhuma listing → limpa agregados stale (ex.: DJI Osmo com min fantasma)
    await db.product.update({
      where: { id: productId },
      data: { minPriceCents: null },
    });
    return;
  }
  const minPrice = Math.min(...prices);
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  const lowestEver = product.lowestEverCents != null
    ? Math.min(product.lowestEverCents, minPrice)
    : minPrice;
  const lowestPoint = await db.pricePoint.findFirst({
    where: { listing: { productId, isAlternative: false } },
    orderBy: { priceCents: "asc" },
    select: { priceCents: true },
  });
  await db.product.update({
    where: { id: productId },
    data: {
      minPriceCents: minPrice,
      lowestEverCents: lowestPoint?.priceCents ?? lowestEver,
    },
  });
}

/** status 'extracting' → scrape origin URL, create primary listing. */
export async function jobExtract(deps: JobDeps, product: Product): Promise<void> {
  const { db, log } = deps;
  const ai = deps.ai ?? (await deps.aiForUser(product.userId));
  const startedAt = Date.now();
  log(`extract product ${product.id} (${product.url})`);

  // listing primária sempre criada — sem ela, nem revisão manual é possível
  async function ensureListing(data: Record<string, unknown>) {
    const base = {
      marketplace: marketplaceName(product.url),
      url: product.url,
      isPrimary: true,
      lastCheckedAt: new Date(),
      ...data,
    };
    const existing = await db.listing.findUnique({
      where: { productId_url: { productId: product.id, url: product.url } },
    }).catch(() => null);
    if (existing) {
      return db.listing.update({ where: { id: existing.id }, data: base });
    }
    return db.listing.create({ data: { ...base, productId: product.id } as never });
  }

  let result: PipelineResult;
  try {
    result = await scrapeProduct(product.url, deps.fetch, { ai: ai ?? undefined });
  } catch (err) {
    log(`extract failed: ${(err as Error).message}`);
    await ensureListing({ title: product.title, priceCents: null, stock: "unknown" });
    await db.product.update({
      where: { id: product.id },
      data: { status: "error", lastLogs: [(err as Error).message], nextCheckAt: new Date(Date.now() + 60 * 60_000) },
    });
    return;
  }

  // se a página não deu nome (ou deu placeholder/botwall), o slug do link costuma ter
  const JUNK_PAGE_NAME = /produto sem nome|não é possível acessar|^untitled|^error/i;
  const pageNameUsable = result.name && !JUNK_PAGE_NAME.test(result.name);
  const effectiveName = pageNameUsable ? result.name! : productNameFromUrl(product.url) ?? "Produto sem nome";

  if (!result.ok) {
    log(`extract blocked/failed: ${result.error}`);
    const listing = await ensureListing({ title: effectiveName, priceCents: null, stock: result.stock });
    await persistCheck(db, listing.id, result, startedAt);
    // se temos um nome útil (mesmo que do link), vai para revisão manual
    // (permitindo busca cross + classificação em paralelo); senão, error com retry
    const usableName = effectiveName !== "Produto sem nome";
    await db.product.update({
      where: { id: product.id },
      data: {
        title: effectiveName,
        image: result.image ?? product.image,
        status: usableName ? "pending_review" : "error",
        pendingCandidates: usableName ? Prisma.DbNull : undefined,
        lastLogs: result.logs,
        nextCheckAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    log(`extract blocked/failed → ${usableName ? "pending_review (preço manual)" : "error"}: ${result.error}`);
    return;
  }

  const nativeCents = result.selected?.valueCents ?? null;
  const brlCents = await toBrl(nativeCents, result.currency);
  const importData = {
    // detecção de importação: só sobrescreve quando a página informou algo
    ...(result.imported != null ? { imported: result.imported } : {}),
    ...(result.taxIncluded != null ? { taxIncluded: result.taxIncluded } : {}),
  };
  const listingData = {
    marketplace: marketplaceName(product.url),
    url: product.url,
    title: result.name,
    isPrimary: true,
    stock: result.stock,
    currency: result.currency,
    priceCents: nativeCents,
    priceBrlCents: brlCents,
    lastCheckedAt: new Date(),
    ...importData,
  };

  let listing = await db.listing.findUnique({
    where: { productId_url: { productId: product.id, url: product.url } },
  }).catch(() => null);
  if (listing) {
    listing = await db.listing.update({ where: { id: listing.id }, data: listingData });
  } else {
    listing = await db.listing.create({ data: { ...listingData, productId: product.id } });
  }

  await persistCheck(db, listing.id, result, startedAt);
  if (result.selected) {
    await db.pricePoint.create({
      data: { listingId: listing.id, priceCents: brlCents ?? result.selected.valueCents, stock: result.stock },
    });
  }

  if (result.needsReview) {
    await db.product.update({
      where: { id: product.id },
      data: {
        title: effectiveName,
        image: result.image ?? product.image,
        status: "pending_review",
        pendingCandidates: JSON.parse(JSON.stringify(result.candidates)),
        lastLogs: result.logs,
      },
    });
    log(`extract → pending_review (${result.candidates.length} candidates, name: "${effectiveName.slice(0, 40)}")`);
    return;
  }

  await db.product.update({
    where: { id: product.id },
    data: {
      title: effectiveName,
      image: result.image ?? product.image,
      status: "searching",
      minPriceCents: result.selected?.valueCents ?? null,
      lowestEverCents: result.selected?.valueCents ?? null,
      pendingCandidates: Prisma.DbNull,
      lastLogs: result.logs,
    },
  });
  log(`extract → searching (price ${result.selected?.valueCents ?? "?"})`);
}

/** Título de página (não de produto) que não deve ser classificado. */
const NON_PRODUCT_TITLE = /ofertas incr|shopee brasil|^shopee|produto sem nome|não é possível acessar|^untitled|^error|acesso negado/i;

/** Após extração bem-sucedida: classifica o produto via IA (commodity vs exato). */
export async function jobClassify(deps: JobDeps, product: Product): Promise<void> {
  const { db, log } = deps;
  if (!product.title) return; // não classifica sem nome
  if (product.category) return; // já classificado
  const mark = (label: string) => {
    log(`classify skip: ${label}`);
    return db.product
      .update({ where: { id: product.id }, data: { classifiedAt: new Date() } })
      .catch(() => {});
  };
  if (NON_PRODUCT_TITLE.test(product.title)) return void mark(`título não é produto ("${product.title.slice(0, 40)}")`);
  const ai = deps.ai ?? (await deps.aiForUser(product.userId));
  if (!ai) return; // IA desligada: não marca classifiedAt (pode ligar depois)

  const cls = await classifyProduct(product.title, ai);
  if (!cls) {
    log(`classify: no AI result for ${product.id}`);
    return;
  }
  log(`classify ${product.id}: commodity=${cls.commodity} cat=${cls.category} specs=[${cls.specs.join(",")}] (${cls.reason})`);
  await db.product.update({
    where: { id: product.id },
    data: {
      category: cls.category,
      specTokens: cls.specs,
      classifiedAt: new Date(),
    },
  });
}

/** Busca cross-marketplace por spec (sem marca). Só corre se flexBrands=true. */
export async function jobSearchFlex(deps: JobDeps, product: Product): Promise<void> {
  const { db, log } = deps;
  if (!product.flexBrands) return;
  const specs = (product.specTokens as string[] | null) ?? [];
  const negatives = (product.negativeSpecs as string[] | null) ?? [];
  if (specs.length === 0) {
    log(`flex ${product.id}: sem specs — pulando`);
    return;
  }
  log(`flex ${product.id}: buscando spec [${specs.join(",")}]${negatives.length ? ` excluindo [${negatives.join(",")}]` : ""}`);

  // query por spec apenas (sem marca)
  const catKeywords = [product.category ?? ""].filter(Boolean);
  const queryParts = [...catKeywords, ...specs.filter((s) => s !== (product.category ?? "")).slice(0, 4)];
  const query = queryParts.join(" ");
  if (query.length < 3) return;

  const channels = await db.notificationChannel.findMany({ where: { userId: product.userId } }).then((chs) =>
    chs.map((c) => ({ ...c, events: c.events as string[] })),
  );

  let added = 0;
  for (const source of SEARCH_SOURCES.slice(0, 1)) { // ML por ora (mais tolerante)
    try {
      await deps.acquire?.(source.buildUrl(query));
      const res = await deps.fetch.get(source.buildUrl(query.replace(/\s+/g, "-")));
      if (res.status !== 200) continue;
      const hits = filterMatchingHits(query, source.parse(res.html), 0.5);
      for (const hit of hits.slice(0, 3)) {
        const specResult = specMatch(hit.title, specs, 0.75, negatives);
        if (!specResult.ok) {
          log(`flex: rejeitado "${hit.title.slice(0, 50)}" — ${specResult.reasons[0]}`);
          continue;
        }
        // guarda de categoria: o primeiro token do título do produto
        // ("liquidificador", "placa") precisa existir no anúncio — evita
        // matches fracos só com specs genéricas ("sanduicheira 750w")
        const firstToken = normalizeName(product.title ?? "").split(" ")[0];
        if (firstToken && firstToken.length >= 3 && !normalizeName(hit.title).includes(firstToken)) {
          log(`flex: rejeitado "${hit.title.slice(0, 50)}" — sem a categoria "${firstToken}"`);
          continue;
        }
        const normUrl = normalizeProductUrl(hit.url);
        const exists = await db.listing.findUnique({
          where: { productId_url: { productId: product.id, url: normUrl } },
        }).catch(() => null);
        if (exists?.url && normalizeProductUrl(exists.url) === normUrl) continue;
        if (exists) continue;

        // keywords anti-acessório do matching padrão já estão no score implícito
        const brand = guessBrand(hit.title, product.title ?? "");
        await db.listing.create({
          data: {
            productId: product.id,
            marketplace: hit.marketplace,
            url: normUrl,
            title: hit.title,
            isPrimary: false,
            isAlternative: true,
            brand,
            priceCents: hit.priceCents,
            currency: "BRL",
            lastCheckedAt: new Date(),
          },
        });
        added++;
        // notificação dedicada à parte: 'achei alternativa compatível mais barata'
        const ref = product.minPriceCents ?? 0;
        if (ref > 0 && hit.priceCents != null && hit.priceCents < ref) {
          await dispatchEvent(
            { kind: "alternative_cheaper", prevCents: ref, nextCents: hit.priceCents },
            { title: hit.title, url: normUrl, marketplace: hit.marketplace },
            channels.map((c) => ({ ...c, events: c.events })),
            fetch,
            log,
          );
        }
      }
    } catch (err) {
      log(`flex ${source.id}: falha ${(err as Error).message}`);
    }
  }
  log(`flex ${product.id}: ${added} alternativa(s) adicionadas`);
}

/** Heurística simples: pega marca do hit como "primeira token capitalizada em brands comuns". */
function guessBrand(hitTitle: string, targetTitle: string): string | null {
  const target = targetTitle.toLowerCase();
  const KNOWN = ["kingston", "sandisk", "wdc", "wd", "crucial", "corsair", "msi", "asus", "gigabyte", "samsung", "palit", "pcyes", "glacial", "galax", "zotac", "nisuta", "fifine", "logitech", "dexter"];
  const hitNorm = hitTitle.toLowerCase();
  for (const b of KNOWN) {
    if (hitNorm.includes(b) && !target.includes(b)) return b;
  }
  return null;
}

const JUNK_TITLE_RE = /produto sem nome|não é possível acessar|^(untitled|error)/i;

/** status 'searching' → find the same product on other marketplaces. */
export async function jobSearch(
  deps: JobDeps,
  product: Product,
  opts: { keepPending?: boolean } = {},
): Promise<void> {
  const { db, log } = deps;
  const keepPending = opts.keepPending ?? false;

  // se o título é placeholder, tenta recuperar do slug da URL (mesmo sem preço)
  let title = product.title;
  if (!title || JUNK_TITLE_RE.test(title)) {
    const fromUrl = productNameFromUrl(product.url);
    if (fromUrl) {
      title = fromUrl;
      await db.product.update({ where: { id: product.id }, data: { title: fromUrl } });
      log(`search: recuperou título do link: "${fromUrl}"`);
    } else {
      log(`search skipped: junk/empty title on product ${product.id}`);
      await db.product.update({
        where: { id: product.id },
        data: { status: keepPending ? "pending_review" : "active", searchedAt: new Date() },
      });
      return;
    }
  }
  log(`search cross-marketplace for "${title}"`);

  // specs negativas valem TAMBÉM pra busca exata: "-mini" remove A1 Mini da A1
  const negatives = (product.negativeSpecs as string[] | null) ?? [];

  // canonical urls already tracked for this product (dedup)
  const existingListings = await db.listing.findMany({
    where: { productId: product.id },
    select: { url: true },
  });
  const existingNormal = new Set(
    [product.url, ...existingListings.map((l) => l.url)].map(normalizeProductUrl),
  );

  const ladder = queryLadder(title);
  log(`query ladder: ${ladder.map((q) => `"${q}"`).join(" → ")}`);

  // fontes fixas + SearXNG quando configurado (SEARXNG_URL)
  const sources = [...SEARCH_SOURCES];
  const searxngUrl = process.env.SEARXNG_URL?.trim();
  if (searxngUrl) sources.push(makeSearxngSource(searxngUrl));

  for (const source of sources) {
    try {
      // ladder: tenta queries do mais específico ao mais amplo
      let hits: ReturnType<typeof filterMatchingHits> = [];
      if (source.accumulate) {
        // fontes web: junta os 2 primeiros degraus (cobertura vale mais que precisão)
        const raw: Parameters<typeof filterMatchingHits>[1] = [];
        for (const [level, q] of ladder.slice(0, 2).entries()) {
          await deps.acquire?.(source.buildUrl(q));
          const res = await deps.fetch.get(source.buildUrl(q));
          if (res.status !== 200) {
            log(`search ${source.id} L${level}: HTTP ${res.status}`);
            continue;
          }
          if (looksLikeBotWall(res.html)) {
            log(`search ${source.id} L${level}: bot wall — pulando fonte (não é "0 matches")`);
            break;
          }
          raw.push(...source.parse(res.html));
        }
        const uniq = [...new Map(raw.map((h) => [normalizeProductUrl(h.url), h])).values()];
        hits = filterMatchingHits(title, uniq);
      } else {
        for (const [level, q] of ladder.entries()) {
          await deps.acquire?.(source.buildUrl(q));
          const res = await deps.fetch.get(source.buildUrl(q));
          if (res.status !== 200) {
            log(`search ${source.id} L${level}: HTTP ${res.status}`);
            continue;
          }
          if (looksLikeBotWall(res.html)) {
            log(`search ${source.id}: bot wall na página de BUSCA — interrompendo fonte (evita martelar o domínio)`);
            break;
          }
          hits = filterMatchingHits(title, source.parse(res.html));
          if (hits.length > 0) break;
          log(`search ${source.id} L${level} ("${q}"): 0 matches, descendo na ladder`);
        }
      }
      if (hits.length === 0) {
        log(`search ${source.id}: 0 matches em toda a ladder`);
        continue;
      }
      let added = 0;
      for (const hit of hits.slice(0, source.accumulate ? 5 : 3)) {
        if (existingNormal.has(normalizeProductUrl(hit.url))) continue;
        if (negatives.length && hasNegativeSpec(hit.title, negatives)) {
          log(`search ${source.id}: rejeitado por spec negativa — "${hit.title.slice(0, 50)}"`);
          continue;
        }
        const saved = await db.listing.upsert({
          where: { productId_url: { productId: product.id, url: hit.url } },
          create: {
            productId: product.id,
            marketplace: hit.marketplace,
            url: hit.url,
            title: hit.title,
            isPrimary: false,
            priceCents: hit.priceCents, // pode ser null (busca web) — extração preenche depois
            currency: "BRL",
            matchScore: hit.score,
            lastCheckedAt: new Date(),
          },
          update: {
            ...(hit.priceCents != null ? { priceCents: hit.priceCents } : {}),
            matchScore: hit.score,
            title: hit.title,
          },
        });
        if (hit.priceCents != null) {
          await db.pricePoint.create({
            data: { listingId: saved.id, priceCents: hit.priceCents, stock: "in_stock" },
          }).catch(() => {});
        }
        added++;
      }
      log(`search ${source.id}: ${hits.length} matches, ${added} added`);
    } catch (err) {
      log(`search ${source.id} failed: ${(err as Error).message}`);
    }
  }

  await refreshProductAggregates(db, product.id);
  await db.product.update({
    where: { id: product.id },
    data: {
      // pending_review continua esperando o usuário confirmar o preço
      status: keepPending ? "pending_review" : "active",
      searchedAt: new Date(),
      nextCheckAt: nextCheckAt(new Date(), product.intervalMin),
    },
  });
}

/** status 'active' + due → re-scrape all listings, record history, fire alerts. */
export async function jobCheck(deps: JobDeps, product: Product & { listings: Listing[] }): Promise<void> {
  const { db, log } = deps;
  const channels = await db.notificationChannel.findMany({ where: { userId: product.userId } }).then((chs) =>
    chs.map((c) => ({ ...c, events: c.events as string[] })),
  );
  let anyChanged = false;

  for (const listing of product.listings) {
    const startedAt = Date.now();
    const prevPrice = listing.priceBrlCents ?? listing.priceCents;
    const prevStock = (listing.stock as StockStatus) ?? "unknown";
    let result: PipelineResult;
    try {
      // respeita o gap por domínio entre listings do MESMO produto também
      await deps.acquire?.(listing.url);
      result = await scrapeProduct(listing.url, deps.fetch, { ai: null });
    } catch (err) {
      log(`check listing ${listing.id} error: ${(err as Error).message}`);
      await persistCheck(db, listing.id,
        { url: listing.url, ok: false, error: (err as Error).message, name: null, image: null, currency: "BRL", stock: "unknown", candidates: [], selected: null, needsReview: false, usedAi: false, logs: [(err as Error).message], fetchedAt: new Date() } as PipelineResult,
        startedAt);
      continue;
    }

    await persistCheck(db, listing.id, result, startedAt);
    if (!result.ok || !result.selected) continue;

    const price = result.selected.valueCents; // native currency
    const stock = result.stock;

    // wild-swing guard: generic-source jumps vs previous reading are suspicious
    const guard = acceptPriceTransition(prevPrice ?? null, price, result.selected.source);
    if (!guard.accept) {
      log(`listing ${listing.id}: swing recusado (${prevPrice} → ${price}) — ${guard.reason}`);
      continue; // não grava leitura suspeita; próxima checagem tenta de novo
    }

    const priceBrl = await toBrl(price, result.currency);
    await db.pricePoint.create({ data: { listingId: listing.id, priceCents: priceBrl ?? price, stock } });
    await db.listing.update({
      where: { id: listing.id },
      data: {
        priceCents: price,
        priceBrlCents: priceBrl,
        stock,
        lastCheckedAt: new Date(),
        currency: result.currency,
        // detecção de importação: só atualiza quando a página informou
        ...(result.imported != null ? { imported: result.imported } : {}),
        ...(result.taxIncluded != null ? { taxIncluded: result.taxIncluded } : {}),
      },
    });

    const comparable = priceBrl ?? price; // alertas sempre em BRL
    const threshold = {
      absCents: product.dropAbsCents ?? undefined,
      pct: product.dropPct ?? undefined,
    };
    const events = evaluateTransition(prevPrice ?? null, comparable, prevStock, stock, product.targetCents, threshold);
    for (const event of events) {
      log(`event ${event.kind} on product ${product.id} (${prevPrice} → ${comparable} ${stock})`);
      await dispatchEvent(event, { title: product.title ?? "produto", url: listing.url, marketplace: listing.marketplace }, channels, fetch, log);
    }
    if (prevPrice !== comparable) anyChanged = true;
  }

  await refreshProductAggregates(db, product.id);
  await db.product.update({
    where: { id: product.id },
    data: { nextCheckAt: nextCheckAt(new Date(), product.intervalMin), status: "active" },
  });
  if (anyChanged) log(`product ${product.id} updated`);
}

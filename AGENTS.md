# AGENTS.md — CataPreço

## Layout
- `packages/core` — **lógica pura, zero I/O**. Dinheiro em centavos (int). Testes em `packages/core/tests`.
- `packages/scraper` — extratores puros (HTML string → dados) + ports (`FetchPort`, `AIPort`). Fixtures em `packages/scraper/tests/fixtures/`.
- `packages/db` — Prisma schema. Rodar `npm run generate -w packages/db` após mudar o schema.
- `apps/web` — Next.js 15 (App Router), API em `src/app/api`, UI em `src/components`. `output: standalone`.
- `apps/worker` — loop do scheduler: `extract` → `search` → `check`. Rate limit por domínio.

## Lições de anti-bot (medidas ao capturar fixtures reais, set/2026)
- **Mercado Livre**: lista/detalhe via curl → página "suspicious-traffic"; via Chromium+stealth passa. API pública `api.mercadolibre.com/sites/MLB/search` → **403 anônima hoje**; usar `lista.mercadolivre.com.br/<termo>` + parser `parseMlSearchHtml` (cards `.poly-card`; pular trackers `click1.*`).
- **Kabum**: stealth passa; busca vem em `__NEXT_DATA__` (props.pageProps.data.catalogServer.data).
- **Amazon BR**: stealth passa; busca funciona mas sponsored usam `/sspa/click` → só aceitar hrefs `/dp/B[A-Z0-9]{9}`.
- **AliExpress**: JSON-LD presente; moeda em pt.aliexpress.com é BRL já. Recentemente passou a exigir login para expor preço (extrai nome, não preço). Cuidado: a página contém strings "captcha" no SDK — `looksLikeBotWall` não marca quando acha `@type:Product`.
- **Shopee**: precisa de **warm-up de cookies** (visitar a home primeiro, senão redireciona pra home). Extrai `og:title` (nome) mas o preço só aparece após login/AJAX — cai em `pending_review` manual. API `api/v4/pdp/get_pc` é 403.
- **Magalu (Akamai) / Leroy Merlin (DataDome)**: captive challenge → status `error` + retry 1h + cooldown. Não extrair preço de página de challenge nunca. Proxies gratuitos NÃO resolvem (já nascem banidos); única saída real é Firecrawl Cloud (proxies residenciais).
- **Match de produto**: coverage do nome + `MODEL_PATTERN` estrito (372 ≠ nv2, 3060 ≠ 3050). Cuidado com tokens de 1-2 dígitos vindos de "4.0" quebrando.

## Warm-up de cookies (`BrowserFetchPort`)
- Domínios com anti-bot forte exigem cookies do domínio raiz antes da página de produto.
- `BrowserFetchPort.get()` faz `warmUp(domínio)` na 1ª visita (home → cookies persistem no mesmo context). Mantém `warmedDomains` em memória.
- O domínio de warm-up vem de `domainOf()` do core (lida com TLD composto `.com.br`) — nunca derivar com `split(".").slice(-2)`.
- Proxies: `PROXY_POOL=1` habilita pool de proxies grátis (~25 vivos) como **último recurso local**: só roda quando nativo+browser direto falham (4xx/6xx/botwall). Nunca é o caminho padrão — proxies grátis pioram o acesso a sites que passam direto (ML/KaBuM/Amazon).

## Cascata de fetch (`fetchFor` no worker)
- Ordem: nativo → browser direto → proxy pool (se ligado e bloqueado) → Firecrawl (se configurado).
- `CascadeFetchPort` escala pro browser em 403/429/**5xx**/botwall — identidade "curl" leva 503 transitório em vários sites.
- `pending_review` SEM `pendingCandidates` = falha de fetch (não ambiguidade): o worker re-tenta a extração a cada 6h. Com candidatos = esperando o usuário no modal.
- `decide()`: candidato único vindo só de CSS genérico exige conf ≥ 0.6 (fontes estruturadas: conf/2).

## Specs flex (brand-flexible)
- `specMatch(title, specs, threshold, negativeSpecs)`: negativeSpecs rejeitam o anúncio se presentes no título. UI: no campo "+ spec", digitar `-termo` cria spec negativa.
- `hasNegativeSpec(title, negatives)` vale TAMBÉM pra busca exata e pro agregado de preço: listing com termo negativo não entra mais nem no menor preço (ex.: "-mini" numa Bambu A1 ignora a A1 Mini).
- Flex tem guarda de categoria: o 1º token do título do produto precisa existir no anúncio (evita "sanduicheira 750w" casar com "liquidificador 750w").
- `refreshProductAggregates` ignora listings `isAlternative` e com spec negativa — o preço do produto reflete só o que o usuário quer; alternativas viram linha própria no gráfico (altSeries).
- Editar specs/flexBrands via PATCH zera `lastFlexSearchAt` → flex re-roda no próximo tick.

## Busca cross-marketplace
- Fontes: ML, Amazon BR, KaBuM + **DDG** (`html.duckduckgo.com/html`), **Bing** (`bing.com/search`, redirect `/ck/a?u=a1<base64>`) e **SearXNG** (self-hosted no compose, `/search?format=json`, env `SEARXNG_URL` — vazio desliga) para lojas nicho (Terabyte, Pichau, 3D Prime, GTMax3D — VTEX/Shopify/Woo com JSON-LD limpo). Ads e páginas de busca (`lista.*`, `/busca`) são filtrados; `SearchHit.priceCents` pode ser null — a extração preenche no check.
- Fontes web (`accumulate: true`) somam os 2 primeiros degraus da ladder por cobertura e adicionam até 5 listings (outras fontes: 3, para no primeiro nível com hit).
- `jobSearch`/`jobSearchFlex` respeitam `acquire` por query e param a fonte ao ver bot wall em página de BUSCA (evita martelar domínio temporariamente bloqueado e loga "bot wall" em vez de "0 matches" enganoso).

## Alertas
- Sem threshold configurado, queda precisa ser ≥ 1% (anti-ruído); alvo (`target_hit`) e `back_in_stock` não disparam na primeira leitura (prev null).

## Importação (Remessa Conforme)
- `detectImportInfo(html, url)` (extractors/importinfo.ts) devolve `imported`/`taxIncluded` por sinais na página ("estoque no brasil", "envio internacional", "imposto incluído", ...) + heurística de host cross-border. Persistido na Listing; Product card usa detecção por listing, com fallback pro checkbox `remessaConforme` do produto.
- `calculateRemessaConformeBrl` faz a conta para preços já em BRL (pt.aliexpress); `calculateRemessaConforme` para USD.

## Firecrawl (último recurso)
- `FirecrawlPort` em `apps/worker/src/runtime/firecrawl.ts` → usado quando a cascata local (native→browser→proxy) é bloqueada. Env: `FIRECRAWL_API_KEY`/`FIRECRAWL_API_URL`.
- Self-host foi testado e **removido**: compartilhava o mesmo IP do homelab, então não passa ban por IP; e custava ~4GB de RAM. Se um dia usar Firecrawl Cloud (proxies residenciais, pago), basta ligar o env.
- **A peça boa** que veio do Firecrawl: extração com metadados e blocos de preço no topo antes de chamar a IA (ver `visibleTextSummary` em `packages/scraper/src/extractors/generic.ts`).

## Regras
- NUNCA faça I/O (fetch/db/timers reais) dentro de `packages/*`.
- Monorepo npm workspaces; imports internos SEM extensão `.js` (Next/webpack não resolve).
- Testes: `npm test` (vitest). Novo extrator = nova fixture + teste.
- Não commitar sem pedir. Não rodar `npm install` com postinstall scripts maliciosos (npm 11 bloqueia por padrão).

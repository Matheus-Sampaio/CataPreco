<div align="center">

# 🎯 CataPreço

**Rastreie preços dos marketplaces brasileiros e internacionais. Self-hosted, open-source, feito para economizar.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-16-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-184%20passing-brightgreen)]()

</div>

---

Cole o link de um produto, e o **CataPreço** extrai nome, preço e disponibilidade — depois encontra o mesmo produto em outras lojas, acompanha o histórico e avisa quando o preço cair, bater na sua meta ou voltar ao estoque.

## ✨ Funcionalidades

- 🔗 **Extração resiliente** com cadeia de fallback: `JSON-LD → adapters por site → CSS genérico → IA`
- 🔎 **Busca cross-marketplace** — encontra o mesmo produto em outras lojas
- 📉 **Histórico de preços** com gráfico do menor preço e estatísticas (mín/média/máx)
- 🔔 **Alertas multi-canal**: Telegram, Discord, Pushover, ntfy.sh e Gotify
- 🎯 **Preço-alvo**, queda percentual e **alertas de volta ao estoque**
- 🧠 **Alternativas por spec** (brand-flexible): "aceito outra marca se a especificação bater" — SSD 1TB NVMe Gen4 de qualquer marca, com **specs negativas** (`-notebook` exclui o termo) e linha própria no gráfico de histórico
- 🇧🇷 **Remessa Conforme** — detecção automática **por anúncio**: item nacional vs importado e imposto já incluído ou não (mesmo marketplace misto). Estimativa de imposto só quando faz sentido
- 🌐 **Busca web (DuckDuckGo + Bing)** — descobre o produto em lojas nicho além dos marketplaces (Terabyte, Pichau, 3D Prime, Beehive, GTMax…)
- 👥 **Multi-usuário** com painel admin e controle de cadastro
- 📱 **PWA** + modo claro/escuro + design responsivo
- 🕶️ **Anti-bot inteligente**: Chromium stealth, warm-up de cookies, proxy pool rotativo e detecção de captcha

## 🚀 Quick start (Docker)

```bash
git clone https://github.com/Matheus-Sampaio/CataPreco.git
cd CataPreco

cp .env.example .env
# edite .env e defina uma DB_PASSWORD forte

docker compose up -d --build
```

Acesse **http://localhost:3000** e cadastre o primeiro usuário (vira admin automaticamente).

## ⚙️ Configuração

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_PASSWORD` | ✅ | Senha do PostgreSQL |
| `PROXY_URL` / `PROXY_INTERNATIONAL_URL` | — | Proxy fixo (ou para lojas internacionais) |
| `PROXY_POOL` | — | `1` = pool de proxies grátis como último recurso |
| `FIRECRAWL_API_KEY` / `FIRECRAWL_API_URL` | — | Último recurso anti-bot (cloud ou self-host) |
| `SEARXNG_URL` / `SEARXNG_REPLICAS` | — | Meta-busca de lojas nicho — ligada por padrão; `SEARXNG_URL=` vazio + `SEARXNG_REPLICAS=0` desliga |

A IA é configurável pela UI (⚙️ → IA): **Ollama** (local), **OpenAI‑compatible** (incluindo **NVIDIA NIM** grátis), ou **Anthropic**.

## 🏗️ Arquitetura

```
apps/web        Next.js 15 — UI + API routes
apps/worker     Scheduler + scraping (Playwright stealth), jobs extract/search/check
packages/core   Lógica de domínio PURA (zero I/O): parsing de preço, Remessa Conforme,
                matching, arbitragem de candidatos, alertas, rate-limit
packages/scraper Extratores puros (HTML → dados). I/O apenas via ports injetáveis
packages/db     Prisma + PostgreSQL
```

**Princípio central**: tudo em `packages/` é função pura e 100% testável; I/O vive atrás de *ports* injetáveis. Cada extrator tem *fixture* de HTML real.

## 🛠️ Desenvolvimento

```bash
npm install
npm test                 # vitest — 148 testes
npm run db:push          # aplica o schema
npm run dev:web          # http://localhost:3000
npm run dev:worker       # scheduler (SCRAPER_DISABLE_BROWSER=1 sem Chromium)

# debugar um site novo: capture a página real como fixture
npx tsx apps/worker/scripts/capture-fixture.ts "https://loja/produto" loja --browser
```

## 📊 Suporte a marketplaces

| Site | Extração | Busca | Notas |
|---|---|---|---|
| Mercado Livre | ✅ | ✅ | Chromium stealth (API pública anônima caiu) |
| KaBuM! | ✅ | ✅ | `__NEXT_DATA__` |
| Amazon BR | ✅ | ✅ | filtra links patrocinados `/sspa` |
| FastShop | ✅ | — | VTEX/JSON-LD |
| AliExpress | ✅ parcial | — | preço requer login desde 2025 |
| Shopee / Magalu / Leroy | ⚠️ restrito | — | anti-bot pesado (Akamai/DataDome) |

## 📄 Licença

MIT — sinta-se livre para usar, modificar e contribuir.

> Respeite os `robots.txt` e os termos de uso dos sites ao configurar intervalos de verificação.
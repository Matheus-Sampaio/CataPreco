import { domainOf } from "@catapreco/core";
import type { FetchPort, FetchResponse } from "@catapreco/scraper";
import type { Browser, BrowserContext } from "playwright";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

/**
 * Playwright-backed fetch port. Lazily launches a single headless Chromium.
 * Blocks heavy resources (images/fonts/media) to save RAM/CPU.
 */
export class BrowserFetchPort implements FetchPort {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private warmedDomains = new Set<string>();

  constructor(
    private opts: {
      proxyServer?: string; // e.g. "http://user:pass@host:port"
      timeoutMs?: number;
    } = {},
  ) {}

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    // playwright-extra + stealth reduce bot fingerprints (navigator.webdriver etc.)
    const pw = await import("playwright-extra").catch(() => null);
    const pwChromium = pw ? pw.chromium : null;
    if (pwChromium) {
      const stealth = (await import("puppeteer-extra-plugin-stealth")).default;
      pwChromium.use(stealth());
    }
    const launcher = pwChromium ?? (await import("playwright")).chromium;
    this.browser = await launcher.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox", "--disable-blink-features=AutomationControlled"],
    });
    this.context = await this.browser.newContext({
      userAgent: DESKTOP_UA,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1366, height: 768 },
      proxy: this.opts.proxyServer ? { server: this.opts.proxyServer } : undefined,
    });
    await this.context.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4|webm)(\?.*)?$/i, (route) =>
      route.abort(),
    );
    // contexto persistente: cookies vivem entre chamadas (warm-up por domínio)
    return this.context;
  }

  /** Warm up de um domínio: visita a homepage pra coletar cookies; stdout via log. */
  async warmUp(domain: string, log: (m: string) => void = () => {}): Promise<void> {
    const ctx = await this.ensureContext();
    const domainRoot = `https://${domain}/`;
    try {
      const page = await ctx.newPage();
      const res = await page.goto(domainRoot, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
      await page.waitForTimeout(4000); // deixa o JS executar e cookies assentarem
      const cookies = await ctx.cookies();
      log(`warmup ${domain}: HTTP ${res?.status()}, ${cookies.length} cookies`);
      await page.close().catch(() => {});
    } catch (err) {
      log(`warmup ${domain} falhou: ${(err as Error).message}`);
    }
  }

  async get(url: string): Promise<FetchResponse> {
    const ctx = await this.ensureContext();
    // domínios com anti-bot forte precisam de cookies antes da página
    // (domainOf lida com TLD composto: kabum.com.br → kabum.com.br, não "com.br")
    const domKey = domainOf(url);
    if (!this.warmedDomains.has(domKey)) {
      await this.warmUp(domKey, () => {});
      this.warmedDomains.add(domKey);
    }
    const page = await ctx.newPage();
    try {
      let res = null;
      try {
        res = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: this.opts.timeoutMs ?? 30_000,
        });
      } catch {
        // navigation race (client-side redirect chains) — page may still render
      }
      // give client-hydrated prices a moment to render
      await page.waitForTimeout(2000);
      // page may still be (re)navigating; content() throws on navigation churn — retry
      let html = "";
      let lastErr: Error | null = null;
      for (let i = 0; i < 5; i++) {
        try {
          html = await page.content();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err as Error;
          if (!/navigating/i.test(lastErr.message)) throw lastErr;
          await page.waitForTimeout(1200);
        }
      }
      if (lastErr) throw lastErr;
      return {
        url,
        finalUrl: page.url(),
        status: res?.status() ?? 200,
        html,
        usedBrowser: true,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
  }
}

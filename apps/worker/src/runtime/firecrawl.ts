import type { FetchPort, FetchResponse } from "@catapreco/scraper";

/**
 * Firecrawl-backed fetch port.
 *
 * Firecrawl (cloud api.firecrawl.dev or self-hosted) handles anti-bot,
 * rotating proxies and JS-heavy pages for us. Used as the LAST resort in
 * the cascade after native + local browser fail. Env-gated.
 *
 * Requires: FIRECRAWL_API_KEY and optional FIRECRAWL_API_URL (self-host).
 */

export interface FirecrawlScrapePayload {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    metadata?: { sourceURL?: string; statusCode?: number };
  };
}

/** Optimistic parser: v2 returns HTML in rawHtml/html, or markdown-only. */
export function firecrawlHtml(payload: FirecrawlScrapePayload): { html: string; finalUrl: string | null; status: number } | null {
  const d = payload?.data;
  if (!d) return null;
  const html = d.rawHtml ?? d.html ?? d.markdown ?? null;
  if (!html) return null;
  return {
    html,
    finalUrl: d.metadata?.sourceURL ?? null,
    status: d.metadata?.statusCode ?? 200,
  };
}

export class FirecrawlPort implements FetchPort {
  constructor(
    private opts: {
      apiKey: string;
      baseUrl?: string; // default https://api.firecrawl.dev
      timeoutMs?: number;
    },
  ) {}

  async get(url: string): Promise<FetchResponse> {
    const base = (this.opts.baseUrl ?? "https://api.firecrawl.dev").replace(/\/$/, "");
    const res = await fetch(`${base}/v2/scrape`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ url, formats: ["html", "markdown"] }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) {
      throw new Error(`firecrawl HTTP ${res.status}`);
    }
    const payload = (await res.json()) as FirecrawlScrapePayload;
    const parsed = firecrawlHtml(payload);
    if (!parsed) {
      throw new Error("firecrawl: resposta sem html/markdown");
    }
    return {
      url,
      finalUrl: parsed.finalUrl ?? url,
      status: parsed.status,
      html: parsed.html,
      usedBrowser: true,
    };
  }
}
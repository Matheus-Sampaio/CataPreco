import { findAdapter, looksLikeBotWall, type FetchPort, type FetchResponse } from "@catapreco/scraper";

/**
 * Cascading fetch: cheap native HTTP first, escalates to the browser
 * when the site demands it (needsBrowser) or fights back (bot wall / 403).
 */
export class CascadeFetchPort implements FetchPort {
  constructor(
    private native: FetchPort,
    private browser: FetchPort,
    private log: (msg: string) => void = () => {},
  ) {}

  async get(url: string): Promise<FetchResponse> {
    const adapter = findAdapter(url);
    if (adapter?.needsBrowser) {
      this.log(`direct browser fetch (${adapter.id} requires it)`);
      return this.browser.get(url);
    }

    try {
      const res = await this.native.get(url);
      // 403/429 = bloqueio; 5xx = o site recusou a identidade "curl" (transitório
      // ou WAF) — o browser tem bem mais chance nas duas situações
      if (res.status === 403 || res.status === 429 || res.status >= 500 || looksLikeBotWall(res.html)) {
        this.log(`native fetch blocked (status ${res.status}) — escalating to browser`);
        return this.browser.get(url);
      }
      return res;
    } catch (err) {
      this.log(`native fetch error (${(err as Error).message}) — escalating to browser`);
      return this.browser.get(url);
    }
  }
}

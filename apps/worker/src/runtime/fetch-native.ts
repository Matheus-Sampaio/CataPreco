import type { FetchPort, FetchResponse } from "@catapreco/scraper";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

/** Plain HTTP fetch with a desktop-like identity. Cheap and fast. */
export class NativeFetchPort implements FetchPort {
  constructor(private timeoutMs = 20_000) {}

  async get(url: string): Promise<FetchResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": DESKTOP_UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8",
          "upgrade-insecure-requests": "1",
        },
      });
      const html = await res.text();
      return { url, finalUrl: res.url, status: res.status, html, usedBrowser: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

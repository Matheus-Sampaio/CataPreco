import { describe, expect, it } from "vitest";
import { CascadeFetchPort } from "../src/runtime/fetch-cascade";
import { dispatchEvent } from "../src/runtime/notifier";
import type { FetchResponse } from "@catapreco/scraper";

function fakePort(status: number, html: string, usedBrowser: boolean) {
  const calls: string[] = [];
  return {
    calls,
    port: {
      async get(url: string): Promise<FetchResponse> {
        calls.push(url);
        return { url, finalUrl: url, status, html, usedBrowser };
      },
    },
  };
}

describe("CascadeFetchPort", () => {
  it("uses native fetch for plain sites", async () => {
    const native = fakePort(200, "<html><h1>ok</h1></html>", false);
    const browser = fakePort(200, "html", true);
    const port = new CascadeFetchPort(native.port, browser.port);
    await port.get("https://loja-qualquer.com.br/p/1");
    expect(native.calls).toHaveLength(1);
    expect(browser.calls).toHaveLength(0);
  });

  it("goes straight to browser on needsBrowser adapters", async () => {
    const native = fakePort(200, "html", false);
    const browser = fakePort(200, "html", true);
    const port = new CascadeFetchPort(native.port, browser.port);
    await port.get("https://www.amazon.com.br/dp/X");
    expect(native.calls).toHaveLength(0);
    expect(browser.calls).toHaveLength(1);
  });

  it("escalates on bot wall", async () => {
    const native = fakePort(200, '<html><div class="g-recaptcha"></div></html>', false);
    const browser = fakePort(200, "<h1>real page</h1>", true);
    const port = new CascadeFetchPort(native.port, browser.port);
    const res = await port.get("https://loja.com.br/p/2");
    expect(browser.calls).toHaveLength(1);
    expect(res.usedBrowser).toBe(true);
  });

  it("escalates on HTTP 403", async () => {
    const native = fakePort(403, "Forbidden", false);
    const browser = fakePort(200, "ok", true);
    const port = new CascadeFetchPort(native.port, browser.port);
    await port.get("https://loja.com.br/p/3");
    expect(browser.calls).toHaveLength(1);
  });

  it("escalates on transient 5xx (curl-shaped identity gets refused)", async () => {
    const native = fakePort(503, "Service Unavailable", false);
    const browser = fakePort(200, "real page", true);
    const port = new CascadeFetchPort(native.port, browser.port);
    const res = await port.get("https://loja.com.br/p/4");
    expect(browser.calls).toHaveLength(1);
    expect(res.status).toBe(200);
  });
});

describe("dispatchEvent", () => {
  it("sends only to enabled channels subscribed to the event", async () => {
    const sent: { url: string; body: unknown }[] = [];
    const fakeSend = (async (url: string, init?: { body?: string }) => {
      sent.push({ url: String(url), body: init?.body });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    await dispatchEvent(
      { kind: "price_drop", prevCents: 10000, nextCents: 8000 },
      { title: "Produto X", url: "https://loja.com/p" },
      [
        { type: "telegram", enabled: true, config: { botToken: "T", chatId: "1" }, events: ["price_drop"] },
        { type: "discord", enabled: false, config: { webhookUrl: "https://discord.com/api/webhooks/x" }, events: ["price_drop"] },
        { type: "ntfy", enabled: true, config: { server: "https://ntfy.sh", topic: "t" }, events: ["target_hit"] },
      ],
      fakeSend,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain("api.telegram.org");
  });
});

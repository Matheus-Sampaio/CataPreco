import { describe, expect, it } from "vitest";
import { buildMessage, buildRequest } from "../src/notify";

const msg = { title: "Queda de preço: RTX 3050", body: "De R$ 2.000 por R$ 1.700", url: "https://kabum.com.br/p/123", priority: 0 };

describe("notify", () => {
  it("builds messages per event kind", () => {
    const m = buildMessage({ kind: "target_hit", nextCents: 9000 }, { title: "SSD 1TB", url: "https://x" });
    expect(m.title).toContain("Preço-alvo");
    expect(m.body).toContain("90,00");
  });

  it("telegram payload", () => {
    const r = buildRequest({ type: "telegram", botToken: "TKN", chatId: "42" }, msg);
    expect(r.url).toBe("https://api.telegram.org/botTKN/sendMessage");
    const body = JSON.parse(r.body);
    expect(body.chat_id).toBe("42");
    expect(body.text).toContain("RTX 3050");
  });

  it("discord payload", () => {
    const r = buildRequest({ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/2" }, msg);
    expect(r.url).toContain("discord.com");
    expect(JSON.parse(r.body).embeds[0].title).toContain("RTX 3050");
  });

  it("pushover payload", () => {
    const r = buildRequest({ type: "pushover", token: "t", user: "u" }, msg);
    expect(r.url).toContain("pushover.net");
    const body = JSON.parse(r.body);
    expect(body.token).toBe("t");
    expect(body.user).toBe("u");
  });

  it("ntfy payload with headers", () => {
    const r = buildRequest({ type: "ntfy", server: "https://ntfy.sh", topic: "meu-topico" }, msg);
    expect(r.url).toBe("https://ntfy.sh/meu-topico");
    expect(r.headers.Title).toContain("RTX 3050");
    expect(r.headers.Click).toBe(msg.url);
  });

  it("gotify payload", () => {
    const r = buildRequest({ type: "gotify", server: "http://192.168.0.50:8686", appToken: "AT" }, msg);
    expect(r.url).toBe("http://192.168.0.50:8686/message?token=AT");
    expect(JSON.parse(r.body).title).toContain("RTX 3050");
  });
});

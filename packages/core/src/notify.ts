/**
 * Notification message builders (pure) + channel payload formatters.
 * Transport lives in apps/worker behind a FetchPort, so these are
 * unit-testable without network.
 */

import { formatBRL, type Cents } from "./price";
import type { AlertEvent } from "./alerts";

export interface ProductRef {
  title: string;
  url: string;
  marketplace?: string;
}

export interface OutboundMessage {
  title: string;
  body: string;
  url?: string;
  priority?: number;
}

export function buildMessage(event: AlertEvent, product: ProductRef): OutboundMessage {
  const price = formatBRL(event.nextCents);
  switch (event.kind) {
    case "price_drop": {
      const from = event.prevCents != null ? formatBRL(event.prevCents) : "?";
      return {
        title: `Queda de preço: ${product.title}`,
        body: `De ${from} por ${price}${product.marketplace ? ` em ${product.marketplace}` : ""}`,
        url: product.url,
        priority: 0,
      };
    }
    case "target_hit":
      return {
        title: `Preço-alvo atingido: ${product.title}`,
        body: `Agora por ${price} — abaixo do seu alvo!`,
        url: product.url,
        priority: 1,
      };
    case "back_in_stock":
      return {
        title: `De volta ao estoque: ${product.title}`,
        body: `Disponível por ${price}`,
        url: product.url,
        priority: 0,
      };
    case "alternative_cheaper":
      return {
        title: `Alternativa compatível mais barata`,
        body: `${product.title}\nEncontrada por ${price}${event.prevCents != null ? ` (vs ${formatBRL(event.prevCents)} do rastreado)` : ""}`,
        url: product.url,
        priority: 1,
      };
  }
}

// ---------- Channel payload builders (pure) ----------

export function telegramPayload(botToken: string, chatId: string, msg: OutboundMessage) {
  return {
    url: `https://api.telegram.org/bot${botToken}/sendMessage`,
    body: {
      chat_id: chatId,
      text: `*${msg.title}*\n${msg.body}${msg.url ? `\n${msg.url}` : ""}`,
      parse_mode: "Markdown",
    },
  };
}

export function discordPayload(webhookUrl: string, msg: OutboundMessage) {
  return {
    url: webhookUrl,
    body: {
      embeds: [
        {
          title: msg.title,
          description: msg.body,
          url: msg.url,
          color: 0x22c55e,
        },
      ],
    },
  };
}

export function pushoverPayload(token: string, user: string, msg: OutboundMessage) {
  return {
    url: "https://api.pushover.net/1/messages.json",
    body: {
      token,
      user,
      title: msg.title,
      message: msg.body,
      url: msg.url,
      priority: msg.priority ?? 0,
    },
  };
}

export function ntfyPayload(server: string, topic: string, msg: OutboundMessage, token?: string) {
  return {
    url: `${server.replace(/\/$/, "")}/${encodeURIComponent(topic)}`,
    headers: {
      Title: msg.title,
      Priority: msg.priority && msg.priority > 0 ? "4" : "3",
      ...(msg.url ? { Click: msg.url } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: msg.body,
  };
}

export function gotifyPayload(server: string, appToken: string, msg: OutboundMessage) {
  return {
    url: `${server.replace(/\/$/, "")}/message?token=${encodeURIComponent(appToken)}`,
    body: {
      title: msg.title,
      message: msg.url ? `${msg.body}\n${msg.url}` : msg.body,
      priority: msg.priority === 1 ? 5 : 2,
    },
  };
}

export type ChannelType = "telegram" | "discord" | "pushover" | "ntfy" | "gotify";

export interface ChannelConfig {
  type: ChannelType;
  // telegram
  botToken?: string;
  chatId?: string;
  // discord
  webhookUrl?: string;
  // pushover
  token?: string;
  user?: string;
  // ntfy / gotify
  server?: string;
  topic?: string;
  appToken?: string;
}

export interface BuiltRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

/** Builds the exact HTTP request for a channel — fully testable offline. */
export function buildRequest(channel: ChannelConfig, msg: OutboundMessage): BuiltRequest {
  switch (channel.type) {
    case "telegram": {
      const p = telegramPayload(channel.botToken ?? "", channel.chatId ?? "", msg);
      return { url: p.url, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.body) };
    }
    case "discord": {
      const p = discordPayload(channel.webhookUrl ?? "", msg);
      return { url: p.url, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.body) };
    }
    case "pushover": {
      const p = pushoverPayload(channel.token ?? "", channel.user ?? "", msg);
      return { url: p.url, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.body) };
    }
    case "ntfy": {
      const p = ntfyPayload(channel.server ?? "https://ntfy.sh", channel.topic ?? "", msg, channel.token);
      return { url: p.url, method: "POST", headers: { "content-type": "text/plain", ...p.headers }, body: String(p.body) };
    }
    case "gotify": {
      const p = gotifyPayload(channel.server ?? "", channel.appToken ?? "", msg);
      return { url: p.url, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.body) };
    }
  }
}

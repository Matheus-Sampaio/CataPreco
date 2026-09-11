import {
  buildMessage,
  buildRequest,
  type AlertEvent,
  type ChannelConfig,
  type ProductRef,
} from "@catapreco/core";

/**
 * Dispatches notification events to a user's enabled channels.
 * Network calls stay thin; payload building is pure (core/notify.ts, unit-tested).
 */
export async function dispatchEvent(
  event: AlertEvent,
  product: ProductRef,
  channels: { type: string; enabled: boolean; config: unknown; events: string[] }[],
  send: typeof fetch = fetch,
  log: (msg: string) => void = () => {},
): Promise<void> {
  const msg = buildMessage(event, product);
  for (const ch of channels) {
    if (!ch.enabled) continue;
    if (!ch.events.includes(event.kind)) continue;
    try {
      const req = buildRequest({ ...(ch.config as object), type: ch.type } as ChannelConfig, msg);
      const res = await send(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(15_000),
      });
      log(`notify ${ch.type}: HTTP ${res.status}`);
    } catch (err) {
      log(`notify ${ch.type} failed: ${(err as Error).message}`);
    }
  }
}

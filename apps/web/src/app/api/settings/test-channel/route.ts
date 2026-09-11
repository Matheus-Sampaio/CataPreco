import { NextResponse } from "next/server";
import { buildRequest, type ChannelConfig } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

/** Sends a real test notification through the given channel config. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { type, config } = (await req.json().catch(() => ({}))) as {
    type?: string;
    config?: Record<string, string>;
  };
  if (!type || !config) return NextResponse.json({ error: "tipo e config obrigatórios" }, { status: 400 });

  try {
    const reqd = buildRequest(
      { type: type as ChannelConfig["type"], ...config } as ChannelConfig,
      {
        title: "CataPreço: notificação de teste",
        body: "Se você está vendo isso, o canal está configurado corretamente.",
        url: "http://192.168.0.160:3000",
        priority: 0,
      },
    );
    const res = await fetch(reqd.url, { method: reqd.method, headers: reqd.headers, body: reqd.body, signal: AbortSignal.timeout(15_000) });
    if (!res.ok && res.status !== 200) {
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}

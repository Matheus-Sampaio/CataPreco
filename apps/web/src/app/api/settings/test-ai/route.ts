import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/** Tests the AI provider (OpenAI-compatible or Anthropic). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { provider, baseUrl, apiKey, model } = (await req.json().catch(() => ({}))) as {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  if (!provider || !model) return NextResponse.json({ error: "provider e model obrigatórios" }, { status: 400 });

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] }),
        signal: AbortSignal.timeout(60_000),
      });
      return NextResponse.json({ ok: res.ok, status: res.status });
    }
    const base = (baseUrl ?? "http://192.168.0.110:11435/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Responda apenas: ok" }], max_tokens: 16, temperature: 0 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return NextResponse.json({ ok: true, sample: data.choices?.[0]?.message?.content ?? "" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}

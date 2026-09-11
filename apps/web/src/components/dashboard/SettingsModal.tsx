"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Modal, Select } from "@/components/ui";

interface Channel {
  type: string;
  enabled: boolean;
  config: Record<string, string>;
  events: string[];
}

const CHANNELS: { type: string; label: string; fields: { key: string; label: string; placeholder: string }[] }[] = [
  { type: "telegram", label: "Telegram", fields: [
    { key: "botToken", label: "Bot token", placeholder: "123456:ABC…" },
    { key: "chatId", label: "Chat ID", placeholder: "123456789" },
  ]},
  { type: "discord", label: "Discord", fields: [
    { key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…" },
  ]},
  { type: "pushover", label: "Pushover", fields: [
    { key: "token", label: "App token", placeholder: "azGDO…" },
    { key: "user", label: "User key", placeholder: "uQiRz…" },
  ]},
  { type: "ntfy", label: "ntfy.sh", fields: [
    { key: "server", label: "Servidor", placeholder: "https://ntfy.sh" },
    { key: "topic", label: "Tópico", placeholder: "meu-topico-secreto" },
  ]},
  { type: "gotify", label: "Gotify", fields: [
    { key: "server", label: "Servidor", placeholder: "http://192.168.0.x:8080" },
    { key: "appToken", label: "App token", placeholder: "Ax…" },
  ]},
];

export function SettingsModal({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const [tab, setTab] = useState<"ai" | "notify" | "proxy" | "geral">("ai");
  const [ai, setAi] = useState({ provider: "ollama", baseUrl: "http://192.168.0.110:11435/v1", apiKey: "", model: "qwen3:8b", enabled: true });
  const [channels, setChannels] = useState<Record<string, Channel>>({});
  const [proxy, setProxy] = useState({ server: "", useFor: "none" });
  const [icms, setIcms] = useState("20");
  const [name, setName] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.aiConfig) setAi({ ...ai, ...data.aiConfig, apiKey: data.aiConfig.apiKey ?? "" });
        const map: Record<string, Channel> = {};
        for (const c of data.channels ?? []) map[c.type] = { ...c, config: c.config as Record<string, string>, events: c.events as string[] };
        setChannels(map);
        if (data.proxy) setProxy({ server: data.proxy.server ?? "", useFor: data.proxy.useFor });
        if (data.userName) setName(data.userName);
        setIcms(String(Math.round((data.icmsRate ?? 0.2) * 100)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(partial: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new Error("falha ao salvar");
  }

  async function testAi() {
    try {
      const res = await fetch("/api/settings/test-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ai),
      });
      const data = await res.json();
      if (res.ok && data.ok) toast.success("IA respondeu corretamente");
      else toast.error(`IA falhou (${data.status ?? data.error})`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function testChannel(type: string) {
    const ch = channels[type];
    if (!ch) return;
    try {
      const res = await fetch("/api/settings/test-channel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, config: ch.config }),
      });
      const data = await res.json();
      if (res.ok && data.ok) toast.success("Notificação de teste enviada");
      else toast.error(`Falhou (${data.status ?? data.error})`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal title="Configurações" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {([
          ["ai", "IA"],
          ["notify", "Notificações"],
          ["proxy", "Proxy"],
          ["geral", "Geral"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 ${tab === key ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
          >
            {label}
          </button>
        ))}
        {isAdmin && (
          <a href="/admin" className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5">
            Admin →
          </a>
        )}
      </div>

      {loading ? (
        <p className="text-sm muted">Carregando…</p>
      ) : (
        <>
          {tab === "ai" && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await save({ ai });
                toast.success("Configuração de IA salva");
              }}
            >
              <label className="block text-sm">
                Provedor
      <Select
          value={ai.provider}
          onChange={(e) => {
            const provider = e.target.value;
            // auto-preencher BASE URL ao trocar de provedor
            const defaults: Record<string, string> = {
              ollama: "http://192.168.0.110:11435/v1",
              openai: "https://api.openai.com/v1",
              anthropic: "",
              nvidia: "https://integrate.api.nvidia.com/v1",
            };
            setAi({ ...ai, provider, baseUrl: defaults[provider] ?? ai.baseUrl });
          }}
        >
          <option value="ollama">Ollama (local)</option>
          <option value="openai">OpenAI / compatível</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="nvidia">NVIDIA NIM (grátis com key)</option>
        </Select>
              </label>
              {ai.provider !== "anthropic" && (
                <label className="block text-sm">
                  URL base
                  <Input value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="http://192.168.0.110:11435/v1" />
                </label>
              )}
              <label className="block text-sm">
                API key {ai.provider === "ollama" && <span className="muted">(opcional p/ Ollama)</span>}
                <Input type="password" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} />
              </label>
              <label className="block text-sm">
                Modelo
                <Input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="qwen3:8b" />
                {ai.provider === "nvidia" && (
                  <p className="mt-1 text-xs muted">
                    Modelos disponíveis variam por conta (verifique em build.nvidia.com). Exemplos:
                    <code> deepseek-ai/deepseek-v4-pro-0813</code>, <code> nvidia/nemotron-3-super-120b-a12b</code>,{" "}
                    <code> moonshotai/kimi-k3</code>
                  </p>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ai.enabled} onChange={(e) => setAi({ ...ai, enabled: e.target.checked })} />
                Usar IA quando extratores falharem ou divergirem
              </label>
              <div className="flex gap-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="ghost" onClick={testAi}>Testar IA</Button>
              </div>
            </form>
          )}

          {tab === "notify" && (
            <div className="space-y-5">
              {CHANNELS.map((c) => {
                const ch = channels[c.type] ?? { type: c.type, enabled: false, config: {}, events: ["price_drop", "target_hit", "back_in_stock"] };
                return (
                  <form
                    key={c.type}
                    className="rounded-lg border border-[var(--border)] p-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await save({ channel: ch });
                      toast.success(`${c.label} salvo`);
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <strong className="text-sm">{c.label}</strong>
                      <label className="flex items-center gap-2 text-xs muted">
                        ativo
                        <input
                          type="checkbox"
                          checked={ch.enabled}
                          onChange={(e) => setChannels({ ...channels, [c.type]: { ...ch, enabled: e.target.checked } })}
                        />
                      </label>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {c.fields.map((f) => (
                        <Input
                          key={f.key}
                          placeholder={f.placeholder}
                          value={ch.config[f.key] ?? ""}
                          onChange={(e) =>
                            setChannels({ ...channels, [c.type]: { ...ch, config: { ...ch.config, [f.key]: e.target.value } } })
                          }
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs muted">
                      {(["price_drop", "target_hit", "back_in_stock"] as const).map((ev) => (
                        <label key={ev} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={ch.events.includes(ev)}
                            onChange={(e) =>
                              setChannels({
                                ...channels,
                                [c.type]: {
                                  ...ch,
                                  events: e.target.checked ? [...ch.events, ev] : ch.events.filter((x) => x !== ev),
                                },
                              })
                            }
                          />
                          {ev === "price_drop" ? "queda" : ev === "target_hit" ? "alvo" : "stock"}
                        </label>
                      ))}
                      <span className="ml-auto flex gap-2">
                        <Button type="submit" className="px-2 py-1 text-xs">Salvar</Button>
                        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => testChannel(c.type)}>Testar</Button>
                      </span>
                    </div>
                  </form>
                );
              })}
            </div>
          )}

          {tab === "proxy" && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                await save({ proxy });
                toast.success("Proxy salvo");
              }}
            >
              <label className="block text-sm">
                Servidor proxy (ex: http://user:pass@seu-vps:3128)
                <Input value={proxy.server} onChange={(e) => setProxy({ ...proxy, server: e.target.value })} />
              </label>
              <label className="block text-sm">
                Usar para
                <Select value={proxy.useFor} onChange={(e) => setProxy({ ...proxy, useFor: e.target.value })}>
                  <option value="none">nenhum (direto)</option>
                  <option value="international">somente lojas internacionais</option>
                  <option value="all">tudo</option>
                </Select>
              </label>
              <p className="text-xs muted">Sites brasileiros tendem a funcionar melhor com IP residencial direto.</p>
              <Button type="submit">Salvar</Button>
            </form>
          )}

          {tab === "geral" && (
            <div className="space-y-6">
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await save({ icmsRate: Number(icms) / 100, name: name || undefined });
                  toast.success("Salvo");
                }}
              >
                <label className="block text-sm">
                  Nome de exibição
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="block text-sm">
                  ICMS do seu estado (%) — usado no cálculo do Remessa Conforme
                  <Input value={icms} onChange={(e) => setIcms(e.target.value)} inputMode="numeric" />
                </label>
                <Button type="submit">Salvar</Button>
              </form>

              <form
                className="space-y-3 border-t border-[var(--border)] pt-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
                  });
                  const data = await res.json();
                  if (!res.ok) return toast.error(data.error ?? "falha");
                  toast.success("Senha alterada");
                  setCurPw("");
                  setNewPw("");
                }}
              >
                <p className="text-sm font-medium">Trocar senha</p>
                <Input type="password" placeholder="senha atual" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
                <Input type="password" placeholder="nova senha (6+)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <Button type="submit" variant="ghost">Alterar senha</Button>
              </form>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

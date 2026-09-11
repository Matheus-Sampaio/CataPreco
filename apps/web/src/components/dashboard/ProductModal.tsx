"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@catapreco/core";
import { toast } from "sonner";
import { Badge, Button, Input, Modal, Price, SkeletonRows, StockBadge } from "@/components/ui";
import type { UiListing } from "@/components/types";
import type { UiProduct } from "@/components/types";
import { parsePrice } from "@catapreco/core";
import { PriceReviewModal } from "./PriceReviewModal";

interface HistoryData {
  minSeries: { ts: string; priceCents: number }[];
  stats: { min: number; max: number; avg: number; readings: number } | null;
}

export function ProductModal({ product, onClose }: { product: UiProduct; onClose: () => void }) {
  const [tab, setTab] = useState<"offers" | "history">("offers");
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (tab === "history") {
      fetch(`/api/products/${product.id}/history`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setHistory)
        .catch(() => setHistory(null));
    }
  }, [tab, product.id]);

  const searching = product.status === "searching" || product.status === "extracting";
  const offers = [...product.listings].sort((a, b) => (a.priceCents ?? 9e12) - (b.priceCents ?? 9e12));

  return (
    <>
    <Modal title={product.title ?? "Produto"} onClose={onClose} wide>
      {product.status === "pending_review" && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm">
          <span>Não conseguimos confirmar o preço deste produto automaticamente.</span>
          <button
            onClick={() => setReviewOpen(true)}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white"
          >
            Confirmar preço
          </button>
        </div>
      )}
      <div className="mb-4 flex gap-2 text-sm">
        {(["offers", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 ${tab === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
          >
            {t === "offers" ? "Ofertas" : "Histórico"}
          </button>
        ))}
      </div>

      {tab === "offers" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs muted">{product.listings.length} oferta(s) encontrada(s)</span>
            <button
              onClick={async () => {
                const res = await fetch(`/api/products/${product.id}/research`, { method: "POST" });
                if (res.ok) toast.success("Buscando novamente nas lojas…");
                else toast.error((await res.json()).error ?? "falha");
              }}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--border)]"
            >
              <RefreshCw size={13} /> re-buscar
            </button>
          </div>
          {searching && <SkeletonRows n={3} message="Buscando este produto em outras lojas…" />}
          {!searching && offers.length === 0 && (
            <p className="text-sm muted">Nenhuma oferta encontrada ainda.</p>
          )}

          <FlexSection product={product} />
          {offers.some((l) => !l.isAlternative) && (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Este produto</p>
          )}
          {offers.filter((l) => !l.isAlternative).map((l) => (
            <OfferRow key={l.id} l={l} />
          ))}

          {offers.some((l) => l.isAlternative) && (
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] pt-2">
              Alternativas compatíveis {product.flexBrands ? "" : "(flex desligado)"}
            </p>
          )}
          {offers.filter((l) => l.isAlternative).map((l) => (
            <OfferRow key={l.id} l={l} alternative />
          ))}
        </div>
      )}

      {tab === "offers" && (
        <AlertConfig key={product.id} product={product} />
      )}

      {tab === "history" && (
        <div>
          {!history ? (
            <SkeletonRows n={4} message="Carregando histórico…" />
          ) : history.minSeries.length < 2 ? (
            <p className="text-sm muted">Ainda não há histórico suficiente — aguarde as próximas checagens.</p>
          ) : (
            <>
              {history.stats && (
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="card p-2">
                    <p className="text-xs muted">mínimo</p>
                    <p className="font-semibold">{formatBRL(history.stats.min)}</p>
                  </div>
                  <div className="card p-2">
                    <p className="text-xs muted">médio</p>
                    <p className="font-semibold">{formatBRL(history.stats.avg)}</p>
                  </div>
                  <div className="card p-2">
                    <p className="text-xs muted">máximo</p>
                    <p className="font-semibold">{formatBRL(history.stats.max)}</p>
                  </div>
                </div>
              )}
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <LineChart data={history.minSeries}>
                    <XAxis
                      dataKey="ts"
                      tickFormatter={(t: string) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      fontSize={12}
                      stroke="var(--muted)"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatBRL(v)}
                      fontSize={11}
                      width={90}
                      stroke="var(--muted)"
                    />
                    <Tooltip
                      formatter={(v: number) => [formatBRL(v), "menor preço"]}
                      labelFormatter={(t: string) => new Date(t).toLocaleString("pt-BR")}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    />
                    <Line type="stepAfter" dataKey="priceCents" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
    {reviewOpen && (
      <PriceReviewModal
        productId={product.id}
        url={product.url}
        candidates={product.pendingCandidates ?? []}
        onDone={() => {
          setReviewOpen(false);
          onClose();
        }}
        onClose={() => setReviewOpen(false)}
      />
    )}
    </>
  );
}
/** Brand-flex section: IA extrai specs; usuário edita e pode ativar busca flex. */
function FlexSection({ product }: { product: UiProduct }) {
  const [enabled, setEnabled] = useState(product.flexBrands);
  const [specs, setSpecs] = useState<string[]>(product.specTokens ?? []);
  const [newSpec, setNewSpec] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: { flexBrands?: boolean; specTokens?: string[] }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("falha ao salvar");
      toast.success(
        next.flexBrands ? "Alternativas ativadas — buscando nas próximas checagens" : "Atualizado",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            void save({ flexBrands: e.target.checked, specTokens: specs });
          }}
        />
        <span>
          Aceitar <strong>mesma spec em outra marca</strong>{" "}
          <span className="muted text-xs">(ex.: SSD 1TB Sandisk/Kingston/Crucial)</span>
        </span>
      </label>

      {enabled && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {specs.length === 0 && (
              <span className="text-xs muted">
                Nenhuma spec extraída ainda — a IA preenche após a próxima checagem
              </span>
            )}
            {specs.map((s) => (
              <span key={s} className="flex items-center gap-1 rounded-full bg-[var(--border)] px-2 py-0.5 text-xs">
                {s}
                <button
                  onClick={() => {
                    const next = specs.filter((x) => x !== s);
                    setSpecs(next);
                    void save({ specTokens: next });
                  }}
                  disabled={saving}
                  className="text-[var(--muted)] hover:text-[var(--danger)]"
                  aria-label={`Remover ${s}`}
                >
                  ×
                </button>
              </span>
            ))}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const t = newSpec.trim().toLowerCase();
                if (t.length >= 2 && !specs.includes(t)) {
                  const next = [...specs, t];
                  setSpecs(next);
                  setNewSpec("");
                  void save({ specTokens: next });
                }
              }}
            >
              <input
                value={newSpec}
                onChange={(e) => setNewSpec(e.target.value)}
                placeholder="+ spec"
                className="w-24 rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-xs"
              />
            </form>
          </div>
          <p className="text-xs muted">
            Alternativas aparecem abaixo com marca distinta e alerta separado.
          </p>
        </>
      )}
    </div>
  );
}

function AlertConfig({ product }: { product: UiProduct & { dropAbsCents?: number | null; dropPct?: number | null } }) {
  const [target, setTarget] = useState(product.targetCents != null ? (product.targetCents / 100).toString().replace(".", ",") : "");
  const [dropPct, setDropPct] = useState(product.dropPct != null ? String(product.dropPct) : "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetCents: target ? parsePrice(target) : null,
          dropPct: dropPct ? Number(dropPct) : null,
        }),
      });
      if (!res.ok) throw new Error("falha ao salvar");
      toast.success("Alertas atualizados");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 flex items-end gap-2 border-t border-[var(--border)] pt-3">
      <label className="text-xs muted">
        preço-alvo (R$)
        <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="ex.: 1500,00" inputMode="decimal" />
      </label>
      <label className="text-xs muted">
        avisar em queda de (%)
        <Input value={dropPct} onChange={(e) => setDropPct(e.target.value)} placeholder="ex.: 5" inputMode="numeric" />
      </label>
      <Button type="submit" disabled={saving} variant="ghost">Salvar</Button>
    </form>
  );
}

/** One offer row (extracted so we can render groups separated by alternative status). */
function OfferRow({ l, alternative = false }: { l: UiListing; alternative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
          {l.marketplace}
          {l.isPrimary && <Badge>origem</Badge>}
          {alternative && (
            <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-medium">
              outra marca{l.brand ? `: ${l.brand}` : ""}
            </span>
          )}
          {l.isAlternative && <Badge tone="warn">spec</Badge>}
        </p>
        <p className="truncate text-xs muted">{l.title ?? l.url}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StockBadge stock={l.stock} />
        <Price cents={l.priceBrlCents ?? l.priceCents} currency={l.currency} className="font-semibold" />
        <a href={l.url} target="_blank" rel="noreferrer" className="rounded-md p-1 hover:bg-[var(--border)]" title="Abrir loja">
          <ExternalLink size={15} />
        </a>
        {!l.isPrimary && (
          <button
            className="rounded-md p-1 text-[var(--danger)] hover:bg-[var(--border)]"
            title="Remover oferta (falso match?)"
            onClick={async (e) => {
              e.preventDefault();
              const res = await fetch(`/api/listings/${l.id}`, { method: "DELETE" });
              if (res.ok) toast.success("Oferta removida");
              else toast.error("falha ao remover");
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

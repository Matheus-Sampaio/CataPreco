"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CHECK_INTERVALS, isCrossBorderDomain, parsePrice } from "@catapreco/core";
import { Button, Input, Select } from "@/components/ui";

export function TrackForm({ onCreated }: { onCreated: (productId: string) => void }) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [intervalMin, setIntervalMin] = useState(360);
  const [remessa, setRemessa] = useState(false);
  const [loading, setLoading] = useState(false);

  const crossBorder = (() => {
    try { return isCrossBorderDomain(new URL(url).hostname); } catch { return false; }
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          targetCents: target ? parsePrice(target) : null,
          intervalMin,
          remessaConforme: crossBorder ? true : remessa,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "falha ao adicionar");
      toast.success("Produto adicionado — extraindo dados…");
      setUrl("");
      setTarget("");
      onCreated(data.product.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="mb-1 text-lg font-semibold">Track a new product</h2>
      <p className="mb-4 text-sm muted">Cole o link do produto que você quer monitorar.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
        <Input
          placeholder="https://www.mercadolivre.com.br/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          inputMode="url"
        />
        <Input
          placeholder="Preço-alvo (opcional)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="decimal"
        />
        <Select value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} aria-label="Verificar a cada">
          {CHECK_INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </Select>
        <Button type="submit" disabled={loading || !url}>
          {loading ? "Adicionando…" : "Rastrear"}
        </Button>
      </div>
      {crossBorder && (
        <p className="mt-2 text-xs muted">
          Loja internacional detectada — o preço exibido incluirá estimativa de impostos (Remessa Conforme).
        </p>
      )}
      {!crossBorder && (
        <label className="mt-2 flex items-center gap-2 text-xs muted">
          <input type="checkbox" checked={remessa} onChange={(e) => setRemessa(e.target.checked)} />
          aplicar Remessa Conforme (compras internacionais)
        </label>
      )}
    </form>
  );
}

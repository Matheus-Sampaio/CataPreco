"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { parsePrice, type PriceCandidate } from "@catapreco/core";
import { Badge, Button, Input, Price } from "@/components/ui";

const SOURCE_LABELS: Record<string, string> = {
  jsonld: "dados estruturados (JSON-LD)",
  adapter: "scraper do site",
  generic: "CSS genérico",
  ai: "análise de IA",
  user: "manual",
};

/**
 * Price Selection Modal — shown when extractors disagree.
 * Lists candidates with sources; the recommended one is highlighted;
 * user may confirm, pick another, or type a custom value.
 */
export function PriceReviewModal({
  productId,
  url,
  candidates,
  onDone,
  onClose,
}: {
  productId: string;
  url: string;
  candidates: PriceCandidate[];
  onDone: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const ranked = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const recommended = ranked[0] ?? null;

  async function choose(valueCents: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valueCents }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "falha");
      toast.success("Preço confirmado — buscando em outras lojas…");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Qual é o preço correto?</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-xl leading-none hover:bg-[var(--border)]" aria-label="Fechar">×</button>
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-sm text-[var(--accent)] hover:bg-[var(--border)]/50"
        >
          <ExternalLink size={15} className="shrink-0" />
          <span className="truncate">{url}</span>
        </a>
        {candidates.length > 0 ? (
          <p className="mb-4 text-sm muted">
            Os extratores encontraram valores diferentes. Confirme o preço atual do produto
            (desconsidere parcelas e bundles).
          </p>
        ) : (
          <p className="mb-4 rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm">
            Nenhum preço foi detectado automaticamente. Abra o produto e confira o valor à vista,
            então digite abaixo.
          </p>
        )}
        <div className="space-y-2">
          {ranked.map((c, i) => (
            <button
              key={`${c.source}-${c.valueCents}-${i}`}
              disabled={saving}
              onClick={() => choose(c.valueCents)}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                c === recommended
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:bg-[var(--border)]"
              }`}
            >
              <div>
                <Price cents={c.valueCents} className="text-lg font-bold" />
                <p className="text-xs muted">
                  {c.label ? `${c.label} · ` : ""}{SOURCE_LABELS[c.source] ?? c.source}
                </p>
              </div>
              {c === recommended && <Badge tone="good">recomendado</Badge>}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parsePrice(custom);
            if (v) void choose(v);
            else toast.error("valor inválido");
          }}
        >
          <Input placeholder="Outro valor (ex: 1899,90)" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <Button type="submit" disabled={saving || !custom}>Usar</Button>
        </form>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs muted hover:underline">
          decidir depois (o card fica marcado como "confirme o preço")
        </button>
      </div>
    </div>
  );
}

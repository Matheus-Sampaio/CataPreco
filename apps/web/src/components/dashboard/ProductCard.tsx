"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { calculateRemessaConforme, calculateRemessaConformeBrl, countdownMs, discountPct, formatCountdown, intervalProgress } from "@catapreco/core";
import { Badge, Price, StockBadge } from "@/components/ui";
import type { UiProduct } from "@/components/types";

export function ProductCard({
  product,
  fxUsdBrl,
  icmsRate,
  onOpen,
  onRefresh,
  onRemove,
}: {
  product: UiProduct;
  fxUsdBrl: number | null;
  icmsRate: number;
  onOpen: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const next = new Date(product.nextCheckAt).getTime();
  const remaining = countdownMs(new Date(next), new Date(now));
  const progress = intervalProgress(product.intervalMin, new Date(next), new Date(now));

  const primary = product.listings.find((l) => l.isPrimary) ?? product.listings[0];
  const discount = primary?.listPriceCents && primary.priceCents
    ? discountPct(primary.listPriceCents, primary.priceCents)
    : 0;

  const busy = product.status === "extracting" || product.status === "searching";

  // Imposto de importação: decisão POR LISTING (detectada na página) com
  // fallback pro checkbox do produto quando a página não informou nada.
  const cheapestNative = product.listings
    .filter((l) => l.priceCents != null)
    .sort((a, b) => a.priceCents! - b.priceCents!)[0];

  let taxed: { totalBrlCents: number } | null = null;
  let taxIncludedPrice = false; // preço exibido já inclui imposto
  if (cheapestNative) {
    const l = cheapestNative;
    if (l.imported === true && l.taxIncluded === true) {
      taxIncludedPrice = true;
    } else if (l.imported === true && fxUsdBrl) {
      taxed = l.currency === "BRL"
        ? calculateRemessaConformeBrl(l.priceCents!, { fxRate: fxUsdBrl, icmsRate })
        : calculateRemessaConforme(l.priceCents!, { fxRate: fxUsdBrl, icmsRate });
    } else if (l.imported == null && product.remessaConforme && l.currency !== "BRL" && fxUsdBrl) {
      // fallback legado: produto marcado como remessa conforme, página não informou
      taxed = calculateRemessaConforme(l.priceCents!, { fxRate: fxUsdBrl, icmsRate });
    }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={onOpen} className="block w-full p-4 text-left">
        <div className="flex gap-3">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-lg bg-[var(--border)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={product.title ?? undefined}>
              {product.title ?? "Extraindo…"}
            </p>
            <p className="truncate text-xs muted">{primary?.marketplace ?? product.domain}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {taxed ? (
                <>
                  <span className="flex flex-col leading-tight">
                    <Price cents={taxed.totalBrlCents} className="text-lg font-bold" />
                    <Price cents={cheapestNative?.priceCents} currency={cheapestNative?.currency ?? "USD"} className="text-xs muted" />
                  </span>
                  <Badge tone="warn">c/ impostos</Badge>
                </>
              ) : (
                <>
                  <Price cents={product.minPriceCents} currency={product.currency} className="text-lg font-bold" />
                  {taxIncludedPrice && <Badge tone="good">imposto incluído</Badge>}
                </>
              )}
              {discount > 0 && <Badge tone="good">-{discount}%</Badge>}
              {primary && <StockBadge stock={primary.stock} />}
              {busy && <Badge tone="warn">{product.status === "extracting" ? "extraindo" : "buscando"}</Badge>}
              {product.status === "pending_review" && <Badge tone="warn">confirme o preço</Badge>}
            </div>
          </div>
        </div>
      </button>

      <div className="border-t border-[var(--border)] px-4 py-2">
        <div className="mb-1 flex items-center justify-between text-xs muted">
          <span>próxima checagem em {formatCountdown(remaining)}</span>
          <span className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              className="rounded-md p-1 hover:bg-[var(--border)]"
              title="Verificar agora"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onRemove}
              className="rounded-md p-1 text-[var(--danger)] hover:bg-[var(--border)]"
              title="Remover"
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-1000"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

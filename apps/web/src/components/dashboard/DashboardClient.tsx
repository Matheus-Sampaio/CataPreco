"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatBRL } from "@catapreco/core";
import { TrackForm } from "./TrackForm";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import { PriceReviewModal } from "./PriceReviewModal";
import { RemoveModal } from "./RemoveModal";
import { SettingsModal } from "./SettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { UiProduct, UiStats, UiUser } from "@/components/types";

export function DashboardClient({
  user,
  initialProducts,
  initialStats,
}: {
  user: UiUser;
  initialProducts: UiProduct[];
  initialStats: UiStats;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [stats, setStats] = useState(initialStats);
  const [query, setQuery] = useState("");
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<UiProduct | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fx, setFx] = useState<{ usdBrl: number | null; icmsRate: number }>({ usdBrl: null, icmsRate: 0.2 });

  useEffect(() => {
    Promise.all([fetch("/api/fx"), fetch("/api/settings")])
      .then(async ([fxRes, setRes]) => {
        const fxData = fxRes.ok ? await fxRes.json() : {};
        const setData = setRes.ok ? await setRes.json() : {};
        setFx({ usdBrl: fxData.usdBrl ?? null, icmsRate: setData.icmsRate ?? 0.2 });
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([fetch("/api/products"), fetch("/api/stats")]);
    if (p.ok) setProducts((await p.json()).products);
    if (s.ok) setStats(await s.json());
  }, []);

  // background refresh (status changes made by the worker)
  useEffect(() => {
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  // poll a freshly added product until extraction resolves
  const watchNewProduct = useCallback(async (id: string) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) continue;
      const { product } = (await res.json()) as { product: UiProduct };
      await refresh();
      if (product.status === "pending_review") {
        setReviewing(product);
        return;
      }
      if (product.status === "searching" || product.status === "active") return;
      if (product.status === "error") {
        toast.error("Não consegui extrair dados dessa página (site bloqueado?)");
        return;
      }
    }
  }, [refresh]);

  async function manualRefresh(id: string) {
    await fetch(`/api/products/${id}/refresh`, { method: "POST" });
    toast.message("Checagem agendada");
    setTimeout(refresh, 3000);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.title ?? "").toLowerCase().includes(q) || p.domain.includes(q));
  }, [products, query]);

  const openProductData = openProduct ? products.find((p) => p.id === openProduct) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-bold text-white">R$</span>
          <span className="text-lg font-bold">CataPreço</span>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <ThemeToggle />
        <button onClick={() => setSettingsOpen(true)} className="rounded-lg p-2 hover:bg-[var(--border)]" title="Configurações">
          <Settings size={18} />
        </button>
        <button onClick={logout} className="rounded-lg p-2 hover:bg-[var(--border)]" title={`Sair (${user.name})`}>
          <LogOut size={18} />
        </button>
      </header>

      <TrackForm onCreated={watchNewProduct} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total products" value={String(stats.totalProducts)} />
        <Stat label="At lowest price" value={String(stats.atLowestPrice)} good />
        <Stat label="At target price" value={String(stats.atTargetPrice)} good />
        <Stat label="Total economizado" value={formatBRL(stats.totalSavedCents)} good />
      </div>

      {filtered.length === 0 ? (
        <p className="card mt-4 p-8 text-center text-sm muted">
          {products.length === 0 ? "Nenhum produto ainda — cole um link acima para começar." : "Nenhum produto corresponde à busca."}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              fxUsdBrl={fx.usdBrl}
              icmsRate={fx.icmsRate}
              onOpen={() => {
                // produtos pendentes abrem direto o modal de confirmação de preço
                if (p.status === "pending_review") setReviewing(p);
                else setOpenProduct(p.id);
              }}
              onRefresh={() => manualRefresh(p.id)}
              onRemove={() => setRemoving(p.id)}
            />
          ))}
        </div>
      )}

      {openProductData && <ProductModal product={openProductData} onClose={() => setOpenProduct(null)} />}

      {removing && (
        <RemoveModal
          productId={removing}
          title={products.find((p) => p.id === removing)?.title ?? "produto"}
          onClose={() => setRemoving(null)}
          onRemoved={refresh}
        />
      )}

      {reviewing && (
        <PriceReviewModal
          productId={reviewing.id}
          url={reviewing.url}
          candidates={reviewing.pendingCandidates ?? []}
          onDone={async () => {
            setReviewing(null);
            await refresh();
          }}
          onClose={() => setReviewing(null)}
        />
      )}

      {settingsOpen && <SettingsModal isAdmin={user.isAdmin} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs muted">{label}</p>
      <p className={`text-2xl font-bold ${good ? "text-[var(--accent)]" : ""}`}>{value}</p>
    </div>
  );
}

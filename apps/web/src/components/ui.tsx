"use client";

import { formatBRL } from "@catapreco/core";
import type { ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white",
    ghost: "border border-[var(--border)] hover:bg-[var(--border)] text-[var(--foreground)]",
    danger: "bg-[var(--danger)] text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      {...props}
    />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "bad" | "warn" }) {
  const tones = {
    default: "bg-[var(--border)] text-[var(--foreground)]",
    good: "bg-green-600/15 text-green-600 dark:text-green-400",
    bad: "bg-red-600/15 text-red-600 dark:text-red-400",
    warn: "bg-yellow-600/15 text-yellow-700 dark:text-yellow-400",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function Price({ cents, currency = "BRL", className = "" }: { cents: number | null | undefined; currency?: string; className?: string }) {
  if (cents == null) return <span className={className}>—</span>;
  return <span className={className}>{currency === "BRL" ? formatBRL(cents) : `${currency} ${(cents / 100).toFixed(2)}`}</span>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`card max-h-[90vh] w-full overflow-y-auto p-5 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-xl leading-none hover:bg-[var(--border)]" aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StockBadge({ stock }: { stock: string }) {
  if (stock === "in_stock") return <Badge tone="good">em estoque</Badge>;
  if (stock === "out_of_stock") return <Badge tone="bad">esgotado</Badge>;
  if (stock === "preorder") return <Badge tone="warn">pré-venda</Badge>;
  return <Badge>estoque ?</Badge>;
}

export function SkeletonRows({ n = 3, message }: { n?: number; message: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm muted">{message}</p>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

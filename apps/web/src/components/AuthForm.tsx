"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "falha");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-bold text-white">R$</span>
          <span className="text-lg font-bold">CataPreço</span>
        </div>
        <h1 className="mb-4 text-xl font-semibold">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h1>
        {mode === "register" && (
          <label className="mb-3 block text-sm">
            Nome
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </label>
        )}
        <label className="mb-3 block text-sm">
          Email
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </label>
        <label className="mb-4 block text-sm">
          Senha
          <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>
        {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "…" : mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
        <p className="mt-3 text-center text-xs muted">
          {mode === "login" ? (
            <>Não tem conta? <a className="underline" href="/register">Cadastre-se</a></>
          ) : (
            <>Já tem conta? <a className="underline" href="/login">Entrar</a></>
          )}
        </p>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  _count: { products: number };
}

export function AdminClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [regEnabled, setRegEnabled] = useState(true);
  const [form, setForm] = useState({ email: "", name: "", password: "" });

  async function load() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users);
    setRegEnabled(data.registrationEnabled);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "falha");
    toast.success("Usuário criado");
    setForm({ email: "", name: "", password: "" });
    void load();
  }

  async function toggleAdmin(u: AdminUser) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: u.id, isAdmin: !u.isAdmin }),
    });
    void load();
  }

  async function toggleRegistration() {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationEnabled: !regEnabled }),
    });
    setRegEnabled(!regEnabled);
    toast.success(`Cadastro público ${!regEnabled ? "ativado" : "desativado"}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Administração</h1>
        <a href="/" className="text-sm muted hover:underline">← voltar ao dashboard</a>
      </div>

      <div className="card mb-4 flex items-center justify-between p-4">
        <span className="text-sm">Cadastro público (página /register)</span>
        <Button variant={regEnabled ? "primary" : "ghost"} onClick={toggleRegistration}>
          {regEnabled ? "Ativado" : "Desativado"}
        </Button>
      </div>

      <form onSubmit={createUser} className="card mb-4 grid gap-2 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Input placeholder="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="senha (6+)" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit">Criar conta</Button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs muted">
              <th className="p-3">Usuário</th>
              <th className="p-3">Produtos</th>
              <th className="p-3">Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--border)] last:border-0">
                <td className="p-3">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs muted">{u.email}</p>
                </td>
                <td className="p-3">{u._count.products}</td>
                <td className="p-3">
                  <Button variant={u.isAdmin ? "primary" : "ghost"} onClick={() => toggleAdmin(u)} className="px-2 py-1 text-xs">
                    {u.isAdmin ? "admin" : "usuário"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

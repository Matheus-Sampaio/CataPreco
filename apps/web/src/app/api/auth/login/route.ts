import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { createSession, sessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return NextResponse.json({ error: "email e senha são obrigatórios" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "credenciais inválidas" }, { status: 401 });
  }
  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  res.cookies.set(sessionCookie(token));
  return res;
}

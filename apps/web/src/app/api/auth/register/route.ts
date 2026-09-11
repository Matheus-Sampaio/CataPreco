import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { createSession, hashPassword, sessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, name } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    name?: string;
  };
  if (!email || !password || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "email e senha são obrigatórios" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "senha deve ter ao menos 6 caracteres" }, { status: 400 });
  }

  const count = await prisma.user.count();
  const regSetting = await prisma.appSetting.findUnique({ where: { key: "registrationEnabled" } });
  const registrationEnabled = regSetting ? regSetting.value === "true" : true;
  if (count > 0 && !registrationEnabled) {
    return NextResponse.json({ error: "cadastro público desativado" }, { status: 403 });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "email já cadastrado" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: name?.trim() || email.split("@")[0]!,
      passwordHash: hashPassword(password),
      isAdmin: count === 0, // primeiro usuário vira admin
    },
  });
  const token = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  res.cookies.set(sessionCookie(token));
  return res;
}

import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser, hashPassword } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, isAdmin: true, createdAt: true, _count: { select: { products: true } } },
    orderBy: { createdAt: "asc" },
  });
  const regSetting = await prisma.appSetting.findUnique({ where: { key: "registrationEnabled" } });
  return NextResponse.json({
    users,
    registrationEnabled: regSetting ? regSetting.value === "true" : true,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  const { email, name, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    password?: string;
  };
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "email e senha (6+ chars) obrigatórios" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "email já cadastrado" }, { status: 409 });
  const created = await prisma.user.create({
    data: { email: email.toLowerCase(), name: name || email.split("@")[0]!, passwordHash: hashPassword(password) },
  });
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}

/** Admin actions: toggle admin on user, toggle registration. */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    isAdmin?: boolean;
    registrationEnabled?: boolean;
  };

  if (body.registrationEnabled !== undefined) {
    await prisma.appSetting.upsert({
      where: { key: "registrationEnabled" },
      create: { key: "registrationEnabled", value: String(body.registrationEnabled) },
      update: { value: String(body.registrationEnabled) },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.userId && typeof body.isAdmin === "boolean") {
    if (body.userId === user.id) return NextResponse.json({ error: "não pode alterar a si mesmo" }, { status: 400 });
    await prisma.user.update({ where: { id: body.userId }, data: { isAdmin: body.isAdmin } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "nada para alterar" }, { status: 400 });
}

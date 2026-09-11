import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const [aiConfig, channels, proxy, icmsSetting] = await Promise.all([
    prisma.aiConfig.findUnique({ where: { userId: user.id } }),
    prisma.notificationChannel.findMany({ where: { userId: user.id } }),
    prisma.proxyConfig.findUnique({ where: { userId: user.id } }),
    prisma.appSetting.findUnique({ where: { key: `icmsRate:${user.id}` } }),
  ]);

  return NextResponse.json({
    aiConfig,
    channels,
    proxy,
    userName: user.name,
    icmsRate: icmsSetting ? Number(icmsSetting.value) : 0.2,
  });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    ai?: { provider: string; baseUrl: string; apiKey?: string | null; model: string; enabled: boolean };
    channel?: { type: string; enabled: boolean; config: Record<string, unknown>; events: string[] };
    proxy?: { server?: string | null; useFor: string };
    icmsRate?: number;
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  if (body.ai) {
    await prisma.aiConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body.ai },
      update: body.ai,
    });
  }

  if (body.channel) {
    const config = body.channel.config as never;
    const events = body.channel.events as never;
    await prisma.notificationChannel.upsert({
      where: { userId_type: { userId: user.id, type: body.channel.type } },
      create: { userId: user.id, type: body.channel.type, enabled: body.channel.enabled, config, events },
      update: { enabled: body.channel.enabled, config, events },
    });
  }

  if (body.proxy) {
    await prisma.proxyConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, server: body.proxy.server ?? null, useFor: body.proxy.useFor },
      update: { server: body.proxy.server ?? null, useFor: body.proxy.useFor },
    });
  }

  if (typeof body.icmsRate === "number" && body.icmsRate > 0 && body.icmsRate < 0.6) {
    await prisma.appSetting.upsert({
      where: { key: `icmsRate:${user.id}` },
      create: { key: `icmsRate:${user.id}`, value: String(body.icmsRate) },
      update: { value: String(body.icmsRate) },
    });
  }

  if (body.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
  }

  if (body.newPassword) {
    if (!body.currentPassword || body.newPassword.length < 6) {
      return NextResponse.json({ error: "senha atual e nova (6+ chars) obrigatórias" }, { status: 400 });
    }
    const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!verifyPassword(body.currentPassword, me.passwordHash)) {
      return NextResponse.json({ error: "senha atual incorreta" }, { status: 403 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.newPassword) },
    });
  }

  return NextResponse.json({ ok: true });
}

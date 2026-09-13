import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { isCrossBorderDomain, normalizeProductUrl } from "@catapreco/core";
import { marketplaceName } from "@catapreco/scraper";
import { getSessionUser } from "@/lib/auth";

const VALID_INTERVALS = [60, 360, 720, 1440, 10080];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { userId: user.id, status: { notIn: ["archived_bought", "archived_dismissed"] } },
    include: { listings: { orderBy: { priceCents: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    targetCents?: number | null;
    intervalMin?: number;
    remessaConforme?: boolean;
  };

  if (!body.url) return NextResponse.json({ error: "url obrigatória" }, { status: 400 });

  const url = normalizeProductUrl(body.url);
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  const intervalMin = VALID_INTERVALS.includes(body.intervalMin ?? 0) ? body.intervalMin! : 360;
  const crossBorder = isCrossBorderDomain(host);

  // mesma URL normalizada já rastreada por este usuário → não duplicar
  const existing = await prisma.product.findFirst({ where: { userId: user.id, url } });
  if (existing) {
    return NextResponse.json(
      { error: "este produto já está sendo rastreado", product: existing },
      { status: 409 },
    );
  }

  const product = await prisma.product.create({
    data: {
      userId: user.id,
      url,
      domain: host,
      targetCents: body.targetCents ?? null,
      intervalMin,
      status: "extracting",
      nextCheckAt: new Date(),
      remessaConforme: body.remessaConforme ?? crossBorder,
    },
  });

  return NextResponse.json({ product }, { status: 201 });
}

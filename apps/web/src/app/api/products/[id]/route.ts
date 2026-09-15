import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { computeSavings } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: { listings: { orderBy: { priceCents: "asc" } } },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    targetCents?: number | null;
    intervalMin?: number;
    title?: string;
    dropAbsCents?: number | null;
    dropPct?: number | null;
    flexBrands?: boolean;
    specTokens?: string[];
    negativeSpecs?: string[];
  };

  const owned = await prisma.product.findFirst({ where: { id, userId: user.id } });
  if (!owned) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const clean = (xs: string[]) => xs.map((t) => t.toLowerCase().trim()).filter((t) => t.length >= 2);
  // specs mudaram → flex re-roda já no próximo tick em vez de esperar 6h
  const specsTouched = body.specTokens !== undefined || body.negativeSpecs !== undefined
    || (body.flexBrands !== undefined && body.flexBrands !== owned.flexBrands);

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(body.targetCents !== undefined ? { targetCents: body.targetCents } : {}),
      ...(body.intervalMin ? { intervalMin: body.intervalMin } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.dropAbsCents !== undefined ? { dropAbsCents: body.dropAbsCents } : {}),
      ...(body.dropPct !== undefined ? { dropPct: body.dropPct } : {}),
      ...(body.flexBrands !== undefined ? { flexBrands: body.flexBrands } : {}),
      ...(body.specTokens !== undefined ? { specTokens: clean(body.specTokens) } : {}),
      ...(body.negativeSpecs !== undefined ? { negativeSpecs: clean(body.negativeSpecs) } : {}),
      ...(specsTouched ? { lastFlexSearchAt: null } : {}),
    },
  });
  return NextResponse.json({ product });
}

/** Remove flow: "bought" (records savings) or "dismissed". */
export async function DELETE(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    resolution?: "bought" | "dismissed";
    paidCents?: number;
  };

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: { listings: { orderBy: { priceCents: "asc" } } },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  if (body.resolution === "bought") {
    if (!body.paidCents || body.paidCents <= 0) {
      return NextResponse.json({ error: "informe quanto pagou" }, { status: 400 });
    }
    const reference = product.minPriceCents ?? product.listings[0]?.priceCents ?? body.paidCents;
    const savedCents = computeSavings(reference, body.paidCents);
    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        productId: product.id,
        paidCents: body.paidCents,
        referenceCents: reference,
        savedCents,
      },
    });
    await prisma.product.update({ where: { id }, data: { status: "archived_bought" } });
    return NextResponse.json({ ok: true, purchase });
  }

  await prisma.product.update({ where: { id }, data: { status: "archived_dismissed" } });
  return NextResponse.json({ ok: true });
}

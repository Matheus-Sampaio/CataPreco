import { NextResponse } from "next/server";
import { prisma, Prisma } from "@catapreco/db";
import { nextCheckAt } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

/**
 * Price Selection Modal resolution: user confirms/overrides the price
 * when extractors disagreed. Then the product goes to search mode.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;
  const { valueCents } = (await req.json().catch(() => ({}))) as { valueCents?: number };
  if (!valueCents || valueCents <= 0) {
    return NextResponse.json({ error: "valor inválido" }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: { listings: true },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const primary = product.listings.find((l) => l.isPrimary);
  if (primary) {
    await prisma.listing.update({
      where: { id: primary.id },
      data: { priceCents: valueCents, lastCheckedAt: new Date() },
    });
    await prisma.pricePoint.create({
      data: { listingId: primary.id, priceCents: valueCents, stock: primary.stock },
    });
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      status: "searching",
      minPriceCents: valueCents,
      lowestEverCents: product.lowestEverCents ?? valueCents,
      pendingCandidates: Prisma.DbNull,
      nextCheckAt: nextCheckAt(new Date(), product.intervalMin),
    },
  });
  return NextResponse.json({ product: updated });
}

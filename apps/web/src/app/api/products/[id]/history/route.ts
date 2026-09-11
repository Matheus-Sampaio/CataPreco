import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";

/** Price history: per-listing points + min-price-over-time series (chart). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: { listings: { select: { id: true, marketplace: true, priceCents: true } } },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const listingIds = product.listings.map((l) => l.id);
  const points = await prisma.pricePoint.findMany({
    where: { listingId: { in: listingIds } },
    orderBy: { ts: "asc" },
  });

  // Build global min price timeline (all listings together)
  const timeline = points.map((p) => ({ ts: p.ts, priceCents: p.priceCents }));
  const minSeries: { ts: Date; priceCents: number }[] = [];
  let runningMin: number | null = null;
  for (const p of timeline) {
    runningMin = runningMin === null ? p.priceCents : Math.min(runningMin, p.priceCents);
    minSeries.push({ ts: p.ts, priceCents: runningMin });
  }

  const prices = points.map((p) => p.priceCents);
  return NextResponse.json({
    points,
    listings: product.listings,
    minSeries,
    stats: prices.length
      ? {
          min: Math.min(...prices),
          max: Math.max(...prices),
          avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
          readings: prices.length,
        }
      : null,
  });
}

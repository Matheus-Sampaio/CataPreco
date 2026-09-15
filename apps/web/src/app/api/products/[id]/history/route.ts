import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";

/** Price history: per-listing points + min-price series (own product vs alternatives). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: {
      listings: { select: { id: true, marketplace: true, priceCents: true, isAlternative: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const listingIds = product.listings.map((l) => l.id);
  const points = await prisma.pricePoint.findMany({
    where: { listingId: { in: listingIds } },
    orderBy: { ts: "asc" },
  });

  const altIds = new Set(product.listings.filter((l) => l.isAlternative).map((l) => l.id));
  const ownPoints = points.filter((p) => !altIds.has(p.listingId));
  const altPoints = points.filter((p) => altIds.has(p.listingId));

  // Running-min series: own product listings and other-brand alternatives apart.
  function runningMin(ps: typeof points) {
    const out: { ts: Date; priceCents: number }[] = [];
    let min: number | null = null;
    for (const p of ps) {
      min = min === null ? p.priceCents : Math.min(min, p.priceCents);
      out.push({ ts: p.ts, priceCents: min });
    }
    return out;
  }

  const statsOf = (ps: typeof points) =>
    ps.length
      ? {
          min: Math.min(...ps.map((p) => p.priceCents)),
          max: Math.max(...ps.map((p) => p.priceCents)),
          avg: Math.round(ps.reduce((a, b) => a + b.priceCents, 0) / ps.length),
          readings: ps.length,
        }
      : null;

  return NextResponse.json({
    points,
    listings: product.listings,
    minSeries: runningMin(ownPoints),
    altSeries: runningMin(altPoints),
    stats: statsOf(ownPoints),
    altStats: statsOf(altPoints),
  });
}

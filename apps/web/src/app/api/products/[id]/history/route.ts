import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { hasNegativeSpec } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

/** Price history: per-listing points + min-price series (own product vs alternatives). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, userId: user.id },
    include: {
      listings: { select: { id: true, marketplace: true, title: true, priceCents: true, isAlternative: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const listingIds = product.listings.map((l) => l.id);
  const points = await prisma.pricePoint.findMany({
    where: { listingId: { in: listingIds } },
    orderBy: { ts: "asc" },
  });

  const negatives = (product.negativeSpecs as string[] | null) ?? [];
  const byId = new Map(product.listings.map((l) => [l.id, l] as const));
  // listings descartadas visualmente: spec negativa detectada no título
  // (mesma regra do agregado — pontos históricos delas não afetam o gráfico)
  const barred = (listingId: string): boolean => {
    const l = byId.get(listingId);
    return !!l?.title && negatives.length > 0 && hasNegativeSpec(l.title, negatives);
  };
  const clean = points.filter((p) => !barred(p.listingId));

  const altIds = new Set(product.listings.filter((l) => l.isAlternative).map((l) => l.id));
  const ownPoints = clean.filter((p) => !altIds.has(p.listingId));
  const altPoints = clean.filter((p) => altIds.has(p.listingId));

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

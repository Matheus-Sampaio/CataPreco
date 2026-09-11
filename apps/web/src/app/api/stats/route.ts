import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { dashboardStats } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const products = await prisma.product.findMany({ where: { userId: user.id } });
  const purchases = await prisma.purchase.findMany({ where: { userId: user.id } });
  const stats = dashboardStats(products);
  const totalSavedCents = purchases.reduce((acc, p) => acc + p.savedCents, 0);

  return NextResponse.json({ ...stats, totalSavedCents });
}

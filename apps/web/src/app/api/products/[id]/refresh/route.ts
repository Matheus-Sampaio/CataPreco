import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";

/** Forces an immediate check: sets nextCheckAt=now for the worker to pick up. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({ where: { id, userId: user.id } });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const updated = await prisma.product.update({
    where: { id },
    data: { nextCheckAt: new Date(), status: product.status === "active" ? "active" : product.status },
  });
  return NextResponse.json({ ok: true, nextCheckAt: updated.nextCheckAt });
}

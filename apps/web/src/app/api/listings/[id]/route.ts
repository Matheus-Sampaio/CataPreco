import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";

/** Remove a single listing (e.g. false-positive cross-match). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const listing = await prisma.listing.findUnique({ where: { id }, include: { product: true } });
  if (!listing || listing.product.userId !== user.id) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  if (listing.isPrimary) {
    return NextResponse.json({ error: "não é possível remover a oferta principal" }, { status: 400 });
  }
  await prisma.listing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

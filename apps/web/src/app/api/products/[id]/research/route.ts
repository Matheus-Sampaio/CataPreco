import { NextResponse } from "next/server";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";

/** Re-run the cross-marketplace search for an existing product. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findFirst({ where: { id, userId: user.id } });
  if (!product) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  if (product.status === "archived_bought" || product.status === "archived_dismissed") {
    return NextResponse.json({ error: "produto arquivado" }, { status: 400 });
  }
  if (!product.title) {
    return NextResponse.json({ error: "produto sem título extractível" }, { status: 400 });
  }

  await prisma.product.update({ where: { id }, data: { status: "searching" } });
  return NextResponse.json({ ok: true });
}

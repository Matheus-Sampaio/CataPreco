import { redirect } from "next/navigation";
import { prisma } from "@catapreco/db";
import { dashboardStats } from "@catapreco/core";
import { getSessionUser } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import type { UiProduct } from "@/components/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [products, purchases] = await Promise.all([
    prisma.product.findMany({
      where: { userId: user.id, status: { notIn: ["archived_bought", "archived_dismissed"] } },
      include: { listings: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchase.findMany({ where: { userId: user.id } }),
  ]);

  const uiProducts: UiProduct[] = JSON.parse(JSON.stringify(products));
  const stats = {
    ...dashboardStats(products),
    totalSavedCents: purchases.reduce((acc, p) => acc + p.savedCents, 0),
  };

  return (
    <DashboardClient
      user={{ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin }}
      initialProducts={uiProducts}
      initialStats={stats}
    />
  );
}

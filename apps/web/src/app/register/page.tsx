import { redirect } from "next/navigation";
import { prisma } from "@catapreco/db";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const regSetting = await prisma.appSetting.findUnique({ where: { key: "registrationEnabled" } });
  const enabled = regSetting ? regSetting.value === "true" : true;
  const userCount = await prisma.user.count();
  if (!enabled && userCount > 0) redirect("/login");
  return <AuthForm mode="register" />;
}

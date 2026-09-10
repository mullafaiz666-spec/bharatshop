import { redirect } from "next/navigation";
import CommandCentreV3 from "@/components/CommandCentreV3";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CommandCentrePage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin-login");
  return <CommandCentreV3 />;
}

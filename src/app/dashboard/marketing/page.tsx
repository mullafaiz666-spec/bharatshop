import MarketingAgentCockpit from "@/components/MarketingAgentCockpit";
import { getAdminUser } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function MarketingAgentDashboardPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin-login");
  return <MarketingAgentCockpit />;
}

import DashboardV2 from "@/components/DashboardV2";

// Production dashboard must always render the V2 command centre and must not be
// served from a stale Next/Render cache after a deployment.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function DashboardPage() {
  return <DashboardV2 />;
}

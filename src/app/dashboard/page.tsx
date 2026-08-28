import OperationalDashboard from "@/components/OperationalDashboard";
import CEOChat from "@/components/CEOChat";
export const dynamic = "force-dynamic";
// Production deployment trigger: dashboard renders the operational loop plus the CEO decision layer.
export default function DashboardPage(){
  return <>
    <OperationalDashboard />
    <CEOChat />
  </>;
}

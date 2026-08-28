import OperationalDashboard from "@/components/OperationalDashboard";
export const dynamic = "force-dynamic";
// Production deployment trigger: dashboard must always render the current operational loop from main.
export default function DashboardPage(){ return <OperationalDashboard/>; }

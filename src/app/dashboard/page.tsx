import OperationalDashboard from "@/components/OperationalDashboard";
import CatalogSyncPanel from "@/components/CatalogSyncPanel";
import CEOChat from "@/components/CEOChat";
import SellerIntelligencePanel from "@/components/SellerIntelligencePanel";
export const dynamic = "force-dynamic";
export default function DashboardPage(){
  return <><OperationalDashboard /><div className="bg-slate-950 px-4 md:px-8 pb-8"><div className="max-w-7xl mx-auto space-y-6"><CatalogSyncPanel /><SellerIntelligencePanel /></div></div><CEOChat /></>;
}

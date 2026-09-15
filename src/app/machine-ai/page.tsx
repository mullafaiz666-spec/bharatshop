import type { Metadata } from "next";
import MachineAIWorkspace from "@/components/machine-ai/MachineAIWorkspace";

export const metadata: Metadata = {
  title: "Machine AI — BharatShop Local",
  description: "Private local browser workspace for BharatShop Machine AI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function MachineAIPage() {
  return <MachineAIWorkspace />;
}

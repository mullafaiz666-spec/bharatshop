import type { Metadata } from "next";
import McpPanel from "@/components/machine-ai/McpPanel";

export const metadata: Metadata = {
  title: "MCP Connectors — BharatShop Machine AI",
  description: "Read-only MCP connector verification for the local BharatShop Machine AI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function MachineAIMcpPage() {
  return <McpPanel />;
}

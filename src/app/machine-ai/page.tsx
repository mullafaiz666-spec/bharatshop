import type { Metadata } from "next";
import MachineAIWorkspace from "@/components/machine-ai/MachineAIWorkspace";

export const metadata: Metadata = {
  title: "Machine AI — BharatShop Local",
  description: "Private local browser workspace for BharatShop Machine AI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function MachineAIPage() {
  return (
    <>
      <a
        href="/machine-ai/mcp"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 90,
          padding: "9px 12px",
          borderRadius: 999,
          background: "#0f172a",
          color: "#e2e8f0",
          border: "1px solid #334155",
          textDecoration: "none",
          fontSize: 12,
          fontWeight: 700,
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        }}
      >
        MCP connectors
      </a>
      <MachineAIWorkspace />
    </>
  );
}

"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Root page — auto-redirect to the operator dashboard (main panel)
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="radar-grid-bg min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-lg">B</div>
        <div>
          <span className="font-heading text-xl font-bold text-slate-100">BHARAT<span className="text-orange-400">DROP</span></span>
          <div className="font-mono text-[10px] text-slate-500">AI DROPSHIPPING ENGINE</div>
        </div>
      </div>
      <Loader2 className="h-6 w-6 text-orange-400 animate-spin" />
      <p className="font-mono text-xs text-slate-500">Redirecting to Agent Dashboard...</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstall() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure shouldn't break the app — just no offline support.
      });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Already running as an installed app? Don't show the banner.
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !installEvent) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0F1522]/95 backdrop-blur px-4 py-3 shadow-2xl flex items-center gap-3">
      <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden">
        <img src="/icons/icon-192.png" alt="BharatShop" className="h-full w-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">Install BharatShop Agent</p>
        <p className="text-xs text-white/60 truncate">Add to your home screen for one-tap access</p>
      </div>
      <button
        onClick={async () => {
          await installEvent.prompt();
          await installEvent.userChoice;
          setInstallEvent(null);
        }}
        className="flex items-center gap-1.5 rounded-xl bg-[#F97316] px-3 py-2 text-xs font-semibold text-white shrink-0"
      >
        <Download size={14} />
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-white/40 hover:text-white/70 shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}

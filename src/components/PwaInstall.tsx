"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export default function PwaInstall() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const localDevelopment = isLocalDevelopmentHost();

    if ("serviceWorker" in navigator) {
      if (localDevelopment) {
        // Development must never be controlled by a persistent production PWA cache.
        // Turbopack rebuilds module graphs frequently, so an old cached /_next chunk can
        // create "module factory is not available" errors even when the server is healthy.
        void navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        ).catch(() => undefined);
        if ("caches" in window) {
          void caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key.startsWith("bharatshop-")).map((key) => caches.delete(key)))
          ).catch(() => undefined);
        }
        setDismissed(true);
      } else {
        void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
          // Registration failure should not break shopping; offline install simply remains unavailable.
        });
      }
    }

    const onBeforeInstall = (event: Event) => {
      if (localDevelopment) return;
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

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
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#0F1522]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
        <img src="/icons/icon-192.png" alt="BharatShop" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">Install BharatShop</p>
        <p className="truncate text-xs text-white/60">Add the store and command centre for one-tap access</p>
      </div>
      <button
        onClick={async () => {
          await installEvent.prompt();
          await installEvent.userChoice;
          setInstallEvent(null);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F97316] px-3 py-2 text-xs font-semibold text-white"
      >
        <Download size={14} />
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-white/40 hover:text-white/70"
      >
        <X size={16} />
      </button>
    </div>
  );
}

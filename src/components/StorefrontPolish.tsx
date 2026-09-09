"use client";

import { useEffect } from "react";

/** Customer-facing cleanup plus a last-line image recovery guard for storefront media. */
export default function StorefrontPolish() {
  useEffect(() => {
    const storefrontPath = window.location.pathname === "/" || window.location.pathname.startsWith("/store");
    if (!storefrontPath) return;

    const recoverImage = (event: Event) => {
      const img = event.target instanceof HTMLImageElement ? event.target : null;
      if (!img || img.dataset.bharatFallbackDone === "1") return;
      const attempts = Number(img.dataset.bharatFallbackAttempt || "0");
      try {
        const current = new URL(img.currentSrc || img.src, window.location.origin);
        const match = current.pathname.match(/^\/api\/fashion-(?:art|photo)\/(\d+)\/(\d+)/);
        if (match && attempts < 3) {
          const productId = match[1];
          const nextView = (Number(match[2]) + 1) % 4;
          img.dataset.bharatFallbackAttempt = String(attempts + 1);
          img.src = `${window.location.origin}/api/fashion-art/${productId}/${nextView}`;
          return;
        }
      } catch {}
      img.dataset.bharatFallbackDone = "1";
      img.src = "/icons/icon-512.png";
      img.style.objectFit = "contain";
      img.style.padding = "12px";
      img.style.background = "#ffffff";
    };

    document.addEventListener("error", recoverImage, true);

    if (window.location.pathname === "/") {
      const clean = () => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
        const brandMatches = elements.filter((el) => el.children.length === 0 && el.textContent?.trim() === "BharatShop");
        brandMatches.slice(0, Math.max(0, brandMatches.length - 1)).forEach((el) => { el.style.display = "none"; });
        elements.forEach((el) => {
          if (el.children.length > 0) return;
          const text = el.textContent?.trim().toLowerCase() || "";
          if (text === "find a great deal" || text === "find a great deal, feel like you own it") el.style.display = "none";
        });
      };
      clean();
      const observer = new MutationObserver(clean);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        document.removeEventListener("error", recoverImage, true);
      };
    }

    return () => document.removeEventListener("error", recoverImage, true);
  }, []);

  return null;
}

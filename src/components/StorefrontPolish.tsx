"use client";

import { useEffect } from "react";

/** Customer-facing cleanup: keep the preferred lower brand mark and remove the old promotional hero copy. */
export default function StorefrontPolish() {
  useEffect(() => {
    if (window.location.pathname !== "/") return;

    const clean = () => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      const brandMatches = elements.filter((el) => el.children.length === 0 && el.textContent?.trim() === "BharatShop");
      // Keep the lower/last standalone brand mark; hide only the earlier duplicate.
      brandMatches.slice(0, Math.max(0, brandMatches.length - 1)).forEach((el) => {
        el.style.display = "none";
      });

      elements.forEach((el) => {
        if (el.children.length > 0) return;
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text === "find a great deal" || text === "find a great deal, feel like you own it") {
          el.style.display = "none";
        }
      });
    };

    clean();
    const observer = new MutationObserver(clean);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

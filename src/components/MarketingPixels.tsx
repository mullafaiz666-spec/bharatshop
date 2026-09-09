"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    bharatTrack?: (name: string, params?: Record<string, unknown>) => void;
    bharatTrackMeta?: (name: string, params?: Record<string, unknown>, eventId?: string) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "";
const rawPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";
const META_PIXEL_ID = /^\d+$/.test(rawPixelId) ? rawPixelId : "";
const GOOGLE_TAG_ID = GA_ID || GOOGLE_ADS_ID;

const metaEventMap: Record<string, string> = {
  page_view: "PageView",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  search: "Search",
};

function generatedEventId() {
  try { return crypto.randomUUID(); } catch { return `bs-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function emit(name: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, params);
  emitMeta(name, params);
}

function emitMeta(name: string, params: Record<string, unknown> = {}, sharedEventId?: string) {
  const metaName = metaEventMap[name];
  if (!metaName || !META_PIXEL_ID) return;
  const id = sharedEventId?.trim() || generatedEventId();
  window.fbq?.("track", metaName, params, { eventID: id });
  // Purchase is emitted server-side only after a verified payment. Browser Purchase
  // calls pass the same event ID so Meta can deduplicate Pixel + CAPI copies.
  if (metaName !== "Purchase") {
    void fetch("/api/marketing/meta/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ eventName: metaName, eventId: id, eventSourceUrl: window.location.href, customData: params }),
    }).catch(() => undefined);
  }
}

export default function MarketingPixels() {
  const pathname = usePathname();
  const [metaReady, setMetaReady] = useState(false);
  const storefront = pathname === "/" || pathname.startsWith("/store");
  const verifiedCheckout = pathname.startsWith("/checkout/success");
  const trackingSurface = storefront || verifiedCheckout;

  useEffect(() => {
    if (!metaReady || !trackingSurface) return;
    emitMeta("page_view", { page_location: window.location.href, page_title: document.title });
  }, [metaReady, pathname, trackingSurface]);

  useEffect(() => {
    if (!trackingSurface) return;
    window.bharatTrack = emit;
    window.bharatTrackMeta = emitMeta;

    if (!storefront) {
      return () => {
        delete window.bharatTrack;
        delete window.bharatTrackMeta;
      };
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest("button,a") as HTMLElement | null;
      if (!el) return;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const scope = el.closest("article,section,[role='dialog']") || document.body;
      const title = (scope.querySelector("h1,h2,h3")?.textContent || "").trim();
      const params: Record<string, unknown> = title ? { item_name: title, content_name: title, content_type: "product" } : {};

      if (text.includes("add to bag") || text.includes("add to cart")) emit("add_to_cart", params);
      else if (text.includes("buy now") || text.includes("checkout")) emit("begin_checkout", params);
      else if (text.includes("save") || text.includes("wishlist")) emit("add_to_wishlist", params);
      else if (text.includes("view product")) emit("view_item", params);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      const text = (form.textContent || "").toLowerCase();
      if (text.includes("secure checkout") || text.includes("place order")) emit("begin_checkout", { checkout_type: "storefront" });
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      delete window.bharatTrack;
      delete window.bharatTrackMeta;
    };
  }, [storefront, trackingSurface]);

  if (!trackingSurface) return null;

  return (
    <>
      {GOOGLE_TAG_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`} strategy="afterInteractive" />
          <Script id="bharatshop-google-tag" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              ${GA_ID ? `gtag('config', '${GA_ID}', { anonymize_ip: true });` : ""}
              ${GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}');` : ""}
            `}
          </Script>
        </>
      ) : null}

      {META_PIXEL_ID ? (
        <>
          <Script id="bharatshop-meta-pixel" strategy="afterInteractive" onReady={() => setMetaReady(true)}>
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
              (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
            `}
          </Script>
          <noscript>
            <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${encodeURIComponent(META_PIXEL_ID)}&ev=PageView&noscript=1`} />
          </noscript>
        </>
      ) : null}
    </>
  );
}

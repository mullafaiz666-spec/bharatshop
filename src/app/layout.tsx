import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import PwaInstall from "@/components/PwaInstall";
import StorefrontPolish from "@/components/StorefrontPolish";

export const metadata: Metadata = {
  title: "BharatShop Agent — AI Dropshipping Command Center",
  description: "India's most powerful AI dropshipping platform. 1000+ trending products, own website storefront, Shopify sync agent, daily AI recalculation, automated marketing campaigns — all from one dashboard.",
  keywords: "dropshipping india, meesho, flipkart, ai dropshipping, bharatshop, shopify india",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BharatShop",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#090D16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-[#090D16] text-[#F8FAFC] antialiased min-h-screen">
        {children}
        <StorefrontPolish />
        <PwaInstall />
      </body>
    </html>
  );
}

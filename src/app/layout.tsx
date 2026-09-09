import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import MarketingPixels from "@/components/MarketingPixels";
import PwaInstall from "@/components/PwaInstall";
import StorefrontPolish from "@/components/StorefrontPolish";
import StructuredData from "@/components/StructuredData";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const metaVerification = process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "BharatShop",
  title: {
    default: "BharatShop — Smart Shopping & Original Fashion",
    template: "%s | BharatShop",
  },
  description: "Shop verified products and original BharatShop Studio fashion made to order in India. Clear pricing, secure ordering and mobile-first shopping.",
  keywords: [
    "BharatShop",
    "online shopping India",
    "fashion India",
    "print on demand India",
    "men fashion",
    "women fashion",
    "kids fashion",
    "home and lifestyle products",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  category: "shopping",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "BharatShop",
    title: "BharatShop — Smart Shopping & Original Fashion",
    description: "Verified products plus original BharatShop Studio fashion for men, women and kids.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "BharatShop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BharatShop — Smart Shopping & Original Fashion",
    description: "Verified products plus original BharatShop Studio fashion for men, women and kids.",
    images: ["/icons/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  verification: {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(metaVerification ? { other: { "facebook-domain-verification": metaVerification } } : {}),
  },
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
        <StructuredData />
      </head>
      <body className="bg-[#090D16] text-[#F8FAFC] antialiased min-h-screen">
        {children}
        <StorefrontPolish />
        <PwaInstall />
        <MarketingPixels />
      </body>
    </html>
  );
}

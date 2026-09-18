import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CartProvider } from "@/components/bharatdrip/cart-context";
import { getLiveBharatDripProducts } from "@/lib/bharatdrip/live-products";
import { products as staticProducts } from "@/lib/bharatdrip/products";
import "./bharatdrip.css";

export const metadata: Metadata = {
  title: "BharatDrip — Everyday, original.",
  description: "Independent streetwear for every version of you. Designed in India, made to move everywhere.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BharatDripLayout({ children }: { children: ReactNode }) {
  let liveProducts: Awaited<ReturnType<typeof getLiveBharatDripProducts>> = [];
  try {
    liveProducts = await getLiveBharatDripProducts();
  } catch {
    // The static themed catalogue keeps BharatDrip usable during a temporary DB outage.
  }
  const catalogue = [...liveProducts, ...staticProducts];
  return <CartProvider catalogue={catalogue}><div className="bharatdrip-shell">{children}</div></CartProvider>;
}

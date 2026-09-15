import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CartProvider } from "@/components/bharatdrip/cart-context";
import "./bharatdrip.css";

export const metadata: Metadata = {
  title: "BharatDrip — Everyday, original.",
  description: "Independent streetwear for every version of you. Designed in India, made to move everywhere.",
};

export default function BharatDripLayout({ children }: { children: ReactNode }) {
  return <CartProvider><div className="bharatdrip-shell">{children}</div></CartProvider>;
}

import type { Metadata } from "next";
import LocalAIChat from "@/components/local-ai/LocalAIChat";

export const metadata: Metadata = {
  title: "Laptop AI",
  description: "Private local BharatShop AI chat powered by Ollama on this laptop.",
  robots: { index: false, follow: false },
};

export default function LocalAIPage() {
  return <LocalAIChat />;
}

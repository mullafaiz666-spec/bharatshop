"use client";

import React, { useState } from "react";
import {
  Radar,
  Sparkles,
  Zap,
  TrendingUp,
  X,
  PlusCircle,
  CheckCircle2,
  Loader2,
  DollarSign,
  Package,
} from "lucide-react";

interface AiScoutRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: () => void;
}

export function AiScoutRadarModal({
  isOpen,
  onClose,
  onProductCreated,
}: AiScoutRadarModalProps) {
  const [activeTab, setActiveTab] = useState<"ai-scout" | "manual">("ai-scout");
  const [nicheInput, setNicheInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scoutResult, setScoutResult] = useState<{
    product: {
      id: number;
      title: string;
      sku: string;
      sellingPriceUsd: string;
      supplierCostUsd: string;
      netProfitUsd: string;
      marginPct: string;
      aiScore: number;
      imageUrl: string;
      aiMarketingCopy: string;
    };
    scoutReport: {
      aiConfidence: number;
      viralVelocity: number;
      estimatedDailyOrders: number;
      supplierLatencyDays: string;
    };
  } | null>(null);

  // Manual form state
  const [title, setTitle] = useState("Pro-Grip MagSafe SSD Enclosure 2TB");
  const [category, setCategory] = useState("Tech & Smart Home");
  const [supplierCost, setSupplierCost] = useState("13.50");
  const [shippingCost, setShippingCost] = useState("2.20");
  const [sellingPrice, setSellingPrice] = useState("49.99");
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80"
  );
  const [aiMarketingCopy, setAiMarketingCopy] = useState(
    "High-speed 10Gbps pocket SSD with Apple MagSafe magnet ring attach."
  );
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  if (!isOpen) return null;

  const costNum = Number(supplierCost) || 0;
  const shipNum = Number(shippingCost) || 0;
  const priceNum = Number(sellingPrice) || 0;
  const netProfitNum = Number((priceNum - costNum - shipNum).toFixed(2));
  const marginPctNum =
    priceNum > 0 ? Number(((netProfitNum / priceNum) * 100).toFixed(1)) : 0;

  async function handleTriggerAiScout() {
    setIsScanning(true);
    setScoutResult(null);
    try {
      const res = await fetch("/api/products/ai-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: nicheInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setScoutResult(data);
        onProductCreated();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmittingManual(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          supplierCostUsd: supplierCost,
          shippingCostUsd: shippingCost,
          sellingPriceUsd: sellingPrice,
          imageUrl,
          aiMarketingCopy,
          supplierName: "Shenzhen Automated Priority Express",
        }),
      });
      if (res.ok) {
        onProductCreated();
        onClose();
      }
    } finally {
      setIsSubmittingManual(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Radar className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-slate-100">
                AI SCOUT & STORE PRODUCT LOADER
              </h2>
              <p className="text-xs text-slate-400">
                Automated TikTok/AliExpress trend scanner & 1-click storefront publish
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            onClick={() => setActiveTab("ai-scout")}
            className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "ai-scout"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Trend Scout Radar
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`ml-6 flex items-center gap-2 border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === "manual"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Manual SKU Import
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "ai-scout" ? (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Target Niche or Viral Keyword (Optional)
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={nicheInput}
                    onChange={(e) => setNicheInput(e.target.value)}
                    placeholder="e.g. Smart LED desk clock, posture ring, heated mug..."
                    className="h-11 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={handleTriggerAiScout}
                    disabled={isScanning}
                    className="flex h-11 items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Scanning TikTok + CJ...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Scan & Auto-Import
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Radar scanner animation overlay */}
              {isScanning && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/20 py-10 text-center">
                  <div className="relative mb-4 flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-emerald-500/40 animate-ping" />
                    <span className="absolute inset-2 rounded-full border border-emerald-500/60" />
                    <Radar className="h-9 w-9 text-emerald-400 animate-spin" />
                  </div>
                  <h4 className="font-heading text-sm font-bold text-emerald-300">
                    ANALYZING 14,200 REAL-TIME TIKTOK & ALIEXPRESS VELOCITY SIGNALS
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Filtering out saturated SKUs • Calculating supplier air-freight margins
                  </p>
                </div>
              )}

              {/* Result card */}
              {scoutResult && !isScanning && (
                <div className="rounded-xl border border-emerald-500/40 bg-slate-950/80 p-4">
                  <div className="flex items-start gap-4">
                    <img
                      src={scoutResult.product.imageUrl}
                      alt={scoutResult.product.title}
                      className="h-24 w-24 rounded-lg object-cover border border-slate-800"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400 border border-emerald-500/20">
                          AI SCORE: {scoutResult.product.aiScore}/100 // VIRAL WINNER
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          SKU: {scoutResult.product.sku}
                        </span>
                      </div>
                      <h4 className="font-heading text-base font-bold text-slate-100 mt-1">
                        {scoutResult.product.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {scoutResult.product.aiMarketingCopy}
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-900/80 p-2.5 text-center">
                        <div>
                          <div className="text-[10px] uppercase text-slate-400">
                            Supplier Cost
                          </div>
                          <div className="font-mono text-xs font-semibold text-slate-300">
                            ${scoutResult.product.supplierCostUsd}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-slate-400">
                            Selling Price
                          </div>
                          <div className="font-mono text-xs font-semibold text-sky-400">
                            ${scoutResult.product.sellingPriceUsd}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-emerald-400 font-semibold">
                            Net Profit / Unit
                          </div>
                          <div className="font-mono text-sm font-bold text-emerald-400">
                            +${scoutResult.product.netProfitUsd} (
                            {scoutResult.product.marginPct}%)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Auto-published to Shopify & TikTok Shop storefronts
                    </span>
                    <button
                      onClick={onClose}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-100 hover:bg-slate-700"
                    >
                      View in Product Matrix
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateManual} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Product Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Tech & Smart Home">Tech & Smart Home</option>
                    <option value="Wellness & Fitness">Wellness & Fitness</option>
                    <option value="Home & Kitchen">Home & Kitchen</option>
                    <option value="Wearables">Wearables</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Supplier Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={supplierCost}
                    onChange={(e) => setSupplierCost(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Shipping Air ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Selling Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-sky-400 font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dynamic unit economics preview bar */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-slate-300">
                  Calculated Net Profit per Sale:
                </span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  +${netProfitNum} USD ({marginPctNum}% Margin)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  AI Conversion Ad Copy Hook
                </label>
                <textarea
                  rows={2}
                  value={aiMarketingCopy}
                  onChange={(e) => setAiMarketingCopy(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  <Package className="h-4 w-4" />
                  Publish SKU to Storefronts
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

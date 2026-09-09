"use client";

import React, { useState } from "react";
import {
  X,
  Trash2,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
} from "lucide-react";

export interface ProductItem {
  id: number;
  sku: string;
  title: string;
  category: string;
  imageUrl: string;
  supplierName: string;
  supplierCostUsd: string;
  shippingCostUsd: string;
  sellingPriceUsd: string;
  aiScore: number;
  viralVelocityScore: number;
  marginPct: string;
  netProfitUsd: string;
  stockCount: number;
  autoRepriceEnabled: boolean;
  status: string;
  aiMarketingCopy: string;
  aiTargetAudience: string;
}

interface ProductEditModalProps {
  product: ProductItem | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (id: number) => void;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ProductEditModal({
  product,
  onClose,
  onUpdated,
  onDeleted,
}: ProductEditModalProps) {
  const [sellingPrice, setSellingPrice] = useState(
    product ? product.sellingPriceUsd : "0"
  );
  const [supplierCost, setSupplierCost] = useState(
    product ? product.supplierCostUsd : "0"
  );
  const [aiMarketingCopy, setAiMarketingCopy] = useState(
    product ? product.aiMarketingCopy : ""
  );
  const [status, setStatus] = useState(product ? product.status : "Published");
  const [autoRepriceEnabled, setAutoRepriceEnabled] = useState(
    product ? product.autoRepriceEnabled : true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageSuccess, setImageSuccess] = useState("");
  const [previewUrl, setPreviewUrl] = useState(product?.imageUrl || "");

  React.useEffect(() => {
    if (product) {
      setSellingPrice(product.sellingPriceUsd);
      setSupplierCost(product.supplierCostUsd);
      setAiMarketingCopy(product.aiMarketingCopy);
      setStatus(product.status);
      setAutoRepriceEnabled(product.autoRepriceEnabled);
      setPreviewUrl(product.imageUrl);
      setImageError("");
      setImageSuccess("");
    }
  }, [product]);

  if (!product) return null;

  const costNum = Number(supplierCost) || 0;
  const shipNum = Number(product.shippingCostUsd) || 0;
  const priceNum = Number(sellingPrice) || 0;
  const netProfitNum = Number((priceNum - costNum - shipNum).toFixed(2));
  const marginPctNum =
    priceNum > 0 ? Number(((netProfitNum / priceNum) * 100).toFixed(1)) : 0;

  async function handleImageUpload(file: File | null) {
    if (!file) return;
    setImageError("");
    setImageSuccess("");

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be between 1 byte and 8 MB.");
      return;
    }

    setIsUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("view", "0");
      const res = await fetch(`/api/products/${product.id}/image-upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Image upload failed");
      const nextUrl = String(data?.imageUrl || "").trim();
      if (nextUrl) setPreviewUrl(`${nextUrl}${nextUrl.includes("?") ? "&" : "?"}t=${Date.now()}`);
      setImageSuccess("Product photo uploaded and made primary.");
      onUpdated();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          sellingPriceUsd: sellingPrice,
          supplierCostUsd: supplierCost,
          aiMarketingCopy,
          status,
          autoRepriceEnabled,
        }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    try {
      await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
      onDeleted(product.id);
      onClose();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src={previewUrl || product.imageUrl}
              alt={product.title}
              className="h-10 w-10 rounded-lg object-cover border border-slate-800"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-emerald-400">
                  {product.sku}
                </span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                  AI SCORE {product.aiScore}
                </span>
              </div>
              <h3 className="font-heading text-sm font-bold text-slate-100 line-clamp-1">
                {product.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-start gap-4">
              <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                {previewUrl ? (
                  <img src={previewUrl} alt={`${product.title} primary`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-500"><ImageIcon className="h-8 w-8" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Primary product photo</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">Upload a normal JPG, PNG, or WebP photo. The uploaded raster image takes priority over generated SVG mockups.</p>
                <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 ${isUploadingImage ? "pointer-events-none opacity-60" : ""}`}>
                  <Upload className="h-4 w-4" />
                  {isUploadingImage ? "Uploading..." : "Upload product photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={isUploadingImage}
                    onChange={(e) => {
                      void handleImageUpload(e.target.files?.[0] || null);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {imageError ? <p className="mt-2 text-xs text-red-400">{imageError}</p> : null}
                {imageSuccess ? <p className="mt-2 text-xs text-emerald-400">{imageSuccess}</p> : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Supplier Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={supplierCost}
                onChange={(e) => setSupplierCost(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Air Freight ($)
              </label>
              <input
                type="text"
                disabled
                value={`$${product.shippingCostUsd}`}
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 font-mono text-sm text-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Selling Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="h-10 w-full rounded-lg border border-emerald-500/40 bg-slate-950 px-3 font-mono text-sm text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Calculated Net Profit / Unit
              </div>
              <div className="font-mono text-base font-bold text-emerald-400">
                +${netProfitNum} USD
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Gross Profit Margin
              </div>
              <div className="font-mono text-base font-bold text-emerald-400">
                {marginPctNum}%
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              AI Conversion Ad Copy
            </label>
            <textarea
              rows={2}
              value={aiMarketingCopy}
              onChange={(e) => setAiMarketingCopy(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Catalog Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="Published">Published (Live on Shopify)</option>
                <option value="In Queue">In Queue (A/B Test Ad)</option>
                <option value="Paused">Paused (Out of Stock)</option>
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  AI Dynamic Repricing
                </div>
                <div className="text-[11px] text-slate-400">
                  Protect 60%+ margin
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoRepriceEnabled(!autoRepriceEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoRepriceEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
                    autoRepriceEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete SKU
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSaving ? "Syncing..." : "Save Unit Economics"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

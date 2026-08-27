"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity, Layers, ShoppingCart, Package, Megaphone, Cpu, Database,
  RotateCcw, Zap, IndianRupee, Loader2, X, CheckCircle2, AlertTriangle,
  RefreshCw, ExternalLink, ShoppingBag, Store, Truck, Terminal,
  TrendingUp, Users, BarChart3, Globe, ArrowRight, Link2, Eye,
  Settings, ChevronRight, Flame, Star, Edit3, Trash2, Plus,
} from "lucide-react";
import Link from "next/link";

// ── TYPES ───────────────────────────────────────────────────────────────────
interface SyncLog { id: number; syncType: string; status: string; itemsSynced: number; shopifyStoreUrl: string; message: string; errorDetail?: string; syncedAt: string; }
interface ShopifyDiagnosis { issues: string[]; fixes: string[]; status: string; }
interface ShopifyStatus { hasCredentials: boolean; isCorrectFormat: boolean; shopifyStoreUrl: string | null; tokenType: string; tokenPreview: string | null; diagnosis: ShopifyDiagnosis; }
interface StorefrontOrder { id: number; orderRef: string; customerName: string; customerEmail: string; customerPhone: string; customerCity: string; customerState: string; productTitle: string; quantity: number; totalAmountInr: string; paymentMode: string; paymentStatus: string; fulfillmentStatus: string; trackingCode: string | null; source: string; orderedAt: string; }
interface Campaign { id: number; productTitle: string; platform: string; campaignType: string; headline: string; impressions: number; clicks: number; conversions: number; revenueGeneratedInr: string; estimatedRoas: string; budgetInr: string; status: string; }
interface RefreshLog { id: number; runAt: string; totalProductsUpdated: number; totalProductsAdded: number; avgAiScore: string; topCategory: string; agentSummary: string; status: string; }

const fmt = (n: number | string) => `₹${Number(n).toLocaleString("en-IN")}`;
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

const statusBadge = (s: string) => {
  const m: Record<string, string> = { "Received": "bg-violet-500/15 text-violet-400", "Processing": "bg-amber-500/15 text-amber-400", "Shipped": "bg-sky-500/15 text-sky-400", "Delivered": "bg-emerald-500/15 text-emerald-400", "SUCCESS": "bg-emerald-500/15 text-emerald-400", "SIMULATED": "bg-sky-500/15 text-sky-400", "FAILED": "bg-red-500/15 text-red-400", "LIVE": "bg-emerald-500/15 text-emerald-400", "PAID": "bg-emerald-500/15 text-emerald-400", "PENDING": "bg-amber-500/15 text-amber-400" };
  return m[s] || "bg-slate-700 text-slate-300";
};
const platformBadge = (p: string) => {
  const m: Record<string, string> = { "own_website": "bg-orange-500/20 text-orange-400", "shopify_sync": "bg-green-500/20 text-green-400", "WhatsApp Broadcast": "bg-green-500/20 text-green-400", "Instagram Reels": "bg-pink-500/20 text-pink-400", "Facebook Ads": "bg-blue-500/20 text-blue-400", "Google Shopping": "bg-red-500/20 text-red-400", "YouTube Shorts": "bg-red-600/20 text-red-400" };
  return m[p] || "bg-slate-700 text-slate-400";
};

type Tab = "overview" | "shopify" | "website-orders" | "marketing" | "engine";

export default function AgentDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<{ msg: string; type: "s" | "w" | "i" } | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [shopifyUrl, setShopifyUrl] = useState<string | null>(null);
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; shopName?: string; error?: string; diagnosis?: ShopifyDiagnosis } | null>(null);
  const [storefrontOrders, setStorefrontOrders] = useState<StorefrontOrder[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [refreshLogs, setRefreshLogs] = useState<RefreshLog[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [activityLogs, setActivityLogs] = useState<{ id: number; agentName: string; message: string; profitImpactInr: string; status: string; createdAt: string }[]>([]);

  // Action states
  const [syncing, setSyncing] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingCamp, setGeneratingCamp] = useState(false);
  const [orderFilter, setOrderFilter] = useState("ALL");
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  const showToast = (msg: string, type: "s" | "w" | "i" = "s") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [shopifyRes, sfOrdersRes, campRes, overviewRes, refreshRes] = await Promise.all([
        fetch("/api/shopify/sync"),
        fetch("/api/storefront/orders?limit=60"),
        fetch("/api/engine/campaigns?limit=30"),
        fetch("/api/overview?limit=1"),
        fetch("/api/engine/daily-refresh"),
      ]);
      const [shopD, sfD, campD, ovD, refD] = await Promise.all([shopifyRes.json(), sfOrdersRes.json(), campRes.json(), overviewRes.json(), refreshRes.json()]);

      setSyncLogs(shopD.syncLogs || []);
      setShopifyConnected(shopD.hasCredentials && shopD.isCorrectFormat);
      setShopifyUrl(shopD.shopifyStoreUrl || null);
      setShopifyStatus(shopD);
      setStorefrontOrders(sfD.orders || []);
      setCampaigns(campD.campaigns || []);
      setRefreshLogs(refD.refreshLogs || []);
      setTotalProducts(ovD.kpis?.activeProductsCount || 0);
      setTotalOrders(sfD.total || 0);
      setTotalRevenue(sfD.orders?.reduce((a: number, o: StorefrontOrder) => a + Number(o.totalAmountInr), 0) || 0);
      setActivityLogs((ovD.activityLogs || []).slice(0, 15));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function testShopifyConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/shopify/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "TEST_CONNECTION" }) });
      const d = await res.json();
      setTestResult(d);
      if (d.connected) {
        showToast(`✅ Connected to "${d.shopName}"!`, "s");
        setShopifyConnected(true);
      } else {
        showToast(d.error || "Connection failed", "w");
      }
      fetchAll();
    } finally { setTestingConnection(false); }
  }

  async function runShopifySync(action: string) {
    setSyncing(action);
    try {
      const res = await fetch("/api/shopify/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit: 50 }) });
      const d = await res.json();
      if (d.error) {
        showToast(d.error, "w");
      } else {
        showToast(d.message || `${action} complete`, "s");
      }
      fetchAll();
    } finally { setSyncing(null); }
  }

  async function runBulkSeed() {
    setSeeding(true);
    showToast("Seeding 1000+ products...", "i");
    const res = await fetch("/api/engine/bulk-seed", { method: "POST" });
    const d = await res.json();
    showToast(d.message || "Seed complete!", "s");
    setSeeding(false); fetchAll();
  }

  async function runDailyRefresh() {
    setRefreshing(true);
    showToast("Daily AI refresh running...", "i");
    const res = await fetch("/api/engine/daily-refresh", { method: "POST" });
    const d = await res.json();
    showToast(d.message || "Refresh complete!", "s");
    setRefreshing(false); fetchAll();
  }

  async function generateCampaign() {
    setGeneratingCamp(true);
    const res = await fetch("/api/engine/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await res.json();
    showToast(`Campaign live on ${d.campaign?.platform}: "${d.campaign?.headline?.slice(0, 50)}..."`, "s");
    setGeneratingCamp(false); fetchAll();
  }

  async function advanceOrderStatus(id: number, next: string) {
    setUpdatingOrder(id);
    await fetch("/api/storefront/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, fulfillmentStatus: next, trackingCode: `DLV${Math.floor(Math.random() * 9000000 + 1000000)}` }) });
    showToast(`Order status → ${next}`, "s");
    setUpdatingOrder(null); fetchAll();
  }

  const filteredOrders = storefrontOrders.filter(o => orderFilter === "ALL" || o.fulfillmentStatus === orderFilter || o.paymentStatus === orderFilter);
  const websiteRevenue = storefrontOrders.filter(o => o.source === "own_website").reduce((a, o) => a + Number(o.totalAmountInr), 0);
  const shopifyRevenue = storefrontOrders.filter(o => o.source === "shopify_sync").reduce((a, o) => a + Number(o.totalAmountInr), 0);
  const totalCampRevenue = campaigns.reduce((a, c) => a + Number(c.revenueGeneratedInr || 0), 0);
  const totalImpressions = campaigns.reduce((a, c) => a + (c.impressions || 0), 0);

  const NAV: { id: Tab; icon: React.ElementType; label: string; badge?: string }[] = [
    { id: "overview", icon: Activity, label: "Overview", badge: "LIVE" },
    { id: "shopify", icon: Store, label: "Shopify Sync", badge: shopifyConnected ? "CONNECTED" : "SETUP" },
    { id: "website-orders", icon: Package, label: "Website Orders", badge: String(storefrontOrders.length) },
    { id: "marketing", icon: Megaphone, label: "Campaigns", badge: String(campaigns.length) },
    { id: "engine", icon: Database, label: "AI Engine", badge: totalProducts > 0 ? `${totalProducts.toLocaleString()} SKUs` : "Setup" },
  ];

  return (
    <div className="radar-grid-bg min-h-screen flex flex-col md:flex-row">
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md max-w-sm ${toast.type === "w" ? "border-amber-500/40 bg-slate-950/95 text-amber-300" : toast.type === "i" ? "border-sky-500/40 bg-slate-950/95 text-sky-300" : "border-emerald-500/40 bg-slate-950/95 text-emerald-300"}`}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-mono text-xs font-semibold">{toast.msg}</span>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-full md:w-[240px] shrink-0 border-b md:border-b-0 md:border-r border-slate-800/80 bg-slate-950/95 flex flex-col">
        <div className="border-b border-slate-800/80 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-sm">B</div>
            <div>
              <span className="font-heading text-sm font-bold text-slate-100">BHARAT<span className="text-orange-400">DROP</span></span>
              <div className="font-mono text-[9px] text-slate-500">AGENT DASHBOARD</div>
            </div>
          </div>
          <Link href="/store" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2 py-1">
            <Globe className="h-3 w-3" />Store
          </Link>
        </div>

        <div className="p-3 space-y-1 flex-1">
          {NAV.map(nav => {
            const Icon = nav.icon;
            const active = tab === nav.id;
            return (
              <button key={nav.id} onClick={() => setTab(nav.id)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${active ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`}>
                <span className="flex items-center gap-2.5"><Icon className={`h-4 w-4 ${active ? "text-orange-400" : "text-slate-500"}`} />{nav.label}</span>
                {nav.badge && <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${active ? "bg-orange-500/20 text-orange-300" : "bg-slate-900 text-slate-500"}`}>{nav.badge}</span>}
              </button>
            );
          })}

          <div className="border-t border-slate-800/60 mt-4 pt-4 space-y-1.5">
            <Link href="/" className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-slate-200">
              <Layers className="h-4 w-4 text-slate-500" />Operator Panel
            </Link>
            <Link href="/store" className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-emerald-300">
              <Globe className="h-4 w-4 text-slate-500" />Live Storefront →
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="border-t border-slate-800/80 p-3 space-y-1.5">
          <button onClick={runBulkSeed} disabled={seeding} className="w-full flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50">
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}Seed 1000+ Products
          </button>
          <button onClick={runDailyRefresh} disabled={refreshing} className="w-full flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-orange-400 disabled:opacity-50">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Daily AI Refresh
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-5 backdrop-blur-md">
          <span className="font-heading text-sm font-bold text-slate-100">
            {tab === "overview" && "AGENT COMMAND OVERVIEW"}
            {tab === "shopify" && "SHOPIFY INTEGRATION & SYNC AGENT"}
            {tab === "website-orders" && "OWN WEBSITE ORDERS & FULFILLMENT"}
            {tab === "marketing" && "AI MARKETING CAMPAIGN CENTER"}
            {tab === "engine" && "AI ENGINE CONTROL ROOM"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </button>
            <Link href="/store" target="_blank" className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">
              <Globe className="h-3.5 w-3.5" />Live Store
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="h-10 w-10 text-orange-400 animate-spin" />
              <p className="font-heading text-sm text-slate-300">Loading agent dashboard...</p>
            </div>
          ) : (
            <>
              {/* ── OVERVIEW ── */}
              {tab === "overview" && (
                <div className="space-y-5">
                  {/* Strategy Recommendation Banner */}
                  <div className="rounded-2xl bg-gradient-to-r from-orange-900/40 via-pink-900/30 to-purple-900/30 border border-orange-500/30 p-5">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl shrink-0">🎯</div>
                      <div>
                        <h2 className="font-heading text-lg font-bold text-slate-100 mb-1">AI Recommendation: Launch Your Own Website First</h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                          <strong className="text-orange-400">Own Website = 100% profit margin keep karo.</strong> Meesho/Flipkart 8–12% commission lete hain. Apni website pe koi commission nahi — har ₹1000 ka order pe ₹80–120 extra bachta hai. Shopify ke saath sync karo for extra reach, but own website is your <strong className="text-emerald-400">primary money machine.</strong>
                        </p>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          {[["Own Website", "0% commission\nFull brand control\nDirect customer data\nHigher LTV"], ["Shopify India", "2% + Shopify fee\nBrand presence\nGreat UI/theme\nEasy to add"], ["Meesho/Flipkart", "0–12% commission\nHigh traffic\nNo brand control\nPricing wars"]].map(([title, details]) => (
                            <div key={title} className={`rounded-xl border p-3 text-xs ${title === "Own Website" ? "border-emerald-500/40 bg-emerald-950/30" : title === "Shopify India" ? "border-sky-500/30 bg-sky-950/20" : "border-slate-700 bg-slate-900/60"}`}>
                              <div className={`font-bold text-sm mb-1.5 ${title === "Own Website" ? "text-emerald-400" : title === "Shopify India" ? "text-sky-400" : "text-slate-300"}`}>{title}{title === "Own Website" && " ✓ BEST"}</div>
                              {details.split("\n").map(d => <div key={d} className="text-slate-400 py-0.5">• {d}</div>)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* KPI Row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Own Website Revenue", val: fmt(websiteRevenue), sub: `${storefrontOrders.filter(o => o.source === "own_website").length} orders`, c: "text-emerald-400", border: "border-emerald-500/30" },
                      { label: "Shopify Sync Revenue", val: fmt(shopifyRevenue), sub: `${storefrontOrders.filter(o => o.source === "shopify_sync").length} orders`, c: "text-sky-400", border: "border-sky-500/30" },
                      { label: "Campaign Revenue", val: fmt(totalCampRevenue), sub: `${campaigns.length} live campaigns`, c: "text-pink-400", border: "border-pink-500/30" },
                      { label: "Total Products", val: totalProducts.toLocaleString(), sub: "AI-scored & daily refreshed", c: "text-orange-400", border: "border-orange-500/30" },
                    ].map(({ label, val, sub, c, border }) => (
                      <div key={label} className={`rounded-xl border ${border} bg-slate-900/70 p-4`}>
                        <div className="font-mono text-[10px] text-slate-400 mb-2">{label}</div>
                        <div className={`font-mono text-2xl font-bold ${c}`}>{val}</div>
                        <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Setup Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                      <h3 className="font-heading text-sm font-bold text-slate-100 mb-4 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Setup Checklist</h3>
                      <div className="space-y-3">
                        {[
                          { done: totalProducts > 0, label: "Seed 1000+ products into catalog", action: () => runBulkSeed(), actionLabel: "Seed Now" },
                          { done: storefrontOrders.length > 0, label: "Own website storefront live", action: () => setTab("website-orders"), actionLabel: "View Orders" },
                          { done: shopifyConnected, label: "Shopify store connected", action: () => setTab("shopify"), actionLabel: shopifyConnected ? "Manage" : "Connect" },
                          { done: campaigns.length > 0, label: "Marketing campaigns running", action: () => generateCampaign(), actionLabel: "Generate" },
                          { done: refreshLogs.length > 0, label: "Daily AI refresh configured", action: () => runDailyRefresh(), actionLabel: "Run Now" },
                        ].map(({ done, label, action, actionLabel }) => (
                          <div key={label} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${done ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-600"}`}>{done ? "✓" : "○"}</div>
                              <span className={`text-xs ${done ? "text-slate-300 line-through" : "text-slate-200"}`}>{label}</span>
                            </div>
                            {!done && <button onClick={action} className="shrink-0 rounded-lg bg-orange-500/20 border border-orange-500/30 px-2.5 py-1 text-[10px] font-bold text-orange-400 hover:bg-orange-500/30">{actionLabel}</button>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Activity Stream */}
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                      <h3 className="font-heading text-sm font-bold text-slate-100 mb-4 flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" />AI Agent Live Stream</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {activityLogs.slice(0, 8).map(log => (
                          <div key={log.id} className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-mono text-[9px] font-bold text-emerald-400 truncate max-w-[160px]">{log.agentName}</span>
                              {Number(log.profitImpactInr) > 0 && <span className="font-mono text-[9px] font-bold text-emerald-400 shrink-0">+{fmt(log.profitImpactInr)}</span>}
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug">{log.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SHOPIFY SYNC ── */}
              {tab === "shopify" && (
                <div className="space-y-5">

                  {/* ── CURRENT STATUS CARD ── */}
                  <div className={`rounded-2xl border p-5 ${shopifyConnected ? "border-emerald-500/40 bg-emerald-950/20" : shopifyStatus?.diagnosis?.issues?.length ? "border-red-500/40 bg-red-950/15" : "border-amber-500/30 bg-amber-950/20"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl">{shopifyConnected ? "✅" : "❌"}</div>
                        <div>
                          <h2 className="font-heading text-lg font-bold text-slate-100">
                            {shopifyConnected ? "Shopify Connected & Ready" : "Shopify Not Connected — Action Required"}
                          </h2>
                          <p className="text-sm text-slate-400 mt-0.5">Store: {shopifyStatus?.shopifyStoreUrl || "not set"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-3 py-1.5 font-mono text-xs font-bold ${shopifyConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {shopifyStatus?.tokenType || "NO TOKEN"}
                        </span>
                        <button onClick={testShopifyConnection} disabled={testingConnection}
                          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white hover:bg-orange-400 disabled:opacity-60">
                          {testingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          {testingConnection ? "Testing..." : "Test Connection"}
                        </button>
                      </div>
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`rounded-xl border p-4 mb-4 ${testResult.connected ? "border-emerald-500/40 bg-emerald-950/30" : "border-red-500/40 bg-red-950/20"}`}>
                        {testResult.connected ? (
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">🎉</span>
                            <div>
                              <div className="font-bold text-emerald-400">Successfully connected to "{testResult.shopName}"!</div>
                              <div className="text-xs text-slate-400 mt-0.5">You can now push products, sync prices and pull orders.</div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-5 w-5 text-red-400" />
                              <span className="font-bold text-red-400 text-sm">Connection Failed</span>
                            </div>
                            <div className="font-mono text-xs text-red-300 bg-red-950/40 rounded-lg p-2 mb-2">{testResult.error}</div>
                            {testResult.diagnosis?.fixes?.map((fix, i) => (
                              <div key={i} className="text-xs text-slate-300 flex gap-2 mt-1.5">
                                <span className="text-orange-400 shrink-0">→</span><span>{fix}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── WHY IT'S FAILING — EXACT DIAGNOSIS ── */}
                  {shopifyStatus && !shopifyConnected && (
                    <div className="rounded-2xl border border-red-500/30 bg-slate-900/80 p-6 space-y-5">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                        <h3 className="font-heading text-base font-bold text-red-300">Why Your Shopify Isn't Working — Exact Diagnosis</h3>
                      </div>

                      {shopifyStatus.diagnosis?.issues?.map((issue, i) => (
                        <div key={i} className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                          <div className="flex items-start gap-2.5">
                            <span className="text-lg shrink-0">🔴</span>
                            <div>
                              <div className="font-bold text-red-300 text-sm mb-1">Problem {i+1}:</div>
                              <div className="text-slate-200 text-sm">{issue}</div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* THE FIX — Step by Step */}
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-xl">🔧</span>
                          <h4 className="font-heading text-sm font-bold text-emerald-300">How to Fix — Step by Step (2 Minutes)</h4>
                        </div>

                        <div className="space-y-4">
                          {[
                            {
                              n: "1",
                              title: "Open Shopify Admin → Settings → Apps and sales channels",
                              detail: "Go to your Shopify Admin (admin.shopify.com). Click Settings (bottom left) → Apps and sales channels.",
                              img: "🛒"
                            },
                            {
                              n: "2",
                              title: "Click 'Develop apps' → 'Create an app'",
                              detail: "Click 'Develop apps' button at top right. Then 'Allow custom app development' if prompted. Then click 'Create an app'. Name it 'BharatDrop Sync'.",
                              img: "⚙️"
                            },
                            {
                              n: "3",
                              title: "Set Admin API Scopes — give these permissions",
                              detail: "Click 'Configure Admin API scopes'. Enable: write_products, read_products, write_orders, read_orders, write_inventory, read_inventory, read_locations. Click Save.",
                              img: "🔑"
                            },
                            {
                              n: "4",
                              title: "Install the app → Copy the Admin API access token",
                              detail: "Click 'Install app' button. On the API credentials tab, you'll see 'Admin API access token'. Click 'Reveal token once'. It starts with shpat_ — copy it now (shown only once!).",
                              img: "📋"
                            },
                            {
                              n: "5",
                              title: "Update your .env file with the correct values",
                              detail: "Replace both values in your .env file and save. The token MUST start with shpat_",
                              img: "📝"
                            },
                          ].map(({ n, title, detail, img }) => (
                            <div key={n} className="flex gap-4">
                              <div className="shrink-0 h-8 w-8 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 font-black text-sm flex items-center justify-center">{n}</div>
                              <div className="flex-1">
                                <div className="font-bold text-slate-100 text-sm flex items-center gap-2 mb-1">
                                  <span>{img}</span>{title}
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">{detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Correct .env format */}
                        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs font-bold text-slate-400 uppercase">Your .env file should look like this:</span>
                          </div>
                          <div className="font-mono text-sm space-y-1.5">
                            <div className="text-slate-400">DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db</div>
                            <div className="text-slate-500">{"# ↓↓ Replace these with your real values ↓↓"}</div>
                            <div className="text-emerald-400 font-bold">SHOPIFY_ADMIN_TOKEN=shpat_<span className="text-orange-400">xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span></div>
                            <div className="text-emerald-400 font-bold">SHOPIFY_STORE_URL=veloraskart.myshopify.com</div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-3 py-1 text-[11px] font-bold text-red-400">
                              ❌ WRONG: 2110966a225cc423827675d5755682b8 (old private app password)
                            </div>
                            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-3 py-1 text-[11px] font-bold text-emerald-400">
                              ✅ CORRECT: shpat_ab12cd34... (custom app token)
                            </div>
                          </div>
                        </div>

                        {/* Video/screenshot guide note */}
                        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-950/20 p-3.5 flex items-start gap-3">
                          <span className="text-xl shrink-0">💡</span>
                          <div className="text-xs text-slate-300 leading-relaxed">
                            <strong className="text-sky-300">Current token {shopifyStatus.tokenPreview} is a 32-character hex string</strong> — this is the old Private App password format. Shopify stopped creating new Private Apps in January 2022. You need to create a <strong>Custom App</strong> instead to get a valid <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-400">shpat_...</code> token.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── SYNC ACTIONS (enabled only when connected) ── */}
                  <div>
                    <h3 className="font-heading text-sm font-bold text-slate-100 mb-3">
                      {shopifyConnected ? "Shopify Sync Actions" : "Sync Actions (connect Shopify first to activate)"}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { action: "PRODUCT_PUSH", icon: "📤", title: "Push Products to Shopify", desc: "Top 50 AI-scored products auto-publish on Shopify with prices, images, descriptions, and inventory" },
                        { action: "PRICE_UPDATE", icon: "💰", title: "Sync Prices (INR→USD @₹84)", desc: "Update all Shopify variant prices from latest INR data with current exchange rate" },
                        { action: "ORDER_PULL", icon: "📥", title: "Pull Shopify Orders", desc: "Import open Shopify orders into your fulfillment pipeline for Delhivery dispatch" },
                        { action: "INVENTORY_SYNC", icon: "📦", title: "Inventory Sync", desc: "Push live supplier stock counts to Shopify to prevent overselling" },
                      ].map(({ action, icon, title, desc }) => (
                        <button key={action}
                          onClick={() => shopifyConnected ? runShopifySync(action) : showToast("Connect Shopify first — fix the token and test connection", "w")}
                          disabled={syncing === action}
                          className={`text-left rounded-xl border p-4 transition-all ${shopifyConnected ? "border-slate-800/80 bg-slate-900/70 hover:border-orange-500/40" : "border-slate-800/40 bg-slate-900/30 opacity-60"}`}>
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-3xl">{icon}</span>
                            {syncing === action
                              ? <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
                              : shopifyConnected
                                ? <ArrowRight className="h-5 w-5 text-slate-500" />
                                : <span className="text-[10px] font-bold text-slate-600 border border-slate-700 rounded px-1.5 py-0.5">LOCKED</span>
                            }
                          </div>
                          <h4 className="font-heading text-sm font-bold text-slate-100 mb-1">{title}</h4>
                          <p className="text-xs text-slate-400">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── SYNC LOG ── */}
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                    <h3 className="font-heading text-sm font-bold text-slate-100 mb-4">Sync History</h3>
                    {syncLogs.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 text-sm">No sync history yet.</div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {syncLogs.map(log => (
                          <div key={log.id} className={`rounded-lg border p-3 flex items-start gap-3 ${log.status === "FAILED" ? "border-red-500/20 bg-red-950/10" : log.status === "SUCCESS" ? "border-emerald-500/20 bg-emerald-950/10" : "border-slate-800 bg-slate-950/70"}`}>
                            <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold shrink-0 ${statusBadge(log.status)}`}>{log.status}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-mono text-[10px] font-bold text-orange-400">{log.syncType}</span>
                                <span className="font-mono text-[10px] text-slate-500">{log.itemsSynced} items</span>
                              </div>
                              <p className="text-xs text-slate-300">{log.message}</p>
                              {log.errorDetail && <p className="text-[10px] text-red-400 mt-0.5 font-mono">{log.errorDetail}</p>}
                            </div>
                            <span className="font-mono text-[9px] text-slate-500 shrink-0">{new Date(log.syncedAt).toLocaleTimeString("en-IN")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── WEBSITE ORDERS ── */}
              {tab === "website-orders" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[["Total Orders", storefrontOrders.length, "text-slate-100"], ["Website Revenue", fmt(websiteRevenue), "text-emerald-400"], ["Pending", storefrontOrders.filter(o => o.fulfillmentStatus === "Received").length, "text-amber-400"], ["Delivered", storefrontOrders.filter(o => o.fulfillmentStatus === "Delivered").length, "text-emerald-400"]].map(([l, v, c]) => (
                      <div key={String(l)} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3.5 text-center">
                        <div className="font-mono text-[10px] text-slate-400 mb-1">{l}</div>
                        <div className={`font-mono text-xl font-bold ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {["ALL", "Received", "Processing", "Shipped", "Delivered"].map(s => (
                      <button key={s} onClick={() => setOrderFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${orderFilter === s ? "bg-orange-500 text-white" : "bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700"}`}>{s}</button>
                    ))}
                  </div>

                  {filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-20 text-center">
                      <ShoppingBag className="h-14 w-14 text-slate-600 mb-4" />
                      <h4 className="font-heading text-lg font-bold text-slate-300">No orders yet</h4>
                      <p className="text-sm text-slate-500 mt-1">Share your storefront link and orders will appear here.</p>
                      <Link href="/store" target="_blank" className="mt-5 flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-400"><Globe className="h-4 w-4" />Open Your Store</Link>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/70">
                      <table className="w-full text-left text-xs min-w-[900px]">
                        <thead className="border-b border-slate-800 bg-slate-950/80 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                          <tr>{["Order Ref", "Customer", "Product", "Qty", "Total", "Payment", "Status", "Source", "Action"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredOrders.map(o => (
                            <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-3 py-3 font-mono font-bold text-slate-100">{o.orderRef}</td>
                              <td className="px-3 py-3"><div className="font-semibold text-slate-200">{o.customerName}</div><div className="text-[10px] text-slate-400">{o.customerCity}, {o.customerState}</div></td>
                              <td className="px-3 py-3 text-slate-300 max-w-[160px] line-clamp-1 text-[11px]">{o.productTitle}</td>
                              <td className="px-3 py-3 font-mono text-slate-200">{o.quantity}</td>
                              <td className="px-3 py-3 font-mono font-bold text-emerald-400">{fmt(o.totalAmountInr)}</td>
                              <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${statusBadge(o.paymentStatus)}`}>{o.paymentMode} {o.paymentStatus}</span></td>
                              <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${statusBadge(o.fulfillmentStatus)}`}>{o.fulfillmentStatus}</span></td>
                              <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-[9px] font-bold ${platformBadge(o.source)}`}>{o.source === "own_website" ? "🌐 Website" : "🛒 Shopify"}</span></td>
                              <td className="px-3 py-3">
                                {updatingOrder === o.id ? <Loader2 className="h-4 w-4 text-orange-400 animate-spin" /> : (
                                  <div className="flex gap-1">
                                    {o.fulfillmentStatus === "Received" && <button onClick={() => advanceOrderStatus(o.id, "Processing")} className="rounded bg-amber-500/20 px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/30">Process</button>}
                                    {o.fulfillmentStatus === "Processing" && <button onClick={() => advanceOrderStatus(o.id, "Shipped")} className="rounded bg-sky-500/20 px-2 py-1 text-[9px] font-bold text-sky-400 hover:bg-sky-500/30">Ship</button>}
                                    {o.fulfillmentStatus === "Shipped" && <button onClick={() => advanceOrderStatus(o.id, "Delivered")} className="rounded bg-emerald-500/20 px-2 py-1 text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/30">Delivered</button>}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── MARKETING ── */}
              {tab === "marketing" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[["Live Campaigns", campaigns.length, "text-slate-100"], ["Total Impressions", fmtK(totalImpressions), "text-sky-400"], ["Campaign Revenue", fmt(totalCampRevenue), "text-emerald-400"], ["Avg ROAS", `${campaigns.length > 0 ? (campaigns.reduce((a, c) => a + Number(c.estimatedRoas), 0) / campaigns.length).toFixed(1) : "0"}x`, "text-orange-400"]].map(([l, v, c]) => (
                      <div key={String(l)} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-3.5 text-center">
                        <div className="font-mono text-[10px] text-slate-400 mb-1">{l}</div>
                        <div className={`font-mono text-xl font-bold ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
                    <div><h3 className="font-heading text-sm font-bold text-slate-100">AI Marketing Campaigns</h3><p className="text-xs text-slate-400">Auto-generated for WhatsApp, Reels, Facebook, Google, SMS, YouTube</p></div>
                    <button onClick={generateCampaign} disabled={generatingCamp} className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400">
                      {generatingCamp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}{generatingCamp ? "Generating..." : "AI Generate Campaign"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {campaigns.map(c => {
                      const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={c.id} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`rounded px-2 py-0.5 text-[9px] font-bold ${platformBadge(c.platform)}`}>{c.platform}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{c.campaignType}</span>
                            <span className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${statusBadge(c.status)}`}>{c.status}</span>
                          </div>
                          <h4 className="font-heading text-xs font-bold text-slate-100 line-clamp-2 mb-2">{c.headline}</h4>
                          <p className="text-[10px] text-slate-400 line-clamp-1 mb-3">{c.productTitle}</p>
                          <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-slate-950/80 p-2 text-center text-[9px] mb-2">
                            <div><div className="text-slate-500">Imp.</div><div className="font-mono font-bold text-slate-200">{fmtK(c.impressions)}</div></div>
                            <div><div className="text-slate-500">Clicks</div><div className="font-mono font-bold text-sky-400">{fmtK(c.clicks)}</div></div>
                            <div><div className="text-slate-500">CTR</div><div className="font-mono font-bold text-emerald-400">{ctr}%</div></div>
                            <div><div className="text-orange-400">Rev.</div><div className="font-mono font-bold text-orange-400">{fmt(c.revenueGeneratedInr)}</div></div>
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Budget: {fmt(c.budgetInr)}</span>
                            <span className="text-emerald-400 font-semibold font-mono">ROAS {c.estimatedRoas}x</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ENGINE ── */}
              {tab === "engine" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { icon: "📦", title: "Seed 1000+ Products", desc: "Full Indian dropshipping catalog generate karo with AI scores", action: runBulkSeed, loading: seeding, label: seeding ? "Seeding..." : "Run Seed", color: "border-emerald-500/30 hover:bg-emerald-500/5" },
                      { icon: "🔄", title: "Daily AI Refresh", desc: "Recalculate all prices, scores, viral velocity + generate campaigns", action: runDailyRefresh, loading: refreshing, label: refreshing ? "Refreshing..." : "Run Refresh", color: "border-orange-500/30 hover:bg-orange-500/5" },
                      { icon: "📣", title: "Generate Campaign", desc: "AI creates fresh ad copy for top-scoring products on all 7 channels", action: generateCampaign, loading: generatingCamp, label: generatingCamp ? "Generating..." : "Generate", color: "border-pink-500/30 hover:bg-pink-500/5" },
                    ].map(({ icon, title, desc, action, loading: l, label, color }) => (
                      <button key={title} onClick={action} disabled={l} className={`text-left rounded-xl border ${color} bg-slate-900/70 p-5 transition-all disabled:opacity-50`}>
                        <div className="text-3xl mb-3">{icon}</div>
                        <h4 className="font-heading text-sm font-bold text-slate-100 mb-1.5">{title}</h4>
                        <p className="text-xs text-slate-400 mb-3">{desc}</p>
                        <div className="flex items-center gap-2 text-xs font-bold text-orange-400">
                          {l && <Loader2 className="h-4 w-4 animate-spin" />}{label} →
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[["Catalog SKUs", totalProducts.toLocaleString(), "text-emerald-400"], ["Campaigns", campaigns.length, "text-pink-400"], ["Refresh Runs", refreshLogs.length, "text-orange-400"], ["Sync Actions", syncLogs.length, "text-sky-400"]].map(([l, v, c]) => (
                      <div key={String(l)} className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-4 text-center">
                        <div className="font-mono text-[10px] text-slate-400 mb-1">{l}</div>
                        <div className={`font-mono text-2xl font-bold ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {refreshLogs.length > 0 && (
                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5">
                      <h3 className="font-heading text-sm font-bold text-slate-100 mb-4">Daily Refresh History</h3>
                      <div className="space-y-3">
                        {refreshLogs.map(log => (
                          <div key={log.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="font-mono text-[10px] text-emerald-400">{new Date(log.runAt).toLocaleString("en-IN")}</div>
                              <span className={`rounded-full font-mono text-[9px] px-2 py-0.5 ${statusBadge(log.status)}`}>{log.status}</span>
                            </div>
                            <p className="text-xs text-slate-300">{log.agentSummary}</p>
                            <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
                              <div><div className="text-slate-400">Updated</div><div className="font-mono font-bold text-slate-200">{log.totalProductsUpdated}</div></div>
                              <div><div className="text-slate-400">Added</div><div className="font-mono font-bold text-slate-200">{log.totalProductsAdded}</div></div>
                              <div><div className="text-slate-400">Avg Score</div><div className="font-mono font-bold text-orange-400">{log.avgAiScore}</div></div>
                              <div><div className="text-emerald-400">Top Cat.</div><div className="font-mono font-bold text-emerald-400 truncate">{log.topCategory.split(" ")[0]}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

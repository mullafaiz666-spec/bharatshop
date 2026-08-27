"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, Search, Star, Truck, Shield, RefreshCw, Zap,
  ChevronRight, X, Plus, Minus, Package, CheckCircle2, Phone,
  MapPin, IndianRupee, Sparkles, Flame, Tag, ArrowRight, Filter,
  Heart, Share2, Eye, BadgeCheck, Clock, Loader2,
} from "lucide-react";
import Link from "next/link";

interface Product {
  id: number; sku: string; title: string; category: string; imageUrl: string;
  brand: string; sellingPriceInr: string; mrpInr: string; netProfitInr: string;
  aiScore: number; viralVelocityScore: number; stockCount: number;
  aiMarketingCopy: string; aiTargetAudience: string; salesCount24h: number;
  customMarginPct: string; supplierCostInr: string;
}
interface CartProd { product: Product; qty: number; }

const fmt = (n: number | string) => `₹${Number(n).toLocaleString("en-IN")}`;
const disc = (mrp: string, sell: string) => Math.round(((Number(mrp) - Number(sell)) / Number(mrp)) * 100);

const CATS = ["ALL", "Electronics & Gadgets", "Wearables & Watches", "Women's Fashion", "Men's Fashion", "Beauty & Skincare", "Kitchen & Dining", "Sports & Fitness", "Personal Care & Grooming", "Smart Home", "Baby & Kids", "Health & Nutrition"];

// ── ORDER FORM MODAL ─────────────────────────────────────────────────────────
function OrderModal({ product, qty, onClose, onOrdered }: {
  product: Product; qty: number; onClose: () => void; onOrdered: (ref: string) => void;
}) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); const [address, setAddress] = useState("");
  const [city, setCity] = useState(""); const [state, setState] = useState("Maharashtra");
  const [pincode, setPincode] = useState(""); const [payMode, setPayMode] = useState("COD");
  const [placing, setPlacing] = useState(false);
  const total = Number(product.sellingPriceInr) * qty;

  const STATES = ["Andhra Pradesh","Assam","Bihar","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Odisha","Punjab","Rajasthan","Tamil Nadu","Telangana","Uttar Pradesh","Uttarakhand","West Bengal"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setPlacing(true);
    try {
      const res = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: name, customerEmail: email, customerPhone: phone, customerAddress: address, customerCity: city, customerState: state, customerPincode: pincode, productId: product.id, quantity: qty, paymentMode: payMode }),
      });
      const d = await res.json();
      if (res.ok) onOrdered(d.ref);
    } finally { setPlacing(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Complete Your Order</h2>
            <p className="text-orange-100 text-xs">{product.title.slice(0, 45)}... × {qty}</p>
          </div>
          <div className="text-right">
            <div className="text-white font-bold text-lg">{fmt(total)}</div>
            <div className="text-orange-100 text-xs">{payMode === "COD" ? "Pay on Delivery" : "Online Payment"}</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label><input required value={name} onChange={e => setName(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="Rahul Kumar" /></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Phone *</label><input required value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="9876543210" /></div>
          </div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label><input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="you@email.com" /></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Delivery Address *</label><input required value={address} onChange={e => setAddress(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="House No, Street, Area" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">City *</label><input required value={city} onChange={e => setCity(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="Mumbai" /></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">State</label><select value={state} onChange={e => setState(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-2 text-xs focus:outline-none">{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Pincode *</label><input required value={pincode} onChange={e => setPincode(e.target.value)} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:border-orange-400 focus:outline-none" placeholder="400001" /></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {[["COD", "Cash on Delivery", "₹0 extra"], ["UPI", "UPI / Card / Netbanking", "Instant Confirmation"]].map(([val, label, sub]) => (
                <button key={val} type="button" onClick={() => setPayMode(val)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${payMode === val ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className={`text-sm font-bold ${payMode === val ? "text-orange-600" : "text-gray-700"}`}>{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-sm">
            <div className="flex items-center justify-between font-bold text-gray-800">
              <span>Order Total</span><span className="text-orange-600 text-lg">{fmt(total)}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">Free delivery • GST included • Easy returns</div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={placing} className="flex-2 flex-grow-[2] h-11 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold text-sm hover:opacity-90 flex items-center justify-center gap-2">
              {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {placing ? "Placing Order..." : "Place Order Now"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SUCCESS MODAL ─────────────────────────────────────────────────────────────
function SuccessModal({ orderRef, onClose }: { orderRef: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Placed! 🎉</h2>
        <p className="text-gray-500 text-sm mb-4">Your order has been confirmed. Our AI agent will auto-arrange delivery within 24 hours.</p>
        <div className="bg-orange-50 rounded-xl p-4 mb-5">
          <div className="text-xs text-gray-400 mb-1">Your Order Reference</div>
          <div className="font-mono text-lg font-bold text-orange-600">{orderRef}</div>
        </div>
        <div className="space-y-2 text-left mb-5">
          {[["📦", "Packaging & dispatch: 1–2 days"], ["🚚", "Delivery: 3–6 working days"], ["📱", "Tracking SMS sent on dispatch"], ["↩️", "Easy 7-day return policy"]].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-2 text-sm text-gray-600"><span>{icon}</span><span>{text}</span></div>
          ))}
        </div>
        <button onClick={onClose} className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold hover:opacity-90">Continue Shopping</button>
      </div>
    </div>
  );
}

// ── PRODUCT DETAIL MODAL ──────────────────────────────────────────────────────
function ProductModal({ product, onClose, onAddToCart }: { product: Product; onClose: () => void; onAddToCart: (p: Product, qty: number) => void; }) {
  const [qty, setQty] = useState(1);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderRef, setOrderRef] = useState("");
  const discount = disc(product.mrpInr, product.sellingPriceInr);
  const inStock = product.stockCount > 0;

  if (orderRef) return <SuccessModal orderRef={orderRef} onClose={() => { setOrderRef(""); onClose(); }} />;
  if (orderOpen) return <OrderModal product={product} qty={qty} onClose={() => setOrderOpen(false)} onOrdered={(ref) => { setOrderOpen(false); setOrderRef(ref); }} />;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="relative">
          <img src={product.imageUrl} alt={product.title} className="w-full h-56 sm:h-72 object-cover" />
          <button onClick={onClose} className="absolute top-4 right-4 h-9 w-9 bg-white/90 rounded-full flex items-center justify-center shadow-lg"><X className="h-5 w-5 text-gray-700" /></button>
          {discount > 0 && <span className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{discount}% OFF</span>}
          {product.viralVelocityScore >= 92 && <span className="absolute bottom-4 left-4 bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"><Flame className="h-3 w-3" />Trending</span>}
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">{product.brand}</span>
              <span className="text-gray-400 text-xs">{product.category}</span>
              <span className="ml-auto flex items-center gap-1 text-xs text-gray-400"><Eye className="h-3 w-3" />{product.salesCount24h * 12} viewing</span>
            </div>
            <h2 className="text-lg font-bold text-gray-800 leading-snug">{product.title}</h2>
          </div>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-orange-600">{fmt(product.sellingPriceInr)}</span>
            <span className="text-gray-400 line-through text-lg">{fmt(product.mrpInr)}</span>
            {discount > 0 && <span className="text-green-600 font-bold text-sm">Save {fmt(Number(product.mrpInr) - Number(product.sellingPriceInr))}</span>}
          </div>
          <div className="flex items-center gap-4 text-sm">
            {[4, 4, 5, 4, 5].map((r, i) => <Star key={i} className={`h-4 w-4 ${r >= 4 ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />)}
            <span className="text-gray-500">4.4 (2,847 reviews)</span>
            <span className={`ml-auto font-semibold ${inStock ? "text-green-600" : "text-red-500"}`}>{inStock ? `✓ In Stock (${product.stockCount} units)` : "Out of Stock"}</span>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 leading-relaxed">{product.aiMarketingCopy}</div>
          <div className="grid grid-cols-3 gap-3">
            {[["🚚", "Free Delivery", "3–6 Days"], ["↩️", "Easy Returns", "7 Days"], ["✅", "Genuine Product", "100% Original"]].map(([icon, title, sub]) => (
              <div key={title} className="text-center rounded-xl bg-blue-50 p-3">
                <div className="text-xl mb-1">{icon}</div>
                <div className="font-bold text-gray-700 text-xs">{title}</div>
                <div className="text-gray-400 text-[10px]">{sub}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-700">Quantity:</span>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center font-bold text-gray-800">{qty}</span>
              <button onClick={() => setQty(q => Math.min(10, q + 1))} className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 text-gray-700"><Plus className="h-4 w-4" /></button>
            </div>
            <span className="text-sm text-gray-500">Total: <span className="font-bold text-gray-800">{fmt(Number(product.sellingPriceInr) * qty)}</span></span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onAddToCart(product, qty)} className="h-12 rounded-xl border-2 border-orange-400 text-orange-600 font-bold hover:bg-orange-50 flex items-center justify-center gap-2"><ShoppingCart className="h-5 w-5" />Add to Cart</button>
            <button disabled={!inStock} onClick={() => setOrderOpen(true)} className="h-12 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"><Zap className="h-5 w-5" />Buy Now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN STOREFRONT ───────────────────────────────────────────────────────────
export default function StorefrontPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("aiScore");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [cart, setCart] = useState<CartProd[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [orderRef, setOrderRef] = useState("");
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});

  const fetchProducts = useCallback(async (p = 1, cat = category, q = search, s = sort) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "24", category: cat, search: q, sort: s });
      const res = await fetch(`/api/storefront/products?${params}`);
      const d = await res.json();
      setProducts(d.products || []);
      setTotalPages(d.totalPages || 1);
      setTotalProducts(d.total || 0);
      if (d.categoryCount) setCatCounts(d.categoryCount);
    } finally { setLoading(false); }
  }, [category, search, sort]);

  const fetchFeatured = async () => {
    const res = await fetch("/api/storefront/products?featured=true&limit=8&sort=popular");
    const d = await res.json();
    setFeatured(d.products || []);
  };

  useEffect(() => { fetchProducts(1); fetchFeatured(); }, []);

  const addToCart = (product: Product, qty = 1) => {
    setCart(prev => {
      const ex = prev.find(c => c.product.id === product.id);
      if (ex) return prev.map(c => c.product.id === product.id ? { ...c, qty: Math.min(10, c.qty + qty) } : c);
      return [...prev, { product, qty }];
    });
    setSelectedProduct(null);
  };

  const cartTotal = cart.reduce((a, c) => a + Number(c.product.sellingPriceInr) * c.qty, 0);
  const cartCount = cart.reduce((a, c) => a + c.qty, 0);

  function handleSearch(val: string) { setSearch(val); setPage(1); setTimeout(() => fetchProducts(1, category, val, sort), 300); }
  function handleCat(cat: string) { setCategory(cat); setPage(1); fetchProducts(1, cat, search, sort); }
  function handleSort(s: string) { setSort(s); setPage(1); fetchProducts(1, category, search, s); }
  function goPage(p: number) { setPage(p); fetchProducts(p); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (orderRef) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-pink-50 flex items-center justify-center">
      <SuccessModal orderRef={orderRef} onClose={() => setOrderRef("")} />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── NAVBAR ── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 gap-4">
          <Link href="/store" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">B</div>
            <span className="font-bold text-gray-800 text-lg">Bharat<span className="text-orange-500">Shop</span></span>
          </Link>
          <div className="flex-1 max-w-lg relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search products, brands..." value={search} onChange={e => handleSearch(e.target.value)}
              className="w-full h-10 bg-gray-100 rounded-xl pl-10 pr-4 text-sm border-2 border-transparent focus:border-orange-300 focus:bg-white focus:outline-none transition-all" />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-orange-500 transition-colors">
              <Sparkles className="h-4 w-4" />AI Dashboard
            </Link>
            <button onClick={() => setCartOpen(true)} className="relative flex items-center gap-2 bg-orange-500 text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-orange-600 transition-colors">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">{cartCount}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      {page === 1 && !search && category === "ALL" && (
        <section className="bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white py-14 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5 backdrop-blur-sm">
              <Zap className="h-4 w-4" />AI-Powered Dropshipping Store — {totalProducts.toLocaleString()}+ Products
            </div>
            <h1 className="text-3xl sm:text-5xl font-black leading-tight mb-4">
              India's Best Deals.<br />Delivered to Your Door.
            </h1>
            <p className="text-orange-100 text-base sm:text-lg max-w-xl mx-auto mb-8">
              Trending products, best prices, fast delivery across all India. COD available everywhere.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              {[["🚚", "Free Delivery"], ["💳", "COD Available"], ["↩️", "7-Day Returns"], ["🔒", "100% Secure"]].map(([icon, label]) => (
                <div key={label} className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2"><span>{icon}</span><span className="font-semibold">{label}</span></div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED TRENDING (only on first page, no filter) ── */}
      {page === 1 && !search && category === "ALL" && featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <div><h2 className="text-xl sm:text-2xl font-black text-gray-800 flex items-center gap-2"><Flame className="h-6 w-6 text-orange-500" />Trending Today</h2><p className="text-gray-400 text-sm">Hand-picked by AI. Updated every hour.</p></div>
            <button onClick={() => { setSort("popular"); fetchProducts(1, "ALL", "", "popular"); }} className="flex items-center gap-1 text-orange-500 font-semibold text-sm hover:underline">View All <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(p => {
              const d = disc(p.mrpInr, p.sellingPriceInr);
              return (
                <div key={p.id} onClick={() => setSelectedProduct(p)} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border border-gray-100 overflow-hidden">
                  <div className="relative h-40 overflow-hidden">
                    <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    {d > 0 && <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{d}% OFF</span>}
                    <span className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Flame className="h-2.5 w-2.5" />HOT</span>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] text-orange-500 font-bold mb-0.5">{p.brand}</div>
                    <p className="text-xs font-semibold text-gray-700 line-clamp-2 mb-2">{p.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-600 font-bold">{fmt(p.sellingPriceInr)}</span>
                      <span className="text-gray-300 line-through text-xs">{fmt(p.mrpInr)}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{p.salesCount24h * 8} sold today</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── MAIN CATALOG ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {/* Category filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          {CATS.map(cat => (
            <button key={cat} onClick={() => handleCat(cat)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${category === cat ? "bg-orange-500 text-white shadow-md shadow-orange-200" : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300"}`}>
              {cat === "ALL" ? `All (${totalProducts.toLocaleString()})` : `${cat.split(" ")[0]} (${catCounts[cat] || 0})`}
            </button>
          ))}
        </div>

        {/* Sort + count bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">{totalProducts.toLocaleString()} products {search && `for "${search}"`}</p>
          <select value={sort} onChange={e => handleSort(e.target.value)} className="h-9 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:border-orange-300">
            <option value="aiScore">Best Match</option>
            <option value="popular">Most Popular</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="newest">Newest First</option>
          </select>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 24 }).map((_, i) => <div key={i} className="rounded-2xl bg-gray-200 animate-pulse h-64" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-400">No products found</h3>
            <p className="text-gray-400 text-sm mt-1">Try a different search or category</p>
            <button onClick={() => { setSearch(""); setCategory("ALL"); fetchProducts(1, "ALL", "", sort); }} className="mt-4 px-5 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {products.map(p => {
              const d = disc(p.mrpInr, p.sellingPriceInr);
              return (
                <div key={p.id} onClick={() => setSelectedProduct(p)} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all cursor-pointer group border border-gray-100 overflow-hidden flex flex-col">
                  <div className="relative overflow-hidden">
                    <img src={p.imageUrl} alt={p.title} className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    {d > 0 && <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{d}% OFF</span>}
                    {p.viralVelocityScore >= 94 && <span className="absolute top-1.5 right-1.5 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">🔥</span>}
                  </div>
                  <div className="p-2.5 flex flex-col flex-1">
                    <div className="text-[9px] text-orange-500 font-bold mb-0.5">{p.brand}</div>
                    <p className="text-[11px] font-semibold text-gray-700 line-clamp-2 mb-1.5 flex-1">{p.title}</p>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-orange-600 font-bold text-sm">{fmt(p.sellingPriceInr)}</span>
                      <span className="text-gray-300 line-through text-[10px]">{fmt(p.mrpInr)}</span>
                    </div>
                    <div className="text-[9px] text-gray-400 flex items-center gap-1">
                      <Star className="h-2.5 w-2.5 text-yellow-400 fill-yellow-400" />4.4 • {p.salesCount24h * 5} sold
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button onClick={() => goPage(page - 1)} disabled={page === 1} className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40">‹</button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const n = page <= 4 ? i + 1 : page + i - 3;
              if (n < 1 || n > totalPages) return null;
              return <button key={n} onClick={() => goPage(n)} className={`h-10 w-10 rounded-xl text-sm font-semibold ${n === page ? "bg-orange-500 text-white shadow-md shadow-orange-200" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{n}</button>;
            })}
            <button onClick={() => goPage(page + 1)} disabled={page === totalPages} className="h-10 w-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40">›</button>
          </div>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
          <div><h3 className="text-white font-bold text-lg mb-3">Bharat<span className="text-orange-400">Shop</span></h3><p className="text-sm leading-relaxed">India's AI-powered dropshipping store. Best products, best prices, fast delivery pan-India.</p></div>
          <div><h4 className="text-white font-semibold mb-3">Quick Links</h4><div className="space-y-1.5 text-sm">{["Electronics", "Fashion", "Beauty", "Kitchen", "Sports"].map(l => <div key={l}><button onClick={() => handleCat(l)} className="hover:text-orange-400 transition-colors">{l}</button></div>)}</div></div>
          <div><h4 className="text-white font-semibold mb-3">Customer Support</h4><div className="space-y-2 text-sm"><div className="flex items-center gap-2"><Phone className="h-4 w-4" />1800-XXX-XXXX (Toll Free)</div><div className="flex items-center gap-2"><MapPin className="h-4 w-4" />Mumbai, Maharashtra</div><div>support@bharatshop.in</div></div></div>
        </div>
        <div className="border-t border-gray-800 pt-6 text-center text-xs text-gray-600">© 2026 BharatShop. All prices in INR incl. GST. AI-powered by BharatDrop Engine.</div>
      </footer>

      {/* ── CART SIDEBAR ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="w-full max-w-sm bg-white flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-orange-500" />Cart ({cartCount})</h3>
              <button onClick={() => setCartOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-5 w-5 text-gray-600" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-16"><ShoppingCart className="h-12 w-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400 font-semibold">Cart is empty</p><p className="text-gray-300 text-sm">Add products to get started</p></div>
              ) : cart.map(({ product: p, qty }) => (
                <div key={p.id} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                  <img src={p.imageUrl} alt={p.title} className="h-16 w-16 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 line-clamp-2">{p.title}</p>
                    <p className="text-orange-600 font-bold text-sm mt-1">{fmt(Number(p.sellingPriceInr) * qty)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => setCart(c => c.map(i => i.product.id === p.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))} className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs hover:bg-gray-200">-</button>
                      <span className="text-xs font-semibold">{qty}</span>
                      <button onClick={() => setCart(c => c.map(i => i.product.id === p.id ? { ...i, qty: Math.min(10, i.qty + 1) } : i))} className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-xs hover:bg-gray-200">+</button>
                      <button onClick={() => setCart(c => c.filter(i => i.product.id !== p.id))} className="ml-auto text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="border-t p-4 space-y-3">
                <div className="flex items-center justify-between font-bold text-gray-800 text-lg"><span>Total</span><span className="text-orange-600">{fmt(cartTotal)}</span></div>
                <p className="text-xs text-gray-400 text-center">Free delivery • COD available • GST included</p>
                {cart.length === 1 ? (
                  <button onClick={() => { setOrderProduct(cart[0].product); setCartOpen(false); }} className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-bold hover:opacity-90">Proceed to Checkout</button>
                ) : (
                  <p className="text-center text-xs text-gray-500">Select individual items to checkout</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart} />}
      {orderProduct && <OrderModal product={orderProduct} qty={cart.find(c => c.product.id === orderProduct.id)?.qty || 1} onClose={() => setOrderProduct(null)} onOrdered={(ref) => { setOrderProduct(null); setOrderRef(ref); setCart([]); }} />}
    </div>
  );
}

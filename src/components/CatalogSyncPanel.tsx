"use client";
import { useEffect, useState } from "react";

type Product={id:number;title:string;brand:string;category:string;imageUrl:string;sellingPriceInr:string;mrpInr:string;status:string;aiScore:number;stockCount:number;};

export default function CatalogSyncPanel(){
 const [products,setProducts]=useState<Product[]>([]); const [loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/storefront/products?limit=24",{cache:"no-store"}).then(r=>r.json()).then(d=>setProducts(d.products||[])).finally(()=>setLoading(false));},[]);
 return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
  <div className="flex items-center justify-between mb-4"><div><h2 className="text-xl font-bold">🛍️ Published Customer Catalogue</h2><p className="text-xs text-slate-500 mt-1">Same published catalogue served by the customer storefront.</p></div><span className="text-sm font-bold text-emerald-400">{loading?"Loading…":`${products.length} products`}</span></div>
  {products.length===0&&!loading?<div className="p-8 text-center text-slate-500">No Published products are currently in the live catalogue.</div>:<div className="grid grid-cols-2 md:grid-cols-4 gap-3">{products.map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden"><img src={p.imageUrl} alt={p.title} className="w-full h-32 object-cover"/><div className="p-3"><div className="text-[10px] text-orange-400">{p.brand} · {p.category}</div><div className="text-sm font-semibold mt-1 line-clamp-2">{p.title}</div><div className="mt-2 flex justify-between"><span className="font-bold">₹{Number(p.sellingPriceInr).toLocaleString("en-IN")}</span><span className="text-[10px] text-emerald-400">PUBLISHED</span></div></div></div>)}</div>}
 </section>;
}

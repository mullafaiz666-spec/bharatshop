"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, Loader2, Palette, Play, RefreshCw, Shirt, Sparkles, WandSparkles } from "lucide-react";

const panel = "rounded-2xl border border-slate-800 bg-slate-900/75";
const input = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-orange-400";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500";

type Garment = { code: string; name: string; audience: string; sizes: string[]; baseInr: number };
type Product = { id: number; sku: string; title: string; category: string; brand: string; status: string; sellingPriceInr: number; netProfitInr: number; marginPct: number; updatedAt: string; specifications: any };
type StudioData = { garments: Garment[]; printMethods: string[]; products: Product[]; priceBands: Record<string,{min:number;max:number}>; policy: string };

function Preview({ title, brief, palette, garment, brand, back = false }:{title:string;brief:string;palette:string[];garment:string;brand:string;back?:boolean}) {
  const [a,b,c] = palette;
  const hoodie = garment.toLowerCase().includes("hood");
  const crop = garment.toLowerCase().includes("crop");
  return <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_top,#1f2937_0,#0b1018_48%,#070b12_100%)] p-4">
    <div className="absolute inset-0 opacity-20" style={{backgroundImage:`linear-gradient(120deg,${b}22,transparent 45%,${c}11)`}} />
    <div className="relative mx-auto aspect-[4/5] max-w-[330px]">
      <svg viewBox="0 0 360 450" className="h-full w-full drop-shadow-2xl">
        <path d={hoodie ? "M110 88 L150 58 Q180 24 210 58 L250 88 306 122 278 190 247 176 247 386 113 386 113 176 82 190 54 122Z M150 58 Q180 10 210 58 L200 122 160 122Z" : crop ? "M112 92 154 66 180 54 206 66 248 92 300 126 276 194 246 178 246 292 114 292 114 178 84 194 60 126Z" : "M112 92 154 66 180 54 206 66 248 92 300 126 276 194 246 178 246 388 114 388 114 178 84 194 60 126Z"} fill={a} stroke="#020617" strokeWidth="4" />
        <path d="M155 69 Q180 94 205 69" fill="none" stroke="#e2e8f0" strokeOpacity=".7" strokeWidth="6" />
        {back ? <>
          <rect x="128" y="150" width="104" height="135" rx="12" fill="none" stroke={c} strokeWidth="4" />
          <path d="M142 180 Q180 132 218 180 T188 244 Q160 270 138 238" fill="none" stroke={b} strokeWidth="8" strokeLinecap="round" />
          <path d="M145 302 H215" stroke={b} strokeWidth="6" />
        </> : <>
          <circle cx="180" cy="190" r="34" fill="none" stroke={c} strokeWidth="6" />
          <path d="M148 205 Q180 155 215 197" fill="none" stroke={b} strokeWidth="8" strokeLinecap="round" />
          <path d="M156 235 H204" stroke={b} strokeWidth="5" />
        </>}
      </svg>
    </div>
    <div className="relative mt-2 rounded-xl border border-slate-800 bg-slate-950/75 p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">{brand}</span><span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{back?"Back":"Front"}</span></div>
      <p className="mt-1 line-clamp-1 text-sm font-bold text-white">{title || "Untitled concept"}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{brief || "Describe the artwork, vibe, placement and styling direction."}</p>
    </div>
  </div>;
}

export default function FashionDesignerStudio() {
  const [data,setData] = useState<StudioData|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<string|null>(null);
  const [notice,setNotice] = useState("");
  const [brand,setBrand] = useState("BharatDrip");
  const [audience,setAudience] = useState("unisex");
  const [garmentCode,setGarmentCode] = useState("US22");
  const [printMethod,setPrintMethod] = useState("Front + Back DTF");
  const [collection,setCollection] = useState("BharatDrip Drop 01");
  const [mood,setMood] = useState("Gen Z oversized streetwear, chrome linework, abstract manga-panel energy, drips, high contrast, original iconography");
  const [title,setTitle] = useState("Afterdark Signal Oversized Tee");
  const [brief,setBrief] = useState("Original abstract street emblem with a small front crest and a bold back composition; no licensed characters or third-party logos.");
  const [palette,setPalette] = useState(["#0b0b0f","#f97316","#f8fafc"]);
  const [price,setPrice] = useState(799);
  const [lastResult,setLastResult] = useState<any>(null);

  const load = useCallback(async()=>{
    const r = await fetch("/api/admin/fashion-studio",{cache:"no-store"}).catch(()=>null);
    const d = r?.ok ? await r.json().catch(()=>null) : null;
    if(d) setData(d);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);

  const garments = useMemo(()=>data?.garments || [],[data]);
  const compatible = useMemo(()=>garments.filter(g=>g.audience===audience || g.audience==="unisex" || audience==="unisex"),[garments,audience]);
  const garment = garments.find(g=>g.code===garmentCode) || compatible[0] || garments[0];
  const band = data?.priceBands?.[brand] || (brand==="BharatDrip"?{min:599,max:999}:{min:129,max:599});

  useEffect(()=>{
    if(garment && !compatible.some(g=>g.code===garmentCode) && compatible[0]) setGarmentCode(compatible[0].code);
  },[audience,compatible,garment,garmentCode]);
  useEffect(()=>{
    if(brand==="BharatDrip") { setPrintMethod("Front + Back DTF"); if(price<599||price>999)setPrice(799); }
    else { setPrintMethod("Pocket DTF"); if(price<129||price>599)setPrice(399); }
  },[brand]);

  async function post(body:any,key:string){
    if(busy)return null;
    setBusy(key);setNotice("");setLastResult(null);
    try{
      const r=await fetch("/api/admin/fashion-studio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({error:`HTTP ${r.status}`}));
      setLastResult(d);
      if(!r.ok){setNotice(d.error||"Fashion studio action was blocked.");return null;}
      return d;
    }finally{setBusy(null);}
  }

  async function makeConcept(){
    const d=await post({action:"concept",brand,audience,garmentCode,printMethod,palette,mood,collection},"concept");
    if(!d)return;
    const c=d.concept||{};setTitle(String(c.title||title));setBrief(String(c.designBrief||brief));if(Array.isArray(c.palette))setPalette(c.palette.slice(0,3));
    setNotice(`Concept ready via ${d.provider||"designer"}. Review it, then queue the product.`);
  }
  async function queueDesign(){
    const d=await post({action:"create",brand,audience,garmentCode,printMethod,palette,mood,collection,title,designBrief:brief,targetPriceInr:price},"create");
    if(!d)return;setNotice(`${d.title} queued as ${d.status}. It still must pass CEO and listing gates.`);await load();
  }
  async function runCommand(action:string){
    if(busy)return;setBusy(action);setNotice("");
    try{const r=await fetch("/api/admin/command-centre",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});const d=await r.json().catch(()=>({}));setLastResult(d);setNotice(r.ok?`${d.label||action} completed.`:(d.error||"Workflow returned a blocker."));await load();}finally{setBusy(null);}
  }

  if(loading)return <main className="min-h-screen bg-[#070b12] text-slate-100 grid place-items-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-orange-400"/><p className="mt-3 text-sm text-slate-400">Loading Fashion Designer Studio…</p></div></main>;

  return <main className="min-h-screen bg-[#070b12] text-slate-100">
    <div className="mx-auto max-w-[1800px] p-3 md:p-6">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><a href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/>Back to command centre</a><div className="flex items-center gap-3"><div className="rounded-2xl bg-orange-500/10 p-3 text-orange-300"><Shirt/></div><div><h1 className="text-2xl font-black tracking-tight md:text-3xl">Fashion Designer Studio</h1><p className="mt-1 max-w-3xl text-sm text-slate-400">Visual concept → Qikink costing → original product views → CEO review → listing gate → storefront.</p></div></div></div>
        <div className="flex flex-wrap gap-2"><button onClick={()=>void runCommand("fashion-fronts")} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold hover:border-slate-500"><Sparkles size={15} className="mr-2 inline"/>Editorial fronts</button><button onClick={()=>void runCommand("ceo-cycle")} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-emerald-400"><Play size={15} className="mr-2 inline"/>Run CEO gate</button></div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)_360px]">
        <section className={`${panel} p-4 md:p-5`}>
          <div className="mb-4 flex items-center gap-2"><WandSparkles className="text-orange-300" size={18}/><h2 className="font-black">Design brief</h2></div>
          <div className="grid grid-cols-2 gap-3"><div><label className={label}>Brand lane</label><select className={input} value={brand} onChange={e=>setBrand(e.target.value)}><option>BharatDrip</option><option>BharatShop Studio</option></select></div><div><label className={label}>Audience</label><select className={input} value={audience} onChange={e=>setAudience(e.target.value)}><option value="unisex">Unisex</option><option value="men">Men</option><option value="women">Women</option><option value="kids">Kids</option></select></div></div>
          <div className="mt-3"><label className={label}>Qikink garment</label><select className={input} value={garmentCode} onChange={e=>setGarmentCode(e.target.value)}>{compatible.map(g=><option key={g.code} value={g.code}>{g.code} · {g.name} · ₹{g.baseInr}</option>)}</select></div>
          <div className="mt-3"><label className={label}>Print / placement</label><select className={input} value={printMethod} onChange={e=>setPrintMethod(e.target.value)}>{(data?.printMethods||[]).map(x=><option key={x}>{x}</option>)}</select></div>
          <div className="mt-3"><label className={label}>Collection</label><input className={input} value={collection} onChange={e=>setCollection(e.target.value)} /></div>
          <div className="mt-3"><label className={label}>Inspiration / vibe</label><textarea className={`${input} min-h-24 resize-y`} value={mood} onChange={e=>setMood(e.target.value)} /></div>
          <div className="mt-3"><label className={label}>Product title</label><input className={input} value={title} onChange={e=>setTitle(e.target.value)} /></div>
          <div className="mt-3"><label className={label}>Artwork brief</label><textarea className={`${input} min-h-28 resize-y`} value={brief} onChange={e=>setBrief(e.target.value)} /></div>
          <div className="mt-3"><label className={label}>Palette</label><div className="flex gap-2">{palette.map((p,i)=><label key={i} className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-2 py-2"><input type="color" value={p} onChange={e=>setPalette(v=>v.map((x,j)=>j===i?e.target.value:x))} className="h-8 w-8 rounded border-0 bg-transparent"/><span className="text-[11px] text-slate-400">{p}</span></label>)}</div></div>
          <div className="mt-3"><label className={label}>Selling price · allowed ₹{band.min}-₹{band.max}</label><input type="number" min={band.min} max={band.max} className={input} value={price} onChange={e=>setPrice(Number(e.target.value))}/></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button disabled={!!busy} onClick={()=>void makeConcept()} className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-3 text-sm font-black text-orange-200 hover:bg-orange-500/20 disabled:opacity-50">{busy==="concept"?<Loader2 size={16} className="mr-2 inline animate-spin"/>:<Bot size={16} className="mr-2 inline"/>}AI concept</button><button disabled={!!busy} onClick={()=>void queueDesign()} className="rounded-xl bg-orange-500 px-3 py-3 text-sm font-black text-slate-950 hover:bg-orange-400 disabled:opacity-50">{busy==="create"?<Loader2 size={16} className="mr-2 inline animate-spin"/>:<CheckCircle2 size={16} className="mr-2 inline"/>}Queue design</button></div>
        </section>

        <section className={`${panel} p-4 md:p-5`}>
          <div className="mb-4 flex items-center justify-between"><div><div className="flex items-center gap-2"><Palette size={18} className="text-orange-300"/><h2 className="font-black">Visual direction</h2></div><p className="mt-1 text-xs text-slate-500">Front/back production mockup direction. Photoreal editorial is generated separately.</p></div><button onClick={()=>void makeConcept()} disabled={!!busy} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:border-slate-500"><RefreshCw size={14} className="mr-1 inline"/>Remix</button></div>
          <div className="grid gap-4 md:grid-cols-2"><Preview title={title} brief={brief} palette={palette} garment={garment?.name||"Oversized T-Shirt"} brand={brand}/><Preview title={title} brief={brief} palette={palette} garment={garment?.name||"Oversized T-Shirt"} brand={brand} back/></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Garment</p><p className="mt-1 text-sm font-bold">{garment?.name||"—"}</p><p className="mt-1 text-xs text-slate-500">{garment?.sizes?.join(" · ")||""}</p></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Placement</p><p className="mt-1 text-sm font-bold">{printMethod}</p><p className="mt-1 text-xs text-slate-500">Original artwork only</p></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Price lane</p><p className="mt-1 text-sm font-bold">₹{price}</p><p className="mt-1 text-xs text-slate-500">{brand}</p></div></div>
          {notice&&<div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{notice}</div>}
          {lastResult&&<details className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-400">Latest workflow result</summary><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-500">{JSON.stringify(lastResult,null,2)}</pre></details>}
        </section>

        <aside className={`${panel} p-4 md:p-5`}>
          <div className="flex items-center justify-between"><div><h2 className="font-black">Recent designs</h2><p className="mt-1 text-xs text-slate-500">Latest made-to-order fashion SKUs</p></div><button onClick={()=>void load()} className="rounded-lg border border-slate-700 p-2 hover:border-slate-500"><RefreshCw size={15}/></button></div>
          <div className="mt-4 space-y-2">{(data?.products||[]).slice(0,12).map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-start justify-between gap-2"><div><p className="line-clamp-1 text-sm font-bold text-white">{p.title}</p><p className="mt-1 text-[11px] text-slate-500">{p.brand} · {p.sku}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${p.status==="Published"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-300":p.status.includes("CEO")?"border-amber-500/30 bg-amber-500/10 text-amber-300":"border-slate-700 text-slate-400"}`}>{p.status}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">Sell</p><p className="text-xs font-bold">₹{Math.round(p.sellingPriceInr)}</p></div><div className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">Profit</p><p className="text-xs font-bold">₹{Math.round(p.netProfitInr)}</p></div><div className="rounded-lg bg-slate-900 p-2"><p className="text-[10px] text-slate-500">Margin</p><p className="text-xs font-bold">{p.marginPct.toFixed(1)}%</p></div></div></div>)}{!(data?.products||[]).length&&<p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No fashion SKUs yet. Generate a concept and queue the first design.</p>}</div>
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-slate-400"><p className="font-bold text-emerald-300">Production truth</p><p className="mt-1">{data?.policy}</p></div>
        </aside>
      </div>
    </div>
  </main>;
}

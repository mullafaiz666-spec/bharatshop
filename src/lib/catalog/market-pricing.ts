import { serpSearch } from "@/lib/ai/agent-tools";

export type MarketBenchmark = {
  status: "LIVE" | "STATIC_FALLBACK" | "UNVERIFIED";
  query: string;
  observations: number[];
  marketFloorInr: number;
  marketMedianInr: number;
  marketCeilingInr: number;
  competitivePriceInr: number;
  source: string;
};

const round10=(n:number)=>Math.max(0,Math.round(n/10)*10);
const floor10=(n:number)=>Math.max(0,Math.floor(n/10)*10);
const clean=(v:unknown)=>String(v||"").replace(/[^a-zA-Z0-9&+\- ]+/g," ").replace(/\s+/g," ").trim();
const priceOf=(item:any)=>{const n=Number(item?.extracted_price);if(Number.isFinite(n)&&n>0)return n;const m=String(item?.price||item?.snippet||"").replace(/,/g,"").match(/(?:₹|INR|Rs\.?\s*)(\d+(?:\.\d+)?)/i);return m?Number(m[1]):0;};
const percentile=(values:number[],p:number)=>{if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);};

function fashionBand(title:string,category:string){
  const s=`${title} ${category}`.toLowerCase();
  if(!/(fashion|shirt|tee|top|hood|polo|dress|kid|baby|streetwear|oversized|baggy)/i.test(s))return null;
  if(/bharatdrip|designer|premium streetwear|manga|anime inspired|drippy|front.?back|both.?side|graphic back/.test(s))return {floor:599,median:799,ceiling:999};
  if(/budget|value|deal|basic|essential|entry/.test(s))return {floor:129,median:149,ceiling:249};
  if(/crop hoodie/.test(s))return {floor:299,median:399,ceiling:599};
  if(/kids?.*hood|baby.*hood/.test(s))return {floor:299,median:399,ceiling:549};
  if(/polo/.test(s))return {floor:299,median:399,ceiling:649};
  if(/t-?shirt dress|shirt dress/.test(s))return {floor:299,median:399,ceiling:549};
  if(/crop top/.test(s))return {floor:129,median:179,ceiling:399};
  if(/kids?|baby|boy|girl/.test(s))return {floor:129,median:179,ceiling:349};
  if(/oversized|baggy/.test(s))return {floor:139,median:199,ceiling:499};
  if(/full sleeve/.test(s))return {floor:179,median:249,ceiling:499};
  if(/women/.test(s))return {floor:149,median:249,ceiling:499};
  return {floor:149,median:249,ceiling:499};
}

function queryTitle(title:string,category:string){
  const words=clean(title).split(" ").filter(Boolean).filter(w=>!/^(bharatshop|bharatdrip|studio|select|original|made|order)$/i.test(w)).slice(0,10).join(" ");
  return `${words||clean(category)} price India Meesho Flipkart Amazon`;
}

export async function marketBenchmark(title:string,category:string,costInr=0):Promise<MarketBenchmark>{
  const query=queryTitle(title,category),fallback=fashionBand(title,category);
  try{
    const data=await serpSearch(query,"google_shopping"),rows=Array.isArray(data.shopping_results)?data.shopping_results:[];
    const raw=rows.map(priceOf).filter((n:number)=>Number.isFinite(n)&&n>=50&&n<=250000);
    const filtered=raw.filter((n:number)=>!costInr||(n>=Math.max(50,costInr*.35)&&n<=costInr*7));
    const values=(filtered.length>=2?filtered:raw).slice(0,20);
    if(values.length>=2){
      const floor=round10(percentile(values,.15)),median=round10(percentile(values,.5)),ceiling=round10(percentile(values,.8)),competitive=floor10(percentile(values,.35));
      return{status:"LIVE",query,observations:values,marketFloorInr:floor,marketMedianInr:median,marketCeilingInr:Math.max(ceiling,median),competitivePriceInr:Math.max(floor,competitive),source:"SearXNG live retail benchmark"};
    }
  }catch{}
  if(fallback)return{status:"STATIC_FALLBACK",query,observations:[],marketFloorInr:fallback.floor,marketMedianInr:fallback.median,marketCeilingInr:fallback.ceiling,competitivePriceInr:fallback.median,source:"BharatShop 2026 India dual-lane fashion benchmark fallback"};
  return{status:"UNVERIFIED",query,observations:[],marketFloorInr:0,marketMedianInr:0,marketCeilingInr:0,competitivePriceInr:0,source:"No reliable market benchmark"};
}

export function marketBackwardsPrice(costInr:number,benchmark:MarketBenchmark,minMarginPct=25){
  const target=floor10(benchmark.competitivePriceInr),profit=target-costInr,margin=target>0?profit/target*100:0,maxLanded=floor10(target*(1-minMarginPct/100));
  return{viable:benchmark.status!=="UNVERIFIED"&&target>0&&profit>0&&margin>=minMarginPct,sellingPriceInr:target,profitInr:Number(profit.toFixed(2)),marginPct:Number(margin.toFixed(2)),maxLandedCostInr:maxLanded,minMarginPct};
}

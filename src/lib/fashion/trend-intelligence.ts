import { openAIJson, serpSearch } from "@/lib/ai/agent-tools";

export type FashionTrendSignal={
  query:string;
  title:string;
  source:string;
  sourceUrl:string;
  priceInr:number|null;
  snippet:string;
};

export type FashionTrendDirection={
  trendName:string;
  garment:string;
  silhouette:string;
  finish:string;
  placement:string;
  motif:string;
  palette:string[];
  brief:string;
};

const TREND_QUERIES=[
  "Etsy anime streetwear oversized t shirt",
  "Etsy manga streetwear hoodie oversized",
  "Etsy Japanese streetwear vintage washed t shirt",
  "Etsy samurai oni streetwear t shirt",
  "Etsy cyberpunk glitch streetwear hoodie",
  "Etsy streetwear front back print t shirt",
  "Etsy embroidered Japanese streetwear hoodie",
  "Etsy Y2K dark graphic streetwear India",
] as const;

const IP_TERMS=/\b(?:naruto|itachi|uchiha|jujutsu|gojo|sukuna|frieren|berserk|guts|pokemon|pikachu|levi|attack on titan|one piece|luffy|dragon ball|demon slayer|tanjiro|marvel|dc comics|nike|air force|adidas|supreme)\b/gi;
const DIGITAL_TERMS=/\b(?:digital download|png bundle|svg bundle|eps bundle|design bundle|mega bundle|printable)\b/i;

function clean(value:unknown){return String(value||"").replace(IP_TERMS,"[licensed-reference-removed]").replace(/\s+/g," ").trim();}
function priceOf(item:any){const n=Number(item?.extracted_price);if(Number.isFinite(n)&&n>0)return n;const m=String(item?.price||item?.snippet||"").replace(/,/g,"").match(/(?:₹|INR|Rs\.?\s*)(\d+(?:\.\d+)?)/i);return m?Number(m[1]):null;}

export async function scanFashionMarketplaceTrends(){
  const signals:FashionTrendSignal[]=[];
  const errors:Array<{query:string;error:string}>=[];
  for(const query of TREND_QUERIES){
    try{
      const data=await serpSearch(query,"google_shopping");
      const rows=Array.isArray(data.shopping_results)?data.shopping_results:[];
      for(const item of rows.slice(0,5)){
        const title=clean(item?.title);
        const sourceUrl=String(item?.link||"").trim();
        if(!title||!/^https?:\/\//i.test(sourceUrl))continue;
        signals.push({query,title,source:clean(item?.source||item?.merchant||"marketplace"),sourceUrl,priceInr:priceOf(item),snippet:clean(item?.snippet)});
      }
    }catch(error){errors.push({query,error:error instanceof Error?error.message:String(error)});}
  }
  return{signals:signals.slice(0,32),errors,queries:TREND_QUERIES};
}

const FALLBACK_DIRECTIONS:FashionTrendDirection[]=[
 {trendName:"Night Ronin",garment:"Oversized T-Shirt",silhouette:"drop shoulder / baggy",finish:"washed charcoal",placement:"small front crest + large back panel",motif:"original masked wandering-warrior silhouette with rain lines and broken manga frames",palette:["black","bone","electric red"],brief:"Dark Japanese-streetwear energy with an original masked warrior, distressed halftone textures, vertical abstract glyphs and no recognizable franchise character."},
 {trendName:"Chrome Spirit",garment:"Oversized T-Shirt",silhouette:"boxy oversized",finish:"heavy cotton / vintage fade",placement:"front emblem + back hero graphic",motif:"original fox-spirit mask with chrome contours, speed lines and liquid-metal drips",palette:["black","silver","acid orange"],brief:"High-contrast fox-spirit street graphic, entirely original, using chrome linework and manga-panel framing without copying any anime IP."},
 {trendName:"Signal Oni",garment:"Hoodie",silhouette:"loose streetwear",finish:"washed black",placement:"chest sigil + oversized rear print + sleeve accents",motif:"original cyber oni mask, topographic UI marks and glitch fragments",palette:["black","teal","magenta"],brief:"Cyberpunk oni-inspired composition with original facial geometry, glitch typography shapes and technical-map textures; no third-party logos."},
 {trendName:"Koi Static",garment:"AOP Oversized T-Shirt",silhouette:"relaxed oversized",finish:"matte all-over print",placement:"asymmetric all-over composition",motif:"original koi, waves, ink splashes and fragmented comic panels",palette:["ink black","off-white","burnt orange"],brief:"Japanese tattoo/streetwear mood built from original koi and wave forms, static textures and asymmetrical manga-like framing."},
 {trendName:"Concrete Bloom",garment:"Women's Crop Top",silhouette:"relaxed crop",finish:"soft washed cotton",placement:"small front motif",motif:"abstract thorn-flower linework with micro chrome accent",palette:["charcoal","rose","silver"],brief:"Minimal affordable trend lane: tiny original dark-floral graphic inspired by streetwear line-art, not a character print."},
 {trendName:"Midnight Circuit",garment:"Full Sleeve T-Shirt",silhouette:"relaxed unisex",finish:"vintage washed",placement:"small chest mark + sleeve graphics",motif:"original phantom silhouette, circuit paths and racing-panel geometry",palette:["black","lime","grey"],brief:"JDM/cyber street mood without car-brand logos: original spectral figure, circuit traces, speed-grid blocks and restrained sleeve treatment."},
];

export async function fashionTrendDirections(){
  const scan=await scanFashionMarketplaceTrends();
  const evidence=scan.signals.map(x=>({title:x.title,source:x.source,priceInr:x.priceInr,snippet:x.snippet,digital:DIGITAL_TERMS.test(`${x.title} ${x.snippet}`)}));
  try{
    const ai=await openAIJson(
      "You are BharatShop's fashion trend analyst. Infer broad commercial style signals from marketplace evidence, but NEVER copy a listing, seller artwork, brand, franchise, anime/manga character, logo, trademark, or downloadable design bundle. Convert only high-level trends into fresh original streetwear directions. Return JSON {summary:string,directions:[{trendName,garment,silhouette,finish,placement,motif,palette:string[],brief}]}. Prefer oversized/baggy, washed/vintage, front-back graphics, embroidery accents, manga-like framing, cyberpunk/Japanese streetwear and affordable Indian production constraints when evidence supports them. Character/franchise names in evidence are forbidden in output.",
      {evidence,production:{supplier:"Qikink",rule:"original art only",maxRetailInr:999},requiredDirections:6},
      {timeoutMs:10000,maxTokens:1100},
    );
    const directions=Array.isArray(ai?.directions)?ai.directions.slice(0,8).map((x:any)=>({trendName:clean(x?.trendName),garment:clean(x?.garment),silhouette:clean(x?.silhouette),finish:clean(x?.finish),placement:clean(x?.placement),motif:clean(x?.motif),palette:Array.isArray(x?.palette)?x.palette.map(clean).filter(Boolean).slice(0,5):[],brief:clean(x?.brief)})).filter((x:any)=>x.trendName&&x.brief):[];
    return{status:"LIVE_TRENDS",summary:clean(ai?.summary)||"Marketplace trend signals converted into original BharatDrip directions.",directions:directions.length?directions:FALLBACK_DIRECTIONS,signals:scan.signals,errors:scan.errors,ipPolicy:"TREND_ONLY_NO_COPY_NO_LICENSED_IP",digitalBundlePolicy:"SIGNAL_ONLY_NEVER_IMPORT_AS_ARTWORK"};
  }catch(error){
    return{status:"DETERMINISTIC_TRENDS",summary:"Using the safe original-streetwear trend fallback while live trend synthesis is unavailable.",directions:FALLBACK_DIRECTIONS,signals:scan.signals,errors:[...scan.errors,{query:"local-gemma",error:error instanceof Error?error.message:String(error)}],ipPolicy:"TREND_ONLY_NO_COPY_NO_LICENSED_IP",digitalBundlePolicy:"SIGNAL_ONLY_NEVER_IMPORT_AS_ARTWORK"};
  }
}

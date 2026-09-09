import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, stores, products, productDetails, cartItems, orders, automationRules, aiActivityLogs, productRefreshLogs, marketingCampaigns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function statusKey(value:unknown){return String(value||"UNKNOWN").trim().toUpperCase().replace(/\s+/g,"_");}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1",10)||1);
  const limit = Math.min(100,Math.max(1,parseInt(searchParams.get("limit") || "50",10)||50));
  const category = searchParams.get("category") || "";
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "aiScore";
  const offset = (page - 1) * limit;

  const [allUsers, allStores, allOrders, allRules, allCart, recentLogs, refreshLogs, campaigns, allFullProducts, allDetails] = await Promise.all([
    db.select().from(users).limit(1),
    db.select().from(stores),
    db.select().from(orders).orderBy(desc(orders.orderedAt)),
    db.select().from(automationRules).orderBy(desc(automationRules.createdAt)),
    db.select().from(cartItems).orderBy(desc(cartItems.addedAt)),
    db.select().from(aiActivityLogs).orderBy(desc(aiActivityLogs.createdAt)).limit(40),
    db.select().from(productRefreshLogs).orderBy(desc(productRefreshLogs.runAt)).limit(8),
    db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt)).limit(30),
    db.select().from(products).orderBy(desc(products.updatedAt)),
    db.select().from(productDetails),
  ]);

  let pageProducts=[...allFullProducts];
  if(category&&category!=="ALL")pageProducts=pageProducts.filter(p=>p.category===category);
  if(search){const q=search.toLowerCase();pageProducts=pageProducts.filter(p=>p.title.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||p.category.toLowerCase().includes(q));}
  if(sortBy==="profit")pageProducts.sort((a,b)=>Number(b.netProfitInr)-Number(a.netProfitInr));
  else if(sortBy==="price")pageProducts.sort((a,b)=>Number(b.sellingPriceInr)-Number(a.sellingPriceInr));
  else if(sortBy==="viral")pageProducts.sort((a,b)=>b.viralVelocityScore-a.viralVelocityScore);
  else if(sortBy==="sales")pageProducts.sort((a,b)=>b.salesCount24h-a.salesCount24h);
  else pageProducts.sort((a,b)=>b.aiScore-a.aiScore);
  const totalFiltered=pageProducts.length;
  const paginatedProducts=pageProducts.slice(offset,offset+limit);

  const totalRevenue=allOrders.reduce((a,o)=>a+Number(o.customerPaidInr||0),0);
  const totalCost=allOrders.reduce((a,o)=>a+Number(o.supplierCostInr||0),0);
  const totalNetProfit=allOrders.reduce((a,o)=>a+Number(o.netProfitInr||0),0);
  const avgMarginPct=totalRevenue>0?Number(((totalNetProfit/totalRevenue)*100).toFixed(1)):0;
  const fulfilled=allOrders.filter(o=>["Auto-Ordered","Supplier Ordered","In Transit","Delivered","QIKINK_ORDERED"].includes(o.fulfillmentStatus)).length;
  const autoFulfillRate=allOrders.length?Math.round(fulfilled/allOrders.length*100):0;
  const cartTotalCost=allCart.reduce((a,c)=>a+Number(c.supplierCostInr)*c.quantity,0);
  const cartProjectedRevenue=allCart.reduce((a,c)=>a+Number(c.customSellingPriceInr)*c.quantity,0);
  const cartProjectedProfit=allCart.reduce((a,c)=>a+Number(c.netProfitInr)*c.quantity,0);

  const statusCounts:Record<string,number>={};
  for(const p of allFullProducts){const k=statusKey(p.status);statusCounts[k]=(statusCounts[k]||0)+1;}
  const publishedCount=statusCounts.PUBLISHED||0;
  const ceoPendingCount=statusCounts.CEO_PENDING||0;
  const ceoApprovedCount=statusCounts.CEO_APPROVED||0;
  const marketResearchPendingCount=statusCounts.MARKET_RESEARCH_PENDING||0;
  const stagedCount=(statusCounts.STAGED||0)+(statusCounts.AI_DRAFT||0);
  const rejectedCount=Object.entries(statusCounts).filter(([k])=>k.includes("REJECT")||k.includes("BLOCK")).reduce((a,[,v])=>a+v,0);
  const sourceVerifiedIds=new Set(allDetails.filter(d=>d.verificationStatus==="SOURCE_VERIFIED").map(d=>d.productId));
  const sourceVerifiedCount=sourceVerifiedIds.size;
  const fashionMadeToOrderCount=allFullProducts.filter(p=>p.supplierName==="Qikink"&&p.brand==="BharatShop Studio").length;
  const inPipelineCount=Math.max(0,allFullProducts.length-publishedCount-rejectedCount);
  const catalogTotalProfit=allFullProducts.reduce((a,p)=>a+Number(p.netProfitInr||0),0);
  const catalogAvgScore=allFullProducts.length?Math.round(allFullProducts.reduce((a,p)=>a+p.aiScore,0)/allFullProducts.length):0;
  const total24hSales=allFullProducts.reduce((a,p)=>a+(p.salesCount24h||0),0);

  const categoryDist:Record<string,number>={};
  allFullProducts.filter(p=>statusKey(p.status)==="PUBLISHED").forEach(p=>{categoryDist[p.category]=(categoryDist[p.category]||0)+1;});
  const allCategoryDist:Record<string,number>={};
  allFullProducts.forEach(p=>{allCategoryDist[p.category]=(allCategoryDist[p.category]||0)+1;});

  const totalImpressions=campaigns.reduce((a,c)=>a+(c.impressions||0),0),totalClicks=campaigns.reduce((a,c)=>a+(c.clicks||0),0),totalConversions=campaigns.reduce((a,c)=>a+(c.conversions||0),0),totalCampaignRevenue=campaigns.reduce((a,c)=>a+Number(c.revenueGeneratedInr||0),0);
  const dayMap=new Map<string,{revenue:number;profit:number;orders:number}>();
  for(const o of allOrders){const key=new Date(o.orderedAt).toISOString().slice(0,10);const x=dayMap.get(key)||{revenue:0,profit:0,orders:0};x.revenue+=Number(o.customerPaidInr||0);x.profit+=Number(o.netProfitInr||0);x.orders+=1;dayMap.set(key,x);}
  const sparkline14Days=Array.from({length:14},(_,i)=>{const d=new Date();d.setUTCDate(d.getUTCDate()-(13-i));const key=d.toISOString().slice(0,10);const x=dayMap.get(key)||{revenue:0,profit:0,orders:0};return{day:key,...x};});

  return NextResponse.json({
    user:allUsers[0]||null,
    kpis:{
      totalRevenueInr:Number(totalRevenue.toFixed(2)),totalNetProfitInr:Number(totalNetProfit.toFixed(2)),totalSupplierCostInr:Number(totalCost.toFixed(2)),avgMarginPct,autoFulfillRatePct:autoFulfillRate,
      activeProductsCount:publishedCount,totalProductRecordsCount:allFullProducts.length,publishedProductsCount:publishedCount,inPipelineProductsCount:inPipelineCount,sourceVerifiedProductsCount:sourceVerifiedCount,ceoPendingProductsCount:ceoPendingCount,ceoApprovedProductsCount:ceoApprovedCount,marketResearchPendingProductsCount:marketResearchPendingCount,stagedProductsCount:stagedCount,rejectedProductsCount:rejectedCount,fashionMadeToOrderCount,
      pendingOrdersCount:allOrders.filter(o=>["Incoming","AI Checking","RECHECK_REQUIRED","Received","QIKINK_PRODUCTION_PENDING","QIKINK_SUBMISSION_APPROVAL_REQUIRED"].includes(o.fulfillmentStatus)).length,
      storesConnected:allStores.length,cartItemsCount:allCart.length,cartTotalCostInr:Number(cartTotalCost.toFixed(2)),cartProjectedRevenueInr:Number(cartProjectedRevenue.toFixed(2)),cartProjectedProfitInr:Number(cartProjectedProfit.toFixed(2)),catalogAvgAiScore:catalogAvgScore,catalogTotalProjectedProfitInr:Math.round(catalogTotalProfit),total24hSalesAcrossCatalog:total24hSales,totalCampaigns:campaigns.length,totalImpressions,totalClicks,totalConversions,totalCampaignRevenueInr:Math.round(totalCampaignRevenue),ctr:totalImpressions?Number((totalClicks/totalImpressions*100).toFixed(2)):0,
      catalogStatusCounts:statusCounts,
    },
    sparkline14Days,stores:allStores,products:paginatedProducts,productsPagination:{page,limit,total:totalFiltered,totalPages:Math.ceil(totalFiltered/limit)},categoryDistribution:categoryDist,allCategoryDistribution:allCategoryDist,orders:allOrders,rules:allRules,cartItems:allCart,activityLogs:recentLogs,refreshLogs,campaigns:campaigns.slice(0,20),truthPolicy:"CEO_PENDING means awaiting CEO review only; CEO_APPROVED and MARKET_RESEARCH_PENDING are separate listing stages.",
  });
}

export async function POST(req:Request){
  try{
    const body=await req.json();const {aiAutoPilotEnabled}=body;
    const allUsers=await db.select().from(users).limit(1);if(!allUsers[0])return NextResponse.json({error:"User not found"},{status:404});
    const [updatedUser]=await db.update(users).set({aiAutoPilotEnabled:Boolean(aiAutoPilotEnabled)}).where(eq(users.id,allUsers[0].id)).returning();
    await db.insert(aiActivityLogs).values({userId:updatedUser.id,agentName:"BHARATSHOP-CORE",actionType:aiAutoPilotEnabled?"AUTOPILOT_ENGAGED":"AUTOPILOT_STANDBY",message:aiAutoPilotEnabled?"AI Auto-Pilot enabled for approved automation paths.":"AI Auto-Pilot paused for manual review.",profitImpactInr:"0.00",status:aiAutoPilotEnabled?"SUCCESS":"WARNING"});
    return NextResponse.json({user:updatedUser});
  }catch(err:unknown){return NextResponse.json({error:err instanceof Error?err.message:"Error"},{status:500});}
}

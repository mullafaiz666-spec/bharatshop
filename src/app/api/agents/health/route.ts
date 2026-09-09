import { NextResponse } from "next/server";
import { aiConfigured, aiProviderName, aiModels } from "@/lib/ai/provider";
import { publicAgentContracts, type OperationalAgentId } from "@/lib/agents/contracts";
import { marketingConnections } from "@/lib/marketing/connections";
export const dynamic="force-dynamic";

export async function GET(){
  const ai=aiConfigured(), search=Boolean(process.env.SEARXNG_URL), automationToken=Boolean(process.env.BHARATSHOP_AUTOMATION_TOKEN||process.env.AUTOMATION_TOKEN);
  const state:Record<OperationalAgentId,{ready:boolean;reason:string}>={
    ceo:{ready:automationToken,reason:automationToken?"automation authorization configured":"missing automation authorization token"},
    "source-discovery":{ready:ai&&search,reason:ai&&search?"local Gemma + SearXNG ready":"requires local Gemma and SearXNG"},
    "source-verification":{ready:ai&&search,reason:ai&&search?"verification providers ready":"requires local Gemma and SearXNG"},
    "seller-discovery":{ready:search,reason:search?"free SearXNG seller search ready":"requires SearXNG"},
    listing:{ready:true,reason:ai?"local Gemma + verified-facts fallback":"verified-facts fallback ready; local Gemma unavailable"},
    marketing:{ready:ai,reason:ai?"local Gemma ready":"local Gemma unavailable"},
    advertising:{ready:ai,reason:ai?"local Gemma strategy ready":"local Gemma unavailable"},
    "order-recheck":{ready:ai,reason:ai?"local Gemma + live source evidence ready":"local Gemma unavailable"},
    tracking:{ready:true,reason:"database-backed tracking ready"},
    learning:{ready:ai,reason:ai?"local Gemma outcome analysis ready":"local Gemma unavailable"},
    automation:{ready:ai,reason:ai?"local Gemma workflow planning ready":"local Gemma unavailable"},
    "web-design":{ready:ai,reason:ai?"local Gemma design planning ready":"local Gemma unavailable"},
  };
  const agents=publicAgentContracts().map(c=>({...c,...state[c.id as OperationalAgentId]}));
  const meta=marketingConnections().filter(c=>["meta","facebook","instagram","meta-capi"].includes(c.key));
  return NextResponse.json({suite:"BharatShop Agent Suite v2",promptVersion:"agent-suite-v2",provider:{name:aiProviderName(),models:aiModels(),configured:ai},freeInfrastructure:{localGemma:ai,searxng:search,serpApiRequired:false},agents,summary:{total:agents.length,ready:agents.filter(a=>a.ready).length,blocked:agents.filter(a=>!a.ready).map(a=>a.id)},metaIntegration:meta,checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}

import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { aiModels, runText } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const BASE_SYSTEM = `You are BharatShop AI CEO. Reason only from the supplied live evidence. Never invent actions, sources, approvals, stock, images, orders or financial facts. Human approval is mandatory before consequential spending, purchasing, publishing-risk changes or external commitments. Be concise.`;
const AGENT_FOCUS: Record<string,string> = {
  "AI CEO":"Coordinate the operation from live evidence.",
  "Product Research":"Research product opportunities from public evidence.",
  "Source Verification":"Verify source identity, pricing, stock and shipping evidence.",
  "Image & Media":"Resolve exact-product media without weakening verification gates.",
  "Fashion Enrichment":"Work on evidence-backed fashion variants and sizing.",
  "Listing & Marketing":"Prepare truthful customer-facing listing decisions.",
  "Learning & Analytics":"Analyze live business evidence and outcomes.",
  "Advertising":"Prepare advertising decisions; spending remains human-gated.",
  "Order Re-check":"Re-check order economics; supplier purchasing remains human-gated.",
  "Fulfilment & Tracking":"Review fulfilment/tracking evidence without inventing shipment state.",
};
const AGENT_TOOLS: Record<string,string[]> = {
  "AI CEO":["inspect_live_business_data","research_web","resolve_product_images","fashion_studio","list_fashion_commands","reject_product","create_approval","list_pending_approvals"],
  "Product Research":["inspect_live_business_data","research_web"],
  "Source Verification":["inspect_live_business_data","research_web"],
  "Image & Media":["inspect_live_business_data","research_web","resolve_product_images","fashion_studio","list_fashion_commands","reject_product"],
  "Fashion Enrichment":["inspect_live_business_data","research_web","fashion_studio","list_fashion_commands"],
  "Listing & Marketing":["inspect_live_business_data","research_web"],
  "Learning & Analytics":["inspect_live_business_data","research_web"],
  "Advertising":["inspect_live_business_data","research_web","list_pending_approvals","create_approval"],
  "Order Re-check":["inspect_live_business_data","research_web","list_pending_approvals","create_approval"],
  "Fulfilment & Tracking":["inspect_live_business_data","list_pending_approvals","create_approval"],
};

function allowed(agent:string, tool:string) { return (AGENT_TOOLS[agent] || AGENT_TOOLS["AI CEO"]).includes(tool); }
function slashCommand(question:string){const p=question.trim().split(/\s+/);const command=(p.shift()||"").toLowerCase();if(!/^\/[a-z0-9]+$/i.test(command))return null;return{command,rest:p.join(" ").trim()};}

async function runTool(name:string,args:any,agent:string,trace:any[],approvalId?:number){
  const started=Date.now(); let result:any;
  try{
    switch(name){
      case"inspect_live_business_data":result=await inspectLiveBusinessData();break;
      case"research_web":result=await researchWeb(String(args.query||""));break;
      case"resolve_product_images":result=await resolveProductImages(args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined);break;
      case"fashion_studio":result=await fashionStudio(String(args.command||""),args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined,args.count?Number(args.count):undefined,args.extra_prompt?String(args.extra_prompt):undefined);break;
      case"list_fashion_commands":result=listFashionCommands();break;
      case"reject_product":result=await rejectProduct(args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined,String(args.reason||"Product failed verification"));break;
      case"create_approval":result=await createApproval({title:String(args.title),actionType:String(args.action_type),payload:args.payload??{},reason:String(args.reason),riskLevel:String(args.risk_level||"MEDIUM")});break;
      case"list_pending_approvals":result=await listPendingApprovals();break;
      default:throw new Error(`Unknown CEO tool: ${name}`);
    }
  }catch(e){result={error:e instanceof Error?e.message:"Tool failed"};}
  try{
    const audit=await recordToolExecution(agent,name,args,result,started,approvalId);
    trace.push({auditId:audit.id,tool:name,input:args,result,status:audit.status,createdAt:audit.created_at});
  }catch(e){trace.push({auditId:null,tool:name,input:args,result,status:"AUDIT_FAILED",auditError:e instanceof Error?e.message:"Audit write failed"});}
  return result;
}

function compactLive(live:any){
  return {
    products:live?.products,
    internalOrders:live?.internalOrders,
    storefrontOrders:live?.storefrontOrders,
    pendingApprovals:Array.isArray(live?.pendingApprovals)?live.pendingApprovals.slice(0,5).map((x:any)=>({id:x.id,title:x.title,action_type:x.action_type,status:x.status,risk_level:x.risk_level})):[],
    recentActivity:Array.isArray(live?.recentActivity)?live.recentActivity.slice(0,5).map((x:any)=>({agent:x.agent_name,action:x.action_type,status:x.status,message:String(x.message||"").slice(0,140)})):[],
    inspectedAt:live?.inspectedAt,
  };
}
function compactTrace(trace:any[]){return trace.slice(-4).map(x=>({tool:x.tool,status:x.status,auditId:x.auditId,result:JSON.stringify(x.result??{}).slice(0,1200)}));}

function parseApprovalIntent(question:string){
  const title=question.match(/titled exactly\s+["“]([^"”]+)["”]/i)?.[1];
  const action=question.match(/\bfor\s+([A-Z][A-Z0-9_]+)\b/i)?.[1]?.toUpperCase();
  const payloadText=question.match(/with payload\s+(\{[\s\S]*?\})(?:\.|$)/i)?.[1];
  if(!title||!action||!/approval request/i.test(question)) return null;
  let payload:any={}; if(payloadText){try{payload=JSON.parse(payloadText)}catch{payload={};}}
  const risk=/low[- ]risk/i.test(question)?"LOW":/critical/i.test(question)?"CRITICAL":/high[- ]risk/i.test(question)?"HIGH":"MEDIUM";
  return {title,action_type:action,payload,reason:"AI CEO requested human authorization; no consequential action is executed by creating this request.",risk_level:risk};
}

async function auditDecision(agent:string, status:string, summary:string, evidence:any){
  try{await recordAudit({agentName:agent,eventType:"CEO_DECISION",status,summary,evidence});}catch{}
}

function evidenceFallbackReply(live:any, trace:any[]){
  const c=compactLive(live);
  const productCount=Number(c.products?.total ?? c.products?.count ?? 0);
  const storefrontOrderCount=Number(c.storefrontOrders?.total ?? c.storefrontOrders?.count ?? 0);
  const internalOrderCount=Number(c.internalOrders?.total ?? c.internalOrders?.count ?? 0);
  const approvalCount=Array.isArray(c.pendingApprovals)?c.pendingApprovals.length:0;
  const completedTools=trace.filter(x=>x.result!==undefined&&x.status!=="AUDIT_FAILED").length;
  return `Live evidence inspection completed with ${completedTools} audited tool execution(s). Current evidence reports ${productCount} product record(s), ${storefrontOrderCount} storefront order record(s), ${internalOrderCount} internal order record(s), and ${approvalCount} pending approval(s). The local Gemma wording step was unavailable, so this is a deterministic summary of the verified tool evidence; no action was executed.`;
}

export async function POST(req:Request){
  const started=Date.now();
  try{
    const body=await req.json();
    const incoming=Array.isArray(body.messages)?body.messages.slice(-8):[];
    const question=String(body.question||incoming.at(-1)?.content||"").trim();
    if(!question)return NextResponse.json({error:"Question required"},{status:400});
    const context=body.context??{};
    const agent=String(context.selectedAgent||"AI CEO");
    const trace:any[]=[];

    const slash=slashCommand(question);
    if(slash&&listFashionCommands().some(x=>x.command===slash.command)){
      if(!allowed(agent,"fashion_studio"))return NextResponse.json({error:`${agent} does not have permission to execute Fashion Studio commands.`,code:"AGENT_TOOL_NOT_ALLOWED"},{status:403});
      const result=await runTool("fashion_studio",{command:slash.command,extra_prompt:slash.rest,product_id:context.productId,product_name:context.productName},agent,trace);
      const reply=result?.success?`${slash.command} completed with ${result.generated} generated image(s).`:`${slash.command} did not complete: ${result?.error||"no success evidence"}`;
      await auditDecision(agent,result?.success?"SUCCESS":"FAILED",reply,{question,toolExecutions:trace,durationMs:Date.now()-started});
      return NextResponse.json({reply,mode:"fashion-studio-live",agent,toolExecutions:trace,result});
    }

    const approval=parseApprovalIntent(question);
    if(approval){
      if(!allowed(agent,"create_approval"))return NextResponse.json({error:`${agent} cannot create approval requests.`,code:"AGENT_TOOL_NOT_ALLOWED"},{status:403});
      const result=await runTool("create_approval",approval,agent,trace);
      const ok=!result?.error&&result?.id;
      const reply=ok?`Human approval request #${result.id} was created for ${approval.action_type}. It has not been executed.`:`The approval request could not be created: ${result?.error||"no persisted approval returned"}`;
      await auditDecision(agent,ok?"SUCCESS":"FAILED",reply,{question,toolExecutions:trace,durationMs:Date.now()-started});
      return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,approval:result},{status:ok?200:503});
    }

    // The 270M free-tier model is reliable for small text inference but not for
    // function-call JSON. Tool routing is deterministic and audited. The wording
    // pass has a short deadline so a slow cold model can never make the CEO API
    // exceed the production request budget; verified tool evidence remains usable.
    let live:any=null;
    if(allowed(agent,"inspect_live_business_data")) live=await runTool("inspect_live_business_data",{},agent,trace);
    if(/pending approvals?|approval queue/i.test(question)&&allowed(agent,"list_pending_approvals")) await runTool("list_pending_approvals",{},agent,trace);
    if(/\b(research|search the web|public web|market trend|current supplier)\b/i.test(question)&&allowed(agent,"research_web")) await runTool("research_web",{query:question.slice(0,500)},agent,trace);
    if(/\b(resolve|find)\b.*\b(images?|media)\b/i.test(question)&&allowed(agent,"resolve_product_images")&&(context.productId||context.productName)) await runTool("resolve_product_images",{product_id:context.productId,product_name:context.productName},agent,trace);

    const evidence={live:compactLive(live),tools:compactTrace(trace),context:{productId:context.productId,productName:context.productName}};
    const messages:any[]=[
      {role:"system",content:`${BASE_SYSTEM}\nROLE: ${agent}. ${AGENT_FOCUS[agent]||"Operate only within assigned responsibilities."}`},
      ...incoming.map((m:any)=>({role:m?.role==="assistant"?"assistant":"user",content:String(m?.content||"").slice(0,350)})).filter((m:any)=>m.content),
      {role:"user",content:`QUESTION: ${question.slice(0,500)}\nLIVE EVIDENCE: ${JSON.stringify(evidence).slice(0,2200)}\nAnswer using only this evidence.`},
    ];
    try{
      const result=await Promise.race([
        runText(messages,{model:aiModels().text,temperature:0.1,maxTokens:160}),
        new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Local Gemma wording deadline exceeded")),12_000)),
      ]);
      const reply=result.content.trim();
      if(!reply)throw new Error("AI provider returned an empty final response");
      await auditDecision(agent,"SUCCESS","CEO produced an evidence-grounded decision after deterministic audited tool routing.",{question,toolExecutions:trace,decision:reply,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,durationMs:Date.now()-started});
      return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,orchestration:"deterministic-audited-tools+local-gemma",modelStatus:"completed"});
    }catch(e){
      const reply=evidenceFallbackReply(live,trace);
      await auditDecision(agent,"SUCCESS","CEO returned verified-tool fallback because the local Gemma wording pass was unavailable.",{question,toolExecutions:trace,decision:reply,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,modelError:e instanceof Error?e.message:String(e),durationMs:Date.now()-started});
      return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,orchestration:"deterministic-audited-tools+local-gemma",modelStatus:"fallback",modelError:e instanceof Error?e.message:String(e)});
    }
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Agent chat failed",code:"CEO_CHAT_FAILED"},{status:500});}
}

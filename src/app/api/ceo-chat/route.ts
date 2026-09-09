import { NextResponse } from "next/server";
import { createApproval, inspectLiveBusinessData, researchWeb, listPendingApprovals, resolveProductImages, rejectProduct, fashionStudio, listFashionCommands, designFashionCollection } from "@/lib/ai/ceo-tools";
import { recordAudit, recordToolExecution } from "@/lib/ai/audit";
import { aiModels, runText } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

const BASE_SYSTEM=`You are BharatShop AI CEO, an experienced ecommerce operator and critical-problem solver. Think in business outcomes: what is actually live, what is wrong, why it matters, and what should happen next. Use only supplied live evidence. Never invent actions, sources, approvals, stock, images, orders or financial facts. Speak naturally like a senior human operator. Never expose internal telemetry phrases such as "tool execution", "deterministic summary", "model wording step", or raw JSON unless the user explicitly asks for debugging. Distinguish total database records from customer-visible published products. When useful, give a short status, the biggest blocker, and the next action. Human approval is mandatory before consequential spending, purchasing, external commitments or other gated actions.`;

const AGENT_FOCUS:Record<string,string>={
 "AI CEO":"Coordinate the entire operation and solve root problems from live evidence.",
 "Product Research":"Find strong product opportunities from public evidence.",
 "Source Verification":"Verify source identity, pricing, availability and economics.",
 "Image & Media":"Build exact-product media without weakening evidence gates.",
 "Fashion Designer":"Create original men, women and kids fashion mapped to Qikink made-to-order production.",
 "Fashion Enrichment":"Enrich evidence-backed fashion variants and sizing.",
 "Listing & Marketing":"Prepare truthful customer-facing listings and publication decisions.",
 "Learning & Analytics":"Explain business performance, weak points and lessons.",
 "Advertising":"Prepare advertising decisions; spending remains human-gated.",
 "Order Re-check":"Re-check order economics; supplier purchasing remains human-gated.",
 "Fulfilment & Tracking":"Review fulfilment, Qikink production and tracking without inventing shipment state.",
};
const AGENT_TOOLS:Record<string,string[]>={
 "AI CEO":["inspect_live_business_data","research_web","resolve_product_images","fashion_studio","design_fashion_collection","list_fashion_commands","reject_product","create_approval","list_pending_approvals"],
 "Product Research":["inspect_live_business_data","research_web"],
 "Source Verification":["inspect_live_business_data","research_web"],
 "Image & Media":["inspect_live_business_data","research_web","resolve_product_images","fashion_studio","list_fashion_commands","reject_product"],
 "Fashion Designer":["inspect_live_business_data","research_web","design_fashion_collection","fashion_studio","list_fashion_commands"],
 "Fashion Enrichment":["inspect_live_business_data","research_web","fashion_studio","list_fashion_commands"],
 "Listing & Marketing":["inspect_live_business_data","research_web"],
 "Learning & Analytics":["inspect_live_business_data","research_web"],
 "Advertising":["inspect_live_business_data","research_web","list_pending_approvals","create_approval"],
 "Order Re-check":["inspect_live_business_data","research_web","list_pending_approvals","create_approval"],
 "Fulfilment & Tracking":["inspect_live_business_data","list_pending_approvals","create_approval"],
};
const allowed=(agent:string,tool:string)=>(AGENT_TOOLS[agent]||AGENT_TOOLS["AI CEO"]).includes(tool);
function slashCommand(question:string){const p=question.trim().split(/\s+/),command=(p.shift()||"").toLowerCase();if(!/^\/[a-z0-9]+$/i.test(command))return null;return{command,rest:p.join(" ").trim()};}
async function runTool(name:string,args:any,agent:string,trace:any[],origin:string,approvalId?:number){
 const started=Date.now();let result:any;
 try{
  switch(name){
   case"inspect_live_business_data":result=await inspectLiveBusinessData();break;
   case"research_web":result=await researchWeb(String(args.query||""));break;
   case"resolve_product_images":result=await resolveProductImages(args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined);break;
   case"fashion_studio":result=await fashionStudio(String(args.command||""),args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined,args.count?Number(args.count):undefined,args.extra_prompt?String(args.extra_prompt):undefined);break;
   case"design_fashion_collection":result=await designFashionCollection(Math.max(3,Math.min(24,Number(args.count||12))),origin);break;
   case"list_fashion_commands":result=listFashionCommands();break;
   case"reject_product":result=await rejectProduct(args.product_id?Number(args.product_id):undefined,args.product_name?String(args.product_name):undefined,String(args.reason||"Product failed verification"));break;
   case"create_approval":result=await createApproval({title:String(args.title),actionType:String(args.action_type),payload:args.payload??{},reason:String(args.reason),riskLevel:String(args.risk_level||"MEDIUM")});break;
   case"list_pending_approvals":result=await listPendingApprovals();break;
   default:throw new Error(`Unknown CEO tool: ${name}`);
  }
 }catch(e){result={error:e instanceof Error?e.message:"Tool failed"};}
 try{const audit=await recordToolExecution(agent,name,args,result,started,approvalId);trace.push({auditId:audit.id,tool:name,input:args,result,status:audit.status,createdAt:audit.created_at});}
 catch(e){trace.push({auditId:null,tool:name,input:args,result,status:"AUDIT_FAILED",auditError:e instanceof Error?e.message:"Audit write failed"});}
 return result;
}
function compactLive(live:any){return{products:live?.products,internalOrders:live?.internalOrders,storefrontOrders:live?.storefrontOrders,pendingApprovals:Array.isArray(live?.pendingApprovals)?live.pendingApprovals.slice(0,8).map((x:any)=>({id:x.id,title:x.title,action_type:x.action_type,status:x.status,risk_level:x.risk_level})):[],recentActivity:Array.isArray(live?.recentActivity)?live.recentActivity.slice(0,8).map((x:any)=>({agent:x.agent_name,action:x.action_type,status:x.status,message:String(x.message||"").slice(0,180)})):[],inspectedAt:live?.inspectedAt};}
function compactTrace(trace:any[]){return trace.slice(-4).map(x=>({tool:x.tool,status:x.status,auditId:x.auditId,result:JSON.stringify(x.result??{}).slice(0,1200)}));}
function parseApprovalIntent(question:string){const title=question.match(/titled exactly\s+["“]([^"”]+)["”]/i)?.[1],action=question.match(/\bfor\s+([A-Z][A-Z0-9_]+)\b/i)?.[1]?.toUpperCase(),payloadText=question.match(/with payload\s+(\{[\s\S]*?\})(?:\.|$)/i)?.[1];if(!title||!action||!/approval request/i.test(question))return null;let payload:any={};if(payloadText){try{payload=JSON.parse(payloadText)}catch{payload={};}}const risk=/low[- ]risk/i.test(question)?"LOW":/critical/i.test(question)?"CRITICAL":/high[- ]risk/i.test(question)?"HIGH":"MEDIUM";return{title,action_type:action,payload,reason:"AI CEO requested human authorization; creating the request does not execute the consequential action.",risk_level:risk};}
async function auditDecision(agent:string,status:string,summary:string,evidence:any){try{await recordAudit({agentName:agent,eventType:"CEO_DECISION",status,summary,evidence});}catch{}}
function humanFallback(question:string,live:any){
 const c=compactLive(live),p=c.products||{},store=c.storefrontOrders||{},orders=c.internalOrders||{};
 const total=Number(p.total||0),published=Number(p.published||0),pending=Number(p.ceo_pending||0),staged=Number(p.staged||0),rejected=Number(p.rejected||0),fashion=Number(p.qikink_fashion||0),approvalCount=Array.isArray(c.pendingApprovals)?c.pendingApprovals.length:0,gap=Math.max(0,total-published),q=question.toLowerCase();
 if(q.includes("audit"))return `I checked the live BharatShop operation. ${published} products are actually published to the storefront out of ${total} product records in the database. ${pending} are waiting on CEO/listing review, ${staged} are still staged, and ${rejected} are rejected or held. ${fashion} records belong to the Qikink made-to-order fashion line. There are ${Number(store.total||0)} storefront orders, ${Number(orders.total||0)} internal order records, and ${approvalCount} pending human approvals.\n\nThe main issue is the gap between database volume and customer-visible inventory${gap?` — ${gap} records are not live products`:""}. My next priority is to keep expanding only products that pass source, media, pricing and publication gates, while keeping Qikink fashion clearly marked as made to order.`;
 if(q.includes("block")||q.includes("broken")||q.includes("problem"))return `The biggest operational gap is catalog conversion: BharatShop has ${total} product records, but only ${published} are customer-visible. ${pending} products are in CEO review and ${staged} are staged. I would focus on moving verified supplier products through publication, then expand the Qikink fashion line without pretending made-to-order items are held inventory.`;
 if(q.includes("next")||q.includes("fix"))return `My next moves are: first, keep publishing verified supplier products so the storefront grows beyond ${published}; second, move the Qikink men’s, women’s and kids’ designs through the made-to-order publication gate; third, keep the dashboard anchored to published products instead of total records; and fourth, only advance orders when supplier or Qikink production evidence is real. I would not spend money or place supplier orders without the required approval.`;
 return `BharatShop currently has ${published} products actually live on the storefront, while the database contains ${total} product records in total. ${pending} are waiting on CEO/listing review, ${staged} are staged, ${rejected} are rejected/held, and ${fashion} are Qikink fashion records. I can see ${Number(store.total||0)} storefront order(s), ${Number(orders.total||0)} internal order record(s), and ${approvalCount} pending approval(s).\n\nThe catalog is the main growth bottleneck, so I’m treating “published live” as the real store count—not the larger database number.`;
}
const BOTLIKE=/(live evidence inspection completed|audited tool execution|deterministic summary|model wording step|no action was executed|raw json|tool telemetry)/i;
function parseDesignCount(q:string){const n=Number(q.match(/\b(\d{1,2})\b/)?.[1]||12);return Math.max(3,Math.min(24,n));}

export async function POST(req:Request){
 const started=Date.now();
 try{
  const body=await req.json(),incoming=Array.isArray(body.messages)?body.messages.slice(-8):[],question=String(body.question||incoming.at(-1)?.content||"").trim();if(!question)return NextResponse.json({error:"Question required"},{status:400});
  const context=body.context??{},agent=String(context.selectedAgent||"AI CEO"),trace:any[]=[],origin=new URL(req.url).origin;
  const slash=slashCommand(question);
  if(slash&&listFashionCommands().some(x=>x.command===slash.command)){
   if(!allowed(agent,"fashion_studio"))return NextResponse.json({error:`${agent} does not have permission to execute Fashion Studio commands.`,code:"AGENT_TOOL_NOT_ALLOWED"},{status:403});
   const result=await runTool("fashion_studio",{command:slash.command,extra_prompt:slash.rest,product_id:context.productId,product_name:context.productName},agent,trace,origin);const reply=result?.success?`I completed ${slash.command}. ${result.generated||0} image variation(s) were created for the selected product.`:`I couldn’t complete ${slash.command}: ${result?.error||"the generation step returned no usable result"}.`;await auditDecision(agent,result?.success?"SUCCESS":"FAILED",reply,{question,toolExecutions:trace,durationMs:Date.now()-started});return NextResponse.json({reply,mode:"fashion-studio-live",agent,toolExecutions:trace,result});
  }
  const designIntent=/\b(create|design|generate|make|build)\b[\s\S]{0,50}\b(fashion|clothing|clothes|collection|mens?|women|womens?|kids?)\b/i.test(question);
  if(designIntent&&allowed(agent,"design_fashion_collection")){
   const count=parseDesignCount(question),result=await runTool("design_fashion_collection",{count},agent,trace,origin);const reply=result?.success?`I created ${result.generated} original BharatShop Studio fashion product(s) across men, women and kids, mapped them to Qikink made-to-order production, and queued any new designs for CEO publication. No supplier order was placed.`:`I couldn’t create the fashion collection: ${result?.error||"the design run failed"}.`;await auditDecision(agent,result?.success?"SUCCESS":"FAILED",reply,{question,toolExecutions:trace,durationMs:Date.now()-started});return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,result});
  }
  const approval=parseApprovalIntent(question);
  if(approval){if(!allowed(agent,"create_approval"))return NextResponse.json({error:`${agent} cannot create approval requests.`,code:"AGENT_TOOL_NOT_ALLOWED"},{status:403});const result=await runTool("create_approval",approval,agent,trace,origin),ok=!result?.error&&result?.id;const reply=ok?`I created approval request #${result.id} for ${approval.action_type}. Nothing has been executed yet; it is waiting for a human decision.`:`I couldn’t create the approval request: ${result?.error||"the approval was not persisted"}.`;await auditDecision(agent,ok?"SUCCESS":"FAILED",reply,{question,toolExecutions:trace,durationMs:Date.now()-started});return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,approval:result},{status:ok?200:503});}
  let live:any=null;if(allowed(agent,"inspect_live_business_data"))live=await runTool("inspect_live_business_data",{},agent,trace,origin);
  if(/pending approvals?|approval queue/i.test(question)&&allowed(agent,"list_pending_approvals"))await runTool("list_pending_approvals",{},agent,trace,origin);
  if(/\b(research|search the web|public web|market trend|current supplier)\b/i.test(question)&&allowed(agent,"research_web"))await runTool("research_web",{query:question.slice(0,500)},agent,trace,origin);
  if(/\b(resolve|find)\b.*\b(images?|media)\b/i.test(question)&&allowed(agent,"resolve_product_images")&&(context.productId||context.productName))await runTool("resolve_product_images",{product_id:context.productId,product_name:context.productName},agent,trace,origin);
  const evidence={live:compactLive(live),tools:compactTrace(trace),context:{productId:context.productId,productName:context.productName}};
  const messages:any[]=[{role:"system",content:`${BASE_SYSTEM}\nROLE: ${agent}. ${AGENT_FOCUS[agent]||"Operate only within assigned responsibilities."}`},...incoming.map((m:any)=>({role:m?.role==="assistant"?"assistant":"user",content:String(m?.content||"").slice(0,350)})).filter((m:any)=>m.content),{role:"user",content:`QUESTION: ${question.slice(0,500)}\nLIVE EVIDENCE: ${JSON.stringify(evidence).slice(0,2600)}\nAnswer naturally. Do not mention internal tool telemetry.`}];
  try{const result=await Promise.race([runText(messages,{model:aiModels().text,temperature:0.2,maxTokens:220}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Local Gemma response deadline exceeded")),15_000))]);const reply=result.content.trim();if(!reply||BOTLIKE.test(reply))throw new Error("AI wording was empty or system-like");await auditDecision(agent,"SUCCESS","CEO produced an evidence-grounded business response.",{question,toolExecutions:trace,decision:reply,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,durationMs:Date.now()-started});return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,orchestration:"audited-tools+local-gemma",modelStatus:"completed"});}
  catch(e){const reply=humanFallback(question,live);await auditDecision(agent,"SUCCESS","CEO returned a human-readable evidence fallback because local wording was unavailable or system-like.",{question,toolExecutions:trace,decision:reply,modelError:e instanceof Error?e.message:String(e),durationMs:Date.now()-started});return NextResponse.json({reply,mode:"ai-agent-live",agent,toolExecutions:trace,provider:process.env.AI_PROVIDER||"local-openai-compatible",model:aiModels().text,orchestration:"audited-tools+local-gemma",modelStatus:"human-fallback"});}
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Agent chat failed",code:"CEO_CHAT_FAILED"},{status:500});}
}

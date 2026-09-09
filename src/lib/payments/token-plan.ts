export type PartialCodPlan={strategy:"MARGIN_PROTECTED_PARTIAL_COD";totalAmountInr:number;confirmationAmountInr:number;codBalanceInr:number;confirmationPct:number};
const roundRupee=(n:number)=>Math.round((Number.isFinite(n)?n:0)*100)/100;
export function partialCodPlan(input:{sellingPriceInr:number;netProfitInr:number;quantity:number}):PartialCodPlan{
 const quantity=Math.max(1,Math.floor(Number(input.quantity)||1)),total=roundRupee(Math.max(0,Number(input.sellingPriceInr))*quantity),protectedMargin=roundRupee(Math.max(0,Number(input.netProfitInr))*quantity);
 const floor=total>0?Math.min(total,49):0,confirmation=roundRupee(Math.min(total,Math.max(floor,protectedMargin))),codBalance=roundRupee(Math.max(0,total-confirmation));
 return{strategy:"MARGIN_PROTECTED_PARTIAL_COD",totalAmountInr:total,confirmationAmountInr:confirmation,codBalanceInr:codBalance,confirmationPct:total>0?Math.round(confirmation/total*10000)/100:0};
}
export function appendPaymentMeta(existing:string|undefined,meta:Record<string,string|number|boolean>){const bits=Object.entries(meta).map(([k,v])=>`${k}=${String(v)}`);return [String(existing||"").trim(),...bits].filter(Boolean).join(" | ");}
export function readPaymentMeta(notes:string|undefined,key:string){const found=String(notes||"").split("|").map(x=>x.trim()).reverse().find(x=>x.startsWith(`${key}=`));return found?found.slice(key.length+1):"";}

import { pool } from "@/db";

export type FashionCommand={command:string;name:string;category:string;description:string;requiresProduct:boolean;defaultCount:number;prompt:string};
export const FASHION_COMMANDS:FashionCommand[]=[
 {command:"/autoimage",name:"Automatic Studio Views",category:"BharatShop Studio",description:"Create local catalog views for a BharatShop Studio fashion product",requiresProduct:true,defaultCount:4,prompt:"LOCAL_STUDIO"},
 {command:"/catalogmodel",name:"Catalog Views",category:"BharatShop Studio",description:"Refresh the four local ecommerce design views",requiresProduct:true,defaultCount:4,prompt:"LOCAL_STUDIO"},
 {command:"/colorway",name:"Colorway Review",category:"BharatShop Studio",description:"Show the stored original palette view",requiresProduct:true,defaultCount:4,prompt:"LOCAL_STUDIO"},
 {command:"/lookbook",name:"Lookbook Views",category:"BharatShop Studio",description:"Refresh local design presentation views",requiresProduct:true,defaultCount:4,prompt:"LOCAL_STUDIO"},
];
export function getFashionCommand(command:string){const n=String(command||"").trim().toLowerCase();return FASHION_COMMANDS.find(x=>x.command===n);}
async function getProduct(productId?:number,productName?:string){
 if(productId){const r=await pool.query(`SELECT p.id,p.title,p.brand,p.category,p.image_url,d.specifications_json,d.source_url FROM products p LEFT JOIN product_details d ON d.product_id=p.id WHERE p.id=$1 LIMIT 1`,[productId]);return r.rows[0]||null;}
 if(productName){const r=await pool.query(`SELECT p.id,p.title,p.brand,p.category,p.image_url,d.specifications_json,d.source_url FROM products p LEFT JOIN product_details d ON d.product_id=p.id WHERE p.title ILIKE $1 ORDER BY p.id LIMIT 1`,[`%${productName}%`]);return r.rows[0]||null;}
 return null;
}
export async function runFashionCommand(input:{command:string;productId?:number;productName?:string;count?:number;extraPrompt?:string}){
 const command=getFashionCommand(input.command||"/autoimage");if(!command)return{success:false,error:`Unknown fashion command: ${input.command}`,commands:FASHION_COMMANDS.map(x=>x.command)};
 const product=await getProduct(input.productId,input.productName);if(!product)return{success:false,error:`${command.command} requires a productId or productName`};
 const specs=product.specifications_json&&typeof product.specifications_json==="object"?product.specifications_json:{};
 const isStudio=product.brand==="BharatShop Studio"&&String(specs.productionSupplier||"").toLowerCase()==="qikink"&&String(specs.inventoryMode||"").toUpperCase()==="MADE_TO_ORDER";
 if(!isStudio)return{success:false,error:"Free local Fashion Studio only generates original BharatShop Studio/Qikink design views. Supplier product imagery must stay source-backed."};
 const origin=String(process.env.PUBLIC_BASE_URL||process.env.BHARATSHOP_URL||"https://bharatshop-9w4a.onrender.com").replace(/\/$/,"");
 const count=Math.max(1,Math.min(4,Number(input.count||4)));const images=Array.from({length:count},(_,i)=>`${origin}/api/fashion-art/${product.id}/${i}`);
 await pool.query(`DELETE FROM product_images WHERE product_id=$1 AND verification_provider='bharatshop-studio'`,[product.id]);
 for(let i=0;i<images.length;i++)await pool.query(`INSERT INTO product_images(product_id,image_url,source_url,sort_order,alt_text,verification_status,verification_confidence,verification_model,verification_provider,verification_metadata,verified_at) VALUES($1,$2,$3,$4,$5,'AI_GENERATED_ORIGINAL',1,'bharatshop-svg-fashion-v1','bharatshop-studio',$6,NOW())`,[product.id,images[i],product.source_url||images[i],i,`${product.title} studio view ${i+1}`,JSON.stringify({command:command.command,local:true,qikinkProductCode:specs.qikinkProductCode})]);
 await pool.query(`UPDATE products SET image_url=$2,updated_at=NOW() WHERE id=$1`,[product.id,images[0]]);
 try{await pool.query(`INSERT INTO ai_activity_logs(user_id,agent_name,action_type,message,metadata_json,status) VALUES(1,'Fashion Designer','LOCAL_STUDIO_REFRESH',$1,$2,'SUCCESS')`,[`${command.name} refreshed ${images.length} local design views for ${product.title}.`,JSON.stringify({productId:product.id,images,command:command.command})]);}catch{}
 return{success:true,command:command.command,name:command.name,productId:product.id,generated:images.length,images,persisted:true,provider:"bharatshop-local-svg-studio"};
}

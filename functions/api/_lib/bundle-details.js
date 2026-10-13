import {sbRequest} from './db.js';
export function bundleDetails(rows,items){
 const byId=new Map(rows.map(p=>[Number(p.id),p]));
 return rows.map(p=>{
  if(!p.is_bundle)return p;
  const links=items.filter(i=>Number(i.bundle_product_id)===Number(p.id));if(!links.length)return /^Bundle pack with:/i.test(p.description||'')?{...p,old_price:null,bundle_warning:'Contents are being checked. Contact ChaskaBox before ordering.'}:p;
  const contents=[];let invalid=false;
  for(const i of links){const child=byId.get(Number(i.component_product_id)),qty=Number(i.quantity);if(!child||!Number.isSafeInteger(qty)||qty<1||qty>99){invalid=true;continue;}contents.push({product_id:Number(child.id),name:child.name,pack:child.pack,quantity:qty,unit_price:Number(child.price)});}
  if(invalid)return {...p,old_price:null,bundle_contents:[],bundle_warning:'Contents are being checked. Contact ChaskaBox before ordering.'};
  const retail=contents.reduce((n,i)=>n+i.quantity*i.unit_price,0);
  return {...p,old_price:retail>Number(p.price)?retail:null,bundle_contents:contents,bundle_retail_value:retail,bundle_savings:Math.max(0,retail-Number(p.price)),bundle_warning:''};
 });
}
export async function enrichPublicBundles(env,rows){
 const ids=rows.filter(p=>p.is_bundle).map(p=>Number(p.id));if(!ids.length)return rows;
 try{const items=await sbRequest(env,'/bundle_items',{query:'?select=bundle_product_id,component_product_id,quantity&bundle_product_id=in.('+ids.join(',')+')&limit=500'});return bundleDetails(rows,items||[]);}
 catch{return rows.map(p=>p.is_bundle?{...p,...(/^Bundle pack with:/i.test(p.description||'')?{old_price:null}:{}),bundle_warning:'Contents are being checked. Contact ChaskaBox before ordering.'}:p);}
}

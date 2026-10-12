import {cataloguePhoto,photoUnderReview} from './catalogue-photos.js';
import { sbRequest, rpc } from './db.js';
import { runEmbeddings, vectorLiteral, aiAvailable } from './ai.js';
export async function publicCatalogue(env) {
  const out=[];
  for(let offset=0;offset<=10000;offset+=500) {
    const rows=await sbRequest(env,'/public_products',{query:'?select=*&order=id.asc&limit=500&offset='+offset});
    if(!Array.isArray(rows))throw new Error('Invalid catalogue response');
    if(offset===10000&&rows.length)throw new Error('Catalogue exceeds the supported complete-read size');
    out.push(...rows.map(p=>({...p,image_url:cataloguePhoto(p),image_warning:photoUnderReview(p)?'Photo under review':''})));if(rows.length<500)return out;
  }
  return out;
}
export function cleanQuery(value) { return typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,280):''; }
export function priceBounds(query) {
  const q=query.toLowerCase().replace(/,/g,'');let min=null,max=null,m;
  m=q.match(/(?:between\s*)?(\d{2,6})\s*(?:to|and|se|-)\s*(\d{2,6})/);
  if(m){min=Math.min(Number(m[1]),Number(m[2]));max=Math.max(Number(m[1]),Number(m[2]));}
  m=q.match(/(?:under|below|less than|budget(?:\s+of)?|max(?:imum)?|andar|ander)\s*(?:rs\.?|pkr)?\s*(\d{2,6})/);if(m)max=Number(m[1]);
  m=q.match(/(\d{2,6})\s*(?:rs\.?|pkr|rupe(?:e|y|es)?|rupay)?\s*(?:se\s+kam|(?:ke?|ki)\s+(?:andar|ander)|tak\b)/);if(m)max=Number(m[1]);
  m=q.match(/(?:above|over|min(?:imum)?)\s*(?:rs\.?|pkr)?\s*(\d{2,6})|(\d{2,6})\s*(?:se\s+zyada|se\s+upar)/);if(m)min=Number(m[1]||m[2]);
  return {min,max};
}
function normalized(value) {
  return String(value||'').toLowerCase().replace(/چاکلیٹ|chocolates?|choc(?:o)?\b|choclate|choklat/g,'chocolate')
    .replace(/بسکٹ|biscuits?|cookies?/g,'biscuit').replace(/چپس|chips?|crisps?/g,'chips')
    .replace(/میٹھا|meeth[ai]|mith[ai]|sweet|candies/g,'candy').replace(/چٹپٹا|chatpat[ai]|masal[ae]dar|spicy/g,'spicy')
    .replace(/نمکین|namkeen|salty/g,'salty');
}
const STOP=new Set('the and for with under below less than budget above over minimum maximum kam andar ander se tak ke ki ka k rs pkr rupe rupee rupey rupees rupay mujhe mujy mjy chahiye chahiy chahye chahiyen chaiye koi kuch kch snack snacks wala wali walay hain hai ho hon hn do dikhao batao mein main please recommend suggest find buy show'.split(' '));
function words(query) { return normalized(query).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2&&!/^\d+$/.test(w)&&!STOP.has(w)).slice(0,12); }
export function lexicalScore(p,query) {
  const n=normalized(p.name),b=normalized(p.brand),c=normalized(p.category),d=normalized(p.description),t=normalized((p.tags||[]).join(' '));
  return words(query).reduce((s,w)=>s+(n.includes(w)?8:0)+(b.includes(w)?5:0)+(t.includes(w)?5:0)+(c.includes(w)?3:0)+(d.includes(w)?1:0),0);
}
export function eligibleProducts(rows,query) {
  const bounds=priceBounds(query),q=normalized(query),essential=['chocolate','biscuit','chips','spicy','salty'].filter(w=>words(q).includes(w));
  return rows.filter(p=>{
    if(p.stock_state==='unavailable'||p.visibility&&p.visibility!=='visible')return false;
    const price=Number(p.price);if(!Number.isFinite(price)||(bounds.min!=null&&price<bounds.min)||(bounds.max!=null&&price>bounds.max))return false;
    // A mixed "Chocolates & Candies" category cannot make a gummy chocolate.
    const evidence=normalized([p.name,p.description,(p.tags||[]).join(' '),p.pack,essential.includes('chocolate')?'':p.category].join(' '));
    return essential.every(w=>evidence.includes(w));
  });
}
export function rankProducts(rows,query,semantic=[]) {
  const vectorScores=new Map(semantic.filter(p=>Number(p.similarity)>=.4).map(p=>[String(p.id),Number(p.similarity)]));
  return eligibleProducts(rows,query).map(p=>({...p,_score:lexicalScore(p,query),_semantic:vectorScores.get(String(p.id))||0}))
    .filter(p=>!words(query).length||p._score>0)
    .sort((a,b)=>b._score-a._score||b._semantic-a._semantic||Number(a.price)-Number(b.price)||Number(a.id)-Number(b.id))
    .slice(0,8).map(({_score,_semantic,...p})=>p);
}
export async function searchCatalogue(context,query,cfg={},rows) {
  const catalogue=rows||await publicCatalogue(context.env);let semantic=[],mode='deterministic';
  if(cfg.ai_semantic_search_enabled===true&&aiAvailable(context))try {
    const {embeddings,model}=await runEmbeddings(context,[query]);
    semantic=await rpc(context.env,'match_indexed_products',{p_model:model,p_query_embedding:vectorLiteral(embeddings[0]),p_match_count:20,p_match_threshold:.4});
    if(semantic.length)mode='hybrid';
  }catch{/* Paused quota or stale/unavailable index never blocks shopping. */}
  return {products:rankProducts(catalogue,query,semantic),mode};
}
export async function publicSettings(env) {
  const rows=await sbRequest(env,'/public_site_settings',{query:'?select=key,value'});
  return Object.fromEntries((rows||[]).map(r=>[r.key,r.value]));
}

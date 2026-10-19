import {SEO_CATEGORIES} from './catalogue-content.js';
import {esc} from './storefront-html.js';

// Public-only categories actually represented in the SSR catalogue.
// Avoid advertising empty sections or inventing stock, benefits or rankings.
export function relatedCategoryLinks(publicRows, currentSlug='', limit=6){
 const matched=[];
 for(const [slug,copy] of Object.entries(SEO_CATEGORIES)){
  if(slug==='shop'||slug==='bundles'||slug===currentSlug)continue;
  const count=publicRows.filter(p=>!p.is_bundle&&String(p.category||'').trim()===copy.name).length;
  if(count>0)matched.push({slug,label:copy.name,count});
 }
 return matched.slice(0,limit);
}
export function catalogueDiscoveryNav(publicRows,currentSlug=''){
 const links=relatedCategoryLinks(publicRows,currentSlug);
 if(!links.length)return '';
 const content=links.map(c=>'<a href="/category/'+encodeURIComponent(c.slug)+'/">'+esc(c.label)+'</a>').join(' · ');
 return '<nav class="catalogue-related" aria-label="Browse other snack categories" style="max-width:1000px;margin:8px auto 18px;padding:0 18px;font-size:.92rem;line-height:1.8"><strong>Explore related snack categories:</strong> '+content+' · <a href="/brands/">Browse snack brands</a></nav>';
}

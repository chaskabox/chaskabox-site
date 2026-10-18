/* Only publish sitemap <lastmod> when backed by an actual valid database date. */
export function validLastmod(value){
 if(typeof value!=='string')return '';
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
 if(!match)return '';
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 if(year<2000||month<1||month>12||day<1||day>31)return '';
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return '';
 return match[1]+'-'+match[2]+'-'+match[3];
}
export const normalizedBrandName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export function sitemapPublicBrands(rows,brands){
 const allowed=new Set(rows.map(p=>normalizedBrandName(p.brand)).filter(Boolean));
 const used=new Set();
 return (brands||[]).filter(b=>{
   const slug=String(b.slug||'');
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||used.has(slug)||!allowed.has(normalizedBrandName(b.name)))return false;
   used.add(slug);
   return true;
 });
}

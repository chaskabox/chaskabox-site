/* Header discovery preview; no changes to payments, cart, admin, or routes. */
(()=>{
'use strict';
const entries=[
['Biscuits & Wafers','/category/biscuits-and-wafers/','12.5%'],
['Bundles','/bundles/','25%'],
['Bunties & Cakes','/category/bunties-and-cakes/','37.5%'],
['Chews & Gums','/category/chews-and-gums/','50%'],
['Chocolates & Candies','/category/chocolates-and-candies/','62.5%'],
['Imli & Ice Lollies','/category/imli-and-ice-lollies/','75%'],
['Jellies & Marshmallow','/category/jellies-and-marshmallow/','87.5%'],
['Snacks & Nimco','/category/snacks-and-nimco/','100%']
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog=()=>{try{return typeof activeProducts==='function'?activeProducts():[]}catch{return[]}};
const matches=(q,s)=>typeof fuzzyMatch==='function'?fuzzyMatch(q,s):s.includes(q);
const nav=document.querySelector('#view-home .section.discover .section-head');
if(nav){
const holder=document.createElement('div');holder.className='cbx-cat-holder';
holder.innerHTML='<button type="button" class="cbx-cat-trigger" aria-expanded="false" aria-controls="cbxCatPanel"><span aria-hidden="true">▦</span> All Categories <span aria-hidden="true">⌄</span></button><section class="cbx-cat-panel" id="cbxCatPanel" aria-label="Snack categories" hidden><div class="cbx-cat-heading"><div><strong>Find your Chaska</strong><small>Explore original Pakistani snacks</small></div><a href="/shop/">View all snacks →</a></div><div class="cbx-cat-grid"></div></section>';
nav.insertBefore(holder,nav.lastElementChild);
const btn=holder.querySelector('button'),panel=holder.querySelector('section'),grid=holder.querySelector('.cbx-cat-grid');
const render=()=>{const counts=new Set(catalog().map(p=>p.category));const available=counts.size?entries.filter(e=>counts.has(e[0])):entries;grid.innerHTML=(available.length?available:entries).map(e=>'<a href="'+e[1]+'" class="cbx-cat-card"><span class="cbx-cat-photo" style="--cbx-pos:'+e[2]+'" aria-hidden="true"></span><span class="cbx-cat-name">'+esc(e[0])+'<small>Explore products →</small></span></a>').join('')};
const positionPanel=()=>{
 if(panel.hidden)return;
 const trigger=btn.getBoundingClientRect(),head=document.querySelector('body > header')?.getBoundingClientRect();
 const top=Math.max(8,head?.bottom||0);
 if(trigger.bottom<top||trigger.top>innerHeight){set(false);return;}
 holder.classList.remove('cbx-cat-opens-up');
 const down=panel.getBoundingClientRect(),anchor=panel.offsetParent?.getBoundingClientRect();
 const below=innerHeight-down.top-12,above=(anchor?.top??trigger.top)-top-21;
 const up=below<240&&above>below;
 holder.classList.toggle('cbx-cat-opens-up',up);
 const bounds=panel.getBoundingClientRect();
 const available=up?bounds.bottom-top-12:innerHeight-bounds.top-12;
 panel.style.setProperty('--cbx-category-space',Math.max(44,Math.min(600,Math.floor(available)))+'px');
};
const set=open=>{if(open)render();panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));holder.classList.toggle('is-open',open);if(open)positionPanel()};
let openTimer,closeTimer;btn.addEventListener('click',()=>set(panel.hidden));
holder.addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse')return;clearTimeout(closeTimer);openTimer=setTimeout(()=>set(true),220)});
holder.addEventListener('pointerleave',e=>{if(e.pointerType!=='mouse')return;clearTimeout(openTimer);closeTimer=setTimeout(()=>set(false),220)});
holder.addEventListener('focusout',e=>{if(!holder.contains(e.relatedTarget))set(false)});
document.addEventListener('pointerdown',e=>{if(!holder.contains(e.target))set(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){set(false);btn.focus()}});
window.addEventListener('resize',positionPanel,{passive:true});
window.addEventListener('scroll',positionPanel,{passive:true});
render();
}
// Move the REAL admin-managed navigation into the header: subsequent CMS updates
// still target .cb-subnav-links, so no separate stale or hard-coded nav copy exists.
const mainHeader=document.querySelector('header .hwrap');
const managedNav=document.querySelector('.cb-subnav-links');
const whatsapp=document.querySelector('.cb-subnav .cb-contact');
if(mainHeader&&managedNav&&whatsapp){
  managedNav.classList.add('cbx-header-links');
  managedNav.setAttribute('role','navigation');
  managedNav.setAttribute('aria-label','Shopping navigation');
  whatsapp.classList.add('cbx-header-whatsapp');
  whatsapp.setAttribute('aria-label','Order via WhatsApp');
  mainHeader.append(managedNav,whatsapp);
  document.body.classList.add("cbx-header-ready");
}
// The old stylesheet hid all floating-help text on mobile. Keep a readable
// accessible text label; do not alter AI answers, chat handlers or notifications.
const fab=document.getElementById('helpFab');
if(fab){
  fab.textContent='✦ Chaska AI';
  fab.setAttribute('aria-label','Open Chaska AI assistant');
  fab.setAttribute('title','Chaska AI – snack shopping help');
}
const aiTitle=document.querySelector('#aimodal .aihead b');
if(aiTitle)aiTitle.textContent='✦ Chaska AI';
// Original desktop autocomplete remains attached to the existing catalog and search form.
// Extend arrow/enter support to brands, categories and products (not products only).
const input=document.getElementById('headerSearch'),suggestions=document.getElementById('headerSearchSuggestions');
if(input&&suggestions){
if(/^Search for your favourite snacks/i.test(input.placeholder))input.placeholder='Search snacks, brands or Chaska Boxes…';
input.setAttribute('role','combobox');input.setAttribute('aria-controls',suggestions.id);input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
let selected=-1;
const options=()=>Array.from(suggestions.querySelectorAll('a[href]'));
input.addEventListener('input',()=>{selected=-1;input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded',String(!suggestions.hidden))});
input.addEventListener('focus',()=>{if(input.value.trim().length>=2&&typeof renderHeaderSearchSuggestions==='function'){renderHeaderSearchSuggestions(input.value);input.setAttribute('aria-expanded',String(!suggestions.hidden))}});
input.addEventListener('keydown',e=>{
if(suggestions.hidden)return;
if(e.key==='ArrowDown'||e.key==='ArrowUp'){
const items=options();if(!items.length)return;
e.preventDefault();e.stopImmediatePropagation();selected=(selected+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
items.forEach((a,i)=>{a.classList.toggle('active',i===selected);a.id='cbxSearch'+i;a.setAttribute('aria-selected',String(i===selected))});
input.setAttribute('aria-activedescendant','cbxSearch'+selected);items[selected].scrollIntoView({block:'nearest'});
}else if(e.key==='Enter'&&selected>=0){const a=options()[selected];if(a){e.preventDefault();e.stopImmediatePropagation();location.assign(a.href)}}
else if(e.key==='Escape'){suggestions.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1}
},true);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.header-search'))input.setAttribute('aria-expanded','false')});
}
// Mobile: native GET search continues to work; suggestions use only public catalog items.
const form=document.querySelector('.cb-mobile-search');
if(form){
const row=document.createElement('div');row.className='cbx-mobile-row';form.before(row);row.append(form);
// Mobile category browsing remains available in the hamburger menu and in the section below the hero.
const field=form.querySelector('input[name="q"]'),box=document.createElement('div');box.className='cbx-mobile-results';box.id='cbxMobileResults';box.setAttribute('role','listbox');box.hidden=true;form.append(box);
if(field){
field.setAttribute('role','combobox');field.setAttribute('aria-controls',box.id);field.setAttribute('aria-autocomplete','list');field.setAttribute('aria-expanded','false');
let selected=-1;const opts=()=>Array.from(box.querySelectorAll('a[href]'));
const hide=()=>{box.hidden=true;field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');selected=-1};
const render=()=>{
const q=field.value.toLowerCase().trim();if(q.length<2){hide();box.replaceChildren();return}
const all=catalog(),brands=[...new Set(all.map(p=>p.brand).filter(Boolean))].filter(v=>matches(q,String(v).toLowerCase())).slice(0,2);
const cats=[...new Set(all.map(p=>p.category).filter(Boolean))].filter(v=>matches(q,String(v).toLowerCase())).slice(0,2);
const found=all.filter(p=>matches(q,[p.name,p.category,p.brand].filter(Boolean).join(' ').toLowerCase())).slice(0,5);
const rows=[...brands.map(v=>({name:v,detail:'Brand',url:'/shop/?brand='+encodeURIComponent(v)})),...cats.map(v=>({name:v,detail:'Category',url:typeof categoryPath==='function'?categoryPath(v):'/shop/?cat='+encodeURIComponent(v)})),...found.map(p=>({name:p.name,detail:p.pack||p.category||'Product',url:typeof productHref==='function'?productHref(p.id):'/shop/',price:Number(p.price)||0}))];
box.innerHTML=rows.length?rows.map((v,i)=>'<a role="option" id="cbxMobileItem'+i+'" href="'+esc(v.url)+'"><span><b>'+esc(v.name)+'</b><small>'+esc(v.detail)+'</small></span><strong>'+(v.price?'Rs. '+v.price.toLocaleString('en-PK'):'→')+'</strong></a>').join(''):'<div class="cbx-empty">No matches — press Search to browse</div>';
box.hidden=false;field.setAttribute('aria-expanded','true');selected=-1};
field.addEventListener('input',render);field.addEventListener('focus',()=>{if(field.value.trim().length>=2)render()});
field.addEventListener('keydown',e=>{
if(e.key==='Escape'){hide();return}if(box.hidden)return;
if(e.key==='ArrowDown'||e.key==='ArrowUp'){const items=opts();if(!items.length)return;e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((a,i)=>{a.classList.toggle('active',i===selected);a.setAttribute('aria-selected',String(i===selected))});field.setAttribute('aria-activedescendant',items[selected].id);items[selected].scrollIntoView({block:'nearest'})}
else if(e.key==='Enter'&&selected>=0){const a=opts()[selected];if(a){e.preventDefault();location.assign(a.href)}}});
document.addEventListener('pointerdown',e=>{if(!row.contains(e.target))hide()});
}
}
})();

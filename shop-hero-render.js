import {SHOP_HERO_HTML} from './shop-reference-hero-markup-20261025.js';
import {defaultShopHero,resolveShopHero} from './shop-hero-config.js';
import {SHOP_HERO_CRITICAL_CSS} from './shop-hero-critical.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=s=>JSON.stringify(s).replace(/</g,'\\u003c');
const fonts={reference:'CBShopHeading',rounded:'CBShopRounded',brush:'CBShopScript',body:'CBShopBody'};
const desktopOriginal='/shop-hero-assets/reference-clean-1800-v19.webp';
const mobileOriginal='/shop-hero-assets/mobile-products-1140-v20.webp';
export function heroUsesLayers(c){const d=defaultShopHero();return c.artwork.mode==='layers'||!c.layout.showShapes||!c.layout.showDetails||c.colors.cream!==d.colors.cream||c.products.some((p,i)=>p.url||!p.visible||JSON.stringify(p.desktop)!==JSON.stringify(d.products[i].desktop));}
function picture(c){
 const mobile=c.artwork.mobileUrl===mobileOriginal?'/shop-hero-assets/mobile-products-v27.avif':c.artwork.mobileUrl;
 const source='<source media="(max-width:784px)" srcset="'+esc(mobile)+'">';
 if(c.artwork.desktopUrl!==desktopOriginal)return '<picture>'+source+'<img src="'+esc(c.artwork.desktopUrl)+'" alt="" width="1800" height="681" fetchpriority="high" decoding="async"></picture>';
 return '<picture>'+source+'<source type="image/avif" srcset="/shop-hero-assets/reference-clean-900-v27.avif 900w, /shop-hero-assets/reference-clean-1800-v27.avif 1800w" sizes="(max-width:1404px) calc(100vw - 24px), 1380px"><img src="'+desktopOriginal+'" alt="" width="1800" height="681" fetchpriority="high" decoding="async"></picture>';
}
export function renderShopHero(input){
 const c=resolveShopHero(input),d=defaultShopHero();if(!c.enabled)return '';
 const layers=heroUsesLayers(c);
 const headingFont=c.type.headingFont==='reference'&&(c.heading!==d.heading||c.type.headingShape!=='reference')?'CBShopRounded':fonts[c.type.headingFont];
 const phraseFont=c.type.phraseFont==='reference'?'CBShopBrush':fonts[c.type.phraseFont];
 let html=SHOP_HERO_HTML;
 html=html.replace('<div id="cb-shop-hero"','<div id="cb-shop-hero" class="'+(layers?'cb-layer-mode ':'')+(c.type.headingShape==='arc'?'cb-arc-heading ':'')+(c.artwork.desktopUrl===desktopOriginal?'cb-original-desktop ':'')+(c.artwork.mobileUrl===mobileOriginal?'cb-original-mobile':'')+'"');
 html=html.replace(/<picture>[\s\S]*?<\/picture>/,picture(c));
 for(const [cls,text]of [['cb-eyebrow',c.eyebrow],['cb-hero-description',c.description],['cb-tagline',c.tagline]])html=html.replace(new RegExp('(<p class="'+cls+'"[^>]*>)[\\s\\S]*?</p>'),(_,start)=>start+esc(text).replace(/\n/g,'<br>')+'</p>');
 const title=c.type.headingShape==='arc'?'<svg viewBox="0 0 700 160" role="img" aria-label="'+esc(c.heading)+'"><defs><path id="cb-shop-arc" d="M 15 120 Q 350 '+(120-c.type.curve*2)+' 685 120"/></defs><text><textPath href="#cb-shop-arc" startOffset="50%" text-anchor="middle">'+esc(c.heading)+'</textPath></text></svg>':esc(c.heading);
 html=html.replace(/(<h2\b[^>]*>)[\s\S]*?<\/h2>/,(_,start)=>start+title+'</h2>');
 html=html.replace(/(<p class="cb-flavour"[^>]*>)[\s\S]*?<\/p>/,(_,start)=>start+esc(c.phrases[0])+'</p>');
 for(const [key,cls]of [['primary','cb-primary-action'],['secondary','cb-bundle-action']]){
  const b=c[key];html=html.replace(new RegExp('<a class="'+cls+'"[^>]*>[\\s\\S]*?</a>'),()=>b.visible?'<a class="'+cls+'"'+(key==='primary'&&b.url==='#catTitle'?' data-shop-catalogue':'')+' href="'+esc(b.url)+'">'+esc(b.label)+(key==='primary'?' <span aria-hidden="true">→</span>':'')+'</a>':'');
 }
 html=html.replace(/<(?:nav|div) class="cb-pagination"[\s\S]*?<\/(?:nav|div)>/,()=>c.layout.showDots?'<nav class="cb-pagination" aria-label="Hero slides">'+c.phrases.map((p,i)=>'<button type="button" data-slide="'+i+'" aria-label="Slide '+(i+1)+': '+esc(p.replace(/\.$/,''))+'" aria-current="'+(i===0)+'"><span></span></button>').join('')+'</nav>':'');
 // Sprite coordinates remain percentages, so the optimized atlas is interchangeable.
 const atlas=c.artwork.mobileUrl===mobileOriginal?'/shop-hero-assets/mobile-products-v27.avif':c.artwork.mobileUrl;
 html=html.replaceAll(mobileOriginal,esc(atlas));
 let desktop='';const productCss=[];
 for(const [i,p]of c.products.entries()){
  const re=new RegExp('<span class="cb-mobile-packet cb-packet-'+p.key+'"[^>]*>[\\s\\S]*?</span>');const packet=re.exec(html)?.[0]||'';
  if(layers&&p.visible)desktop+=packet.replace('cb-mobile-packet','cb-desktop-packet').replace(/loading="lazy"/g,'loading="eager"');
  if(!p.visible)html=html.replace(re,'');
  if(p.url){
   const replacement=packet.replace(/<img[^>]*>/,()=>'<img class="cb-custom-product" src="'+esc(p.url)+'" alt="" width="300" height="300" loading="lazy" decoding="async">').replace(/ style="[^"]*"/,'');
   html=html.replace(re,replacement);desktop=desktop.replace(re,replacement.replace('cb-mobile-packet','cb-desktop-packet'));
   // Desktop uses the same slot, with its own position and scale.
   desktop=desktop.replace(new RegExp('(<span class="cb-desktop-packet cb-packet-'+p.key+'"[^>]*>)[\\s\\S]*?</span>'),(_,start)=>start+'<img class="cb-custom-product" src="'+esc(p.url)+'" alt="" width="300" height="300" decoding="async"></span>');
  }
  const m=p.mobile,dm=d.products[i].mobile,a=p.desktop;
  productCss.push('#cb-shop-hero .cb-desktop-packet.cb-packet-'+p.key+'{left:'+a.x+'%;top:'+a.y+'%;width:'+a.width+'%;rotate:'+a.rotation+'deg}');
  if(JSON.stringify(m)!==JSON.stringify(dm))productCss.push('@container(max-width:760px){#cb-shop-hero .cb-mobile-packet.cb-packet-'+p.key+'{left:auto;right:auto;'+(i<3?'left':'right')+':'+m.x+'px;top:'+m.y+'px;width:clamp(60px,'+m.width+'cqw,180px);rotate:'+m.rotation+'deg}}');
 }
 if(desktop)html=html.replace('<div class="cb-hero-copy">','<div class="cb-desktop-products" aria-hidden="true">'+desktop+'</div><div class="cb-hero-copy">');
 const vars=Object.entries({blue:c.colors.navy,orange:c.colors.orange,cream:c.colors.cream,'cb-heading-font':headingFont,'cb-phrase-font':phraseFont,'cb-float':c.animation.floatDuration+'s','cb-mobile-float':c.animation.mobileFloatDuration+'s','cb-transition':c.animation.transitionDuration+'s'}).map(([k,v])=>'--'+k+':'+v).join(';');
 html=html.replace(' data-slide="0"',' style="'+vars+'" data-slide="0"');
 const customHeading=c.type.headingFont!=='reference'||c.heading!==d.heading||c.type.headingShape!=='reference';
 const rules=[],mobile=[],small=[];
 const rule=(selector,body)=>'#cb-shop-hero '+selector+'{'+body+'}';
 if(c.layout.desktopRatio!==d.layout.desktopRatio)rules.push('@container(min-width:761px){'+rule('.cb-hero','aspect-ratio:'+c.layout.desktopRatio)+'}');
 if(c.colors.cream!==d.colors.cream)rules.push(rule('.cb-hero','background-color:var(--cream)'));
 if(layers&&c.artwork.desktopUrl!==desktopOriginal)rules.push('#cb-shop-hero.cb-layer-mode .cb-hero{background-image:url("'+c.artwork.desktopUrl+'");background-size:cover;background-position:center}');
 const copy=[];
 if(c.layout.copyWidth!==d.layout.copyWidth)copy.push('width:'+c.layout.copyWidth+'%');
 if(c.layout.copyTop!==d.layout.copyTop)copy.push('padding-top:'+c.layout.copyTop+'cqw');
 if(copy.length)rules.push('@container(min-width:761px){'+rule('.cb-hero-copy',copy.join(';'))+'}');
 if(customHeading||c.type.headingScale!==1||c.type.mobileHeadingScale!==1){
  rules.push(rule('.cb-hero h2','font-family:var(--cb-heading-font),Arial,sans-serif;font-size:calc('+(customHeading?6.3:11.7)+'cqw * '+c.type.headingScale+');'+(customHeading?'white-space:normal;line-height:1.02;':'')));
  mobile.push(rule('.cb-hero h2','font-size:calc('+(customHeading?'11cqw':'clamp(68px,21.5cqw,145px)')+' * '+c.type.mobileHeadingScale+')'));
  small.push('@container(max-width:520px){'+rule('.cb-hero h2','font-size:calc('+(customHeading?11:21.5)+'cqw * '+c.type.mobileHeadingScale+')')+'}');
 }
 if(c.type.phraseFont!=='reference'||c.type.phraseScale!==1||c.type.mobilePhraseScale!==1){
  rules.push(rule('.cb-flavour','font-family:var(--cb-phrase-font),CBShopScript,cursive;font-size:calc(5.5cqw * '+c.type.phraseScale+')'));
  mobile.push(rule('.cb-flavour','font-size:calc(clamp(37px,10cqw,58px) * '+c.type.mobilePhraseScale+')'));
  small.push('@container(max-width:520px){'+rule('.cb-flavour','font-size:calc(clamp(30px,9.7cqw,46px) * '+c.type.mobilePhraseScale+')')+'}');
 }
 if(c.type.bodyScale!==1){rules.push(rule('.cb-hero-description','font-size:calc(1.37cqw * '+c.type.bodyScale+')'),rule('.cb-hero-actions a','font-size:calc(1.1cqw * '+c.type.bodyScale+')'));mobile.push(rule('.cb-hero-description','font-size:calc(12px * '+c.type.bodyScale+')'),rule('.cb-hero-actions a','font-size:calc(12px * '+c.type.bodyScale+')'));}
 if(c.type.headingShape==='arc'){rules.push('#cb-shop-hero.cb-arc-heading svg{font-size:calc(76px * '+c.type.headingScale+')}');mobile.push('#cb-shop-hero.cb-arc-heading svg{font-size:calc(76px * '+c.type.mobileHeadingScale+')}');}
 if(c.colors.primaryText!==d.colors.primaryText)rules.push(rule('.cb-primary-action','color:'+c.colors.primaryText));
 if(c.colors.secondaryBackground!==d.colors.secondaryBackground)rules.push(rule('.cb-bundle-action','background:'+c.colors.secondaryBackground+'77'));
 if(c.layout.eyebrowBadge)rules.push(rule('.cb-eyebrow','background:'+c.colors.eyebrowBackground+';padding:.45em 1em;border-radius:999px;width:fit-content;margin-inline:auto'));
 if(!c.layout.showTagline)rules.push(rule('.cb-tagline','display:none'));
 if(!c.layout.showPause)rules.push(rule('.cb-pause','display:none'));
 if(!c.layout.showDetails)rules.push(rule('.cb-mobile-detail,#cb-shop-hero .cb-mobile-spark','display:none'));
 if(!c.layout.showShapes)rules.push(rule('.cb-mobile-art:before,#cb-shop-hero .cb-mobile-art:after,#cb-shop-hero.cb-layer-mode .cb-hero:before,#cb-shop-hero.cb-layer-mode .cb-hero:after','display:none'));
 if(c.layout.mobileHeight!==d.layout.mobileHeight)mobile.push(rule('.cb-hero','min-height:'+c.layout.mobileHeight+'px'));
 if(c.layout.mobileCopyTop!==d.layout.mobileCopyTop)mobile.push(rule('.cb-hero','padding-top:'+c.layout.mobileCopyTop+'px'));
 // Wide mobile rules precede the small-phone overrides above.
 const css=rules.join('')+(mobile.length?'@container(max-width:760px){'+mobile.join('')+'}':'')+small.join('')+productCss.join('');
 return html.replace('</section>','<style data-shop-hero-settings>'+css+'</style><script type="application/json" class="cb-shop-settings">'+json(c)+'</script></section>');
}
export function renderShopHeroHead(input){
 const c=resolveShopHero(input);if(!c.enabled)return '';
 const art=c.artwork.desktopUrl===desktopOriginal?'/shop-hero-assets/reference-clean-1800-v27.avif':c.artwork.desktopUrl;
 const mobile=c.artwork.mobileUrl===mobileOriginal?'/shop-hero-assets/mobile-products-v27.avif':c.artwork.mobileUrl;
 return (!heroUsesLayers(c)?'<link rel="preload" as="image" href="'+esc(art)+'"'+(c.artwork.desktopUrl===desktopOriginal?' imagesrcset="/shop-hero-assets/reference-clean-900-v27.avif 900w, /shop-hero-assets/reference-clean-1800-v27.avif 1800w" imagesizes="(max-width:1404px) calc(100vw - 24px), 1380px"':'')+' media="(min-width:785px)" fetchpriority="high">':'')+
 '<link rel="preload" as="image" href="'+esc(mobile)+'" media="(max-width:784px)" fetchpriority="high">'+
 '<style id="cb-shop-hero-style">'+SHOP_HERO_CRITICAL_CSS+'</style>'+
 '<script type="module" src="/shop-reference-hero-20261025.js?v=20261025-firstpaint1"></script>';
}

// Public presentation data only. Shared by the editor, API and server renderer.
export const HERO_PRODUCT_KEYS=['mint','fruit','masala','imli','jelly','candy'];
export const HERO_FONTS=['reference','rounded','brush','body'];
const positions=[[-3,48,22,10,2,17],[-3,162,24,-1,22,20],[-3,246,28,10,53,24],[-5,38,24,73,0,23],[-3,169,25,84,29,17],[-3,254,23.5,76,65,20]];
export function defaultShopHero(){
 return {enabled:true,eyebrow:'PAKISTAN KA APNA SNACK BOX',heading:'Bachpan ka Zaiqa.',description:'Favourite candies aur chatpatay snacks,\nek box mein, ghar tak.',tagline:'Nostalgic favourites. Naya chaska.',phrases:['Meetha bhi.','Chatpata bhi.','Crunchy bhi.'],
 primary:{label:'Shop All Snacks',url:'#catTitle',visible:true},secondary:{label:'Explore Bundles',url:'/bundles/',visible:true},
 colors:{navy:'#0d2647',orange:'#ff731a',cream:'#fff5e6',primaryText:'#0d2647',secondaryBackground:'#fff7ec',eyebrowBackground:'#fff5e6'},
 type:{headingFont:'reference',phraseFont:'reference',headingScale:1,mobileHeadingScale:1,phraseScale:1,mobilePhraseScale:1,bodyScale:1,headingShape:'reference',curve:32},
 layout:{desktopRatio:2.64,mobileHeight:440,copyWidth:46,copyTop:3.35,mobileCopyTop:24,eyebrowBadge:false,showTagline:true,showDots:true,showPause:true,showDetails:true,showShapes:true},
 animation:{enabled:true,interval:3,floatDuration:7,mobileFloatDuration:4.8,transitionDuration:.45},
 artwork:{mode:'original',desktopUrl:'/shop-hero-assets/reference-clean-1800-v19.webp',mobileUrl:'/shop-hero-assets/mobile-products-1140-v20.webp'},
 products:HERO_PRODUCT_KEYS.map((key,i)=>({key,url:'',visible:true,desktop:{x:positions[i][3],y:positions[i][4],width:positions[i][5],rotation:0},mobile:{x:positions[i][0],y:positions[i][1],width:positions[i][2],rotation:0}}))};
}
export function safeHeroUrl(value,{image=false}={}){
 if(typeof value!=='string'||!value||value.length>1000||/[\s\\"'<>\u0000-\u001f\u007f]/.test(value))return false;
 if(!image&&/^#[a-zA-Z][\w-]*$/.test(value))return true;
 if(/^\/(?!\/)/.test(value))return !value.includes('..');
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function shape(value,defaults,path='hero'){
 if(!object(value))throw Error(path+' must be an object');
 for(const key of Object.keys(value))if(!Object.hasOwn(defaults,key))throw Error('Unknown '+path+' field: '+key);
}
function bounded(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(label+' must be between '+min+' and '+max);}
export function validateShopHero(input){
 const d=defaultShopHero();shape(input,d);
 if(JSON.stringify(input).length>20000)throw Error('Hero settings exceed 20 KB');
 const out={...d,...input};
 for(const key of ['primary','secondary','colors','type','layout','animation','artwork']){if(Object.hasOwn(input,key))shape(input[key],d[key],key);out[key]={...d[key],...input[key]};}
 for(const [key,max]of [['eyebrow',100],['heading',100],['description',400],['tagline',160]])if(typeof out[key]!=='string'||out[key].length>max||/[<>\u0000-\u001f]/.test(out[key].replace(/\n/g,'')))throw Error('Use plain text for '+key+' (up to '+max+' characters)');
 if(!out.heading.trim())throw Error('Enter a hero heading');
 if(typeof out.enabled!=='boolean')throw Error('Hero visibility must be on or off');
 if(!Array.isArray(out.phrases)||out.phrases.length<1||out.phrases.length>5||out.phrases.some(s=>typeof s!=='string'||!s.trim()||s.length>80||/[<>\u0000-\u001f]/.test(s)))throw Error('Enter one to five short phrases');
 for(const key of ['primary','secondary']){const b=out[key];if(typeof b.visible!=='boolean'||typeof b.label!=='string'||!b.label.trim()||b.label.length>60||!safeHeroUrl(b.url))throw Error('Enter a button label and an internal path or HTTPS link');}
 for(const color of Object.values(out.colors))if(typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw Error('Use six-digit hex colors');
 if(!HERO_FONTS.includes(out.type.headingFont)||!HERO_FONTS.includes(out.type.phraseFont)||!['reference','straight','arc'].includes(out.type.headingShape))throw Error('Choose an available font and heading shape');
 for(const key of ['headingScale','mobileHeadingScale','phraseScale','mobilePhraseScale','bodyScale'])bounded(out.type[key],.5,1.6,key);
 bounded(out.type.curve,-100,100,'Heading curve');
 for(const [key,min,max]of [['desktopRatio',1.8,4],['mobileHeight',360,800],['copyWidth',30,65],['copyTop',0,10],['mobileCopyTop',12,100]])bounded(out.layout[key],min,max,key);
 for(const key of ['eyebrowBadge','showTagline','showDots','showPause','showDetails','showShapes'])if(typeof out.layout[key]!=='boolean')throw Error(key+' must be on or off');
 if(typeof out.animation.enabled!=='boolean')throw Error('Animation must be on or off');
 for(const [key,min,max]of [['interval',1.5,20],['floatDuration',3,25],['mobileFloatDuration',3,25],['transitionDuration',.1,1.5]])bounded(out.animation[key],min,max,key);
 if(!['original','layers'].includes(out.artwork.mode)||!safeHeroUrl(out.artwork.desktopUrl,{image:true})||!safeHeroUrl(out.artwork.mobileUrl,{image:true}))throw Error('Choose artwork mode and valid image URLs');
 if(!Array.isArray(out.products)||out.products.length!==6)throw Error('Keep all six product slots; use visibility to hide a slot');
 out.products=out.products.map((p,i)=>{
  const base=d.products[i];shape(p,base,'product');const q={...base,...p};
  if(q.key!==base.key||typeof q.visible!=='boolean'||typeof q.url!=='string'||q.url&&!safeHeroUrl(q.url,{image:true}))throw Error('Invalid product image or slot');
  for(const device of ['desktop','mobile']){if(p[device]!==undefined)shape(p[device],base[device],device);q[device]={...base[device],...p[device]};for(const [key,min,max]of [['x',-40,110],['y',-50,device==='mobile'?800:110],['width',5,60],['rotation',-90,90]])bounded(q[device][key],min,max,device+' '+key);}
  return q;
 });
 return out;
}
export function resolveShopHero(input){try{return validateShopHero(input||{});}catch{return defaultShopHero();}}
export function shopHeroFromManifest(manifest){const row=manifest?.sections?.find(r=>r.section_key==='shop_hero');const cfg=resolveShopHero(row?.config);if(row?.enabled===false)cfg.enabled=false;return cfg;}

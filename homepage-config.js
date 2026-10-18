// Shared validation for the protected homepage editor and its public renderer.
export const HOMEPAGE_KEYS = new Set(['hero','categories','chaska_picks','deals','boxes','chatpata_picks','new_items','how_it_works','faq','announcement_bar','trust_bar','why_chaskabox','promotions','box_spotlight']);
export const PRODUCT_SECTIONS = new Set(['hero','chaska_picks','deals','boxes','chatpata_picks','new_items']);
export function safeHomepageLink(value) {
  if(typeof value!=='string'||!value||value.length>500||/[\s\\"'<>\u0000-\u001f\u007f]/.test(value))return false;
  if(/^\/(?!\/)/.test(value))return true;
  try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
export function validateHomepageConfig(key,config) {
  if(!HOMEPAGE_KEYS.has(key)||!config||typeof config!=='object'||Array.isArray(config)||JSON.stringify(config).length>20000)throw Error('Invalid homepage configuration');
  if(Object.hasOwn(config,'product_ids')){
    const ids=config.product_ids;
    if(!Array.isArray(ids)||ids.length>50||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw Error('Choose up to 50 distinct positive product IDs');
  }
  if(Object.hasOwn(config,'slides')){
    if(key!=='hero'||!Array.isArray(config.slides)||config.slides.length<1||config.slides.length>3)throw Error('Hero slides must contain 1–3 slide objects');
    for(const slide of config.slides){
      if(!slide||typeof slide!=='object'||Array.isArray(slide))throw Error('Each hero slide must be an object');
      for(const [field,value] of Object.entries(slide)){
        if(!['label','kick','eyebrow','heading','highlight','description','primary','secondary','href','secondHref'].includes(field)||typeof value!=='string'||value.length>(field==='description'?300:field.endsWith('Href')||field==='href'?500:160))throw Error('Invalid hero slide field');
        if((field==='href'||field==='secondHref')&&!safeHomepageLink(value))throw Error('Use an internal /path or secure HTTPS button link');
      }
    }
  }
  for(const field of ['button_text','highlight'])if(Object.hasOwn(config,field)&&(typeof config[field]!=='string'||config[field].length>160))throw Error('Invalid hero text');
  if(Object.hasOwn(config,'button_url')&&!safeHomepageLink(config.button_url))throw Error('Use an internal /path or secure HTTPS button link');
  if(Object.hasOwn(config,'items')){
    if(key!=='faq'||!Array.isArray(config.items)||config.items.length>10)throw Error('FAQ must contain up to 10 questions');
    for(const item of config.items)if(!item||typeof item!=='object'||typeof item.q!=='string'||!item.q.trim()||item.q.length>180||typeof item.a!=='string'||!item.a.trim()||item.a.length>1200)throw Error('Each FAQ needs a question and answer');
  }
  return config;
}
export function buildHomepageDraft(key,current,fields) {
  const draft={...(current||{})};
  if(PRODUCT_SECTIONS.has(key)){
    if(fields.automaticProducts)delete draft.product_ids;
    else draft.product_ids=String(fields.productIds||'').trim()?String(fields.productIds).split(',').map(s=>Number(s.trim())):[];
  }
  // Earlier editors added this field to non-product sections. Remove that inert data.
  else delete draft.product_ids;
  if(key==='hero'){
    for(const [field,value] of [['button_text',fields.buttonText],['button_url',fields.buttonUrl]]){
      if(String(value||'').trim())draft[field]=String(value).trim();else delete draft[field];
    }
    if(String(fields.slides||'').trim())draft.slides=JSON.parse(fields.slides);else delete draft.slides;
  }
  if(key==='faq'){if(String(fields.faq||'').trim())draft.items=JSON.parse(fields.faq);else delete draft.items;}
  if(key==='how_it_works')draft.packing_video_url=String(fields.packingVideo||'').trim();
  return validateHomepageConfig(key,draft);
}

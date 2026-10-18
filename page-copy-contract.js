import {PAGE_COPY_DEFINITIONS} from './page-copy-defaults.js';
export {PAGE_COPY_DEFINITIONS};
export function copyKey(text){let n=2166136261;for(const c of String(text).replace(/\s+/g,' ').trim())n=Math.imul(n^c.codePointAt(0),16777619)>>>0;return 't_'+n.toString(16).padStart(8,'0');}
export function pageKeyForPath(path){
 path=path.replace(/\/index\.html$/,'/');
 if(path==='/bag/'||path==='/bag')return 'cart';
 if(/^\/product\/[^/]+\/?$/.test(path))return 'product';
 if(/^\/brand\/[^/]+\/?$/.test(path))return 'brand';
 return Object.keys(PAGE_COPY_DEFINITIONS).find(k=>k!=='shared'&&PAGE_COPY_DEFINITIONS[k].path===path)||null;
}
export function validatePageCopy(key,value){
 const definition=PAGE_COPY_DEFINITIONS[key];if(!definition)throw Error('Unknown page');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['seo_title','seo_description','fields'].includes(k)))throw Error('Invalid page content');
 if(new TextEncoder().encode(JSON.stringify(value)).length>64000)throw Error('Page content exceeds 64 KB');
 const out={fields:{}};
 for(const [name,limit] of [['seo_title',70],['seo_description',170]])if(Object.hasOwn(value,name)){
  if(!definition.seo_editable)throw Error('Edit this page SEO in its catalogue editor');
  if(typeof value[name]!=='string'||value[name].length>limit||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[name]))throw Error('Invalid '+name);
  if(value[name].trim())out[name]=value[name].trim();
 }
 if(value.fields!==undefined){
  if(!value.fields||typeof value.fields!=='object'||Array.isArray(value.fields))throw Error('Text fields must be an object');
  for(const [field,text] of Object.entries(value.fields)){
   if(!Object.hasOwn(definition.fields,field))throw Error('Unknown text field: '+field);
   if(typeof text!=='string'||text.length>3000||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('Use plain text (maximum 3,000 characters)');
   // Defaults are omitted so future factual/template fixes remain effective.
   if(text!==definition.fields[field].text)out.fields[field]=text;
  }
 }
 return out;
}

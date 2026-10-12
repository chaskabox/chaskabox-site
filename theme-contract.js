export const DEFAULT_THEME={primary_color:'#1a2b5c',accent_color:'#f5b301',background_color:'#faf7f0',text_color:'#1c2333',font_family:'system-ui',border_radius:'14',logo_url:'',favicon_url:'',announcement_enabled:'true',announcement_text:''};
export function contrast(a,b){
 const lum=x=>{const c=x.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function validateTheme(input,{partial=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Theme must be an object');
 const out={};
 for(const [k,v] of Object.entries(input)){
  if(!Object.hasOwn(DEFAULT_THEME,k)){if(partial)continue;throw new Error('Unsupported theme token: '+k);}
  if(typeof v!=='string')throw new Error('Theme values must be strings');
  if(k.endsWith('_color')&&!/^#[0-9a-f]{6}$/i.test(v))throw new Error('Colors need six hex digits');
  if(k==='border_radius'&&!/^(?:[0-9]|1[0-9]|2[0-4])$/.test(v))throw new Error('Radius must be 0..24');
  if(k==='font_family'&&!['system-ui','Inter, system-ui','Georgia, serif',"'Segoe UI', system-ui"].includes(v))throw new Error('Unsupported font');
  if(k.endsWith('_url')&&v&&!/^(\/[^/]|https:\/\/)[^\s"'<>]*$/.test(v))throw new Error('Unsafe image URL');
  if(k==='announcement_enabled'&&!['true','false'].includes(v))throw new Error('Announcement flag must be true/false');
  if(k==='announcement_text'&&v.length>300)throw new Error('Announcement too long');
  out[k]=v;
 }
 const t={...DEFAULT_THEME,...out};
 if(contrast(t.text_color,t.background_color)<4.5||contrast(t.primary_color,'#ffffff')<4.5||contrast(t.text_color,'#ffffff')<4.5||contrast(t.primary_color,t.background_color)<4.5||contrast(t.primary_color,t.accent_color)<4.5)throw new Error('Theme text and primary buttons need at least 4.5:1 contrast');
 return partial?out:t;
}
export function readableTheme(input){
 const out={};
 if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [key,value] of Object.entries(input)){
  if(!Object.hasOwn(DEFAULT_THEME,key))continue;
  try{Object.assign(out,validateTheme({[key]:value},{partial:true}));}catch{}
 }
 try{return validateTheme(out,{partial:true});}catch{
  for(const key of Object.keys(out))if(key.endsWith('_color'))delete out[key];
  return out;
 }
}

import {IMAGE_VARIANTS} from './image-variants.js';
const esc=s=>String(s).replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]));
export function imageAttributes(src,sizes='(max-width:700px) 45vw, 260px'){
 const path=String(src||'').replace(/^https:\/\/chaskabox\.online\//,'').replace(/^\//,'');
 const sources=IMAGE_VARIANTS[path];
 if(!sources)return 'src="'+esc(src)+'"';
 return 'src="'+esc(sources[0].src)+'" srcset="'+sources.map(v=>esc(v.src)+' '+v.width+'w').join(', ')+'" sizes="'+esc(sizes)+'"';
}

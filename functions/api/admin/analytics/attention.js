import {withAdmin,sb,json} from '../_lib/auth.js';
import {callRpc} from './_lib/helpers.js';
import {publicCatalogue} from '../../_lib/catalogue-search.js';
import {LOCAL_PHOTOS} from '../../_lib/local-photos.js';
export const onRequestGet=withAdmin(['owner','manager'],async context=>{
 const [data,products]=await Promise.all([callRpc(context,sb,'analytics_attention',{}),publicCatalogue(context.env)]);
 if(!Array.isArray(data?.items))throw new Error('Attention data unavailable');
 const missing=products.filter(p=>!p.image_warning&&(!p.image_url||!/^https:\/\//i.test(p.image_url)&&!LOCAL_PHOTOS.has(String(p.image_url).replace(/^\/?(?:\.\/)?/,''))));
 const review=products.filter(p=>p.image_warning);
 data.items=data.items.filter(x=>x.type!=='missing_images');
 for(const [type,title,list] of [['missing_images','Visible products missing usable photos',missing],['photo_review','Product photos needing review',review]])if(list.length)data.items.push({type,severity:'medium',title,count:list.length,detail:list.length+' product(s). Examples: '+list.slice(0,3).map(p=>p.name).join(', '),link:'/admin#products'});
 return json({ok:true,data});
});

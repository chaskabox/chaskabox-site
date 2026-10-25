import {withAdmin,sb,json,httpError,readJson} from '../_lib/auth.js';
import {cmsMutate} from '../_lib/cms-mutate.js';
import {validateShopHero} from '../../../../shop-hero-config.js';
async function read(context){const rows=await sb(context,'/rest/v1/homepage_sections?section_key=eq.shop_hero&select=section_key,config,draft_config,updated_at&limit=1');if(!rows?.[0])httpError('Shop hero editor is not initialized',503,'hero_not_ready');return rows[0];}
function valid(input){try{return validateShopHero(input);}catch(e){httpError(e.message,400,'invalid_hero');}}
function version(body,row){if(typeof body.expected_updated_at!=='string'||body.expected_updated_at!==row.updated_at)httpError('This hero changed in another session. Reload before saving.',409,'hero_conflict');}
export const onRequestGet=withAdmin(['owner','manager','content'],async context=>json({section:await read(context)}));
export const onRequestPatch=withAdmin(['owner','manager','content'],async(context,{user})=>{
 const body=await readJson(context.request),config=valid(body.config),row=await read(context);version(body,row);
 const saved=await cmsMutate(context,user,[{table:'homepage_sections',op:'update',id:'shop_hero',expected_updated_at:row.updated_at,data:{draft_config:config,updated_by:user.id}}]);
 return json({section:saved[0],published:false});
});
export const onRequestPost=withAdmin(['owner','manager'],async(context,{user})=>{
 const body=await readJson(context.request),row=await read(context);version(body,row);valid(row.draft_config);
 const saved=await cmsMutate(context,user,[{table:'homepage_sections',op:'publish',id:'shop_hero',expected_updated_at:row.updated_at}]);
 return json({section:saved[0],published:true});
});

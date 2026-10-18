import {withAdmin,json,httpError,readJson,sb} from '../_lib/auth.js';
import {PAGE_COPY_DEFINITIONS,validatePageCopy} from '../../../../page-copy-contract.js';
const call=(context,name,body)=>sb(context,'/rest/v1/rpc/'+name,{method:'POST',body});
export const onRequestGet=withAdmin(['owner','manager','content'],async context=>{
 const key=new URL(context.request.url).searchParams.get('key');
 if(key){if(!Object.hasOwn(PAGE_COPY_DEFINITIONS,key))httpError('Unknown page',404);return json({page:await call(context,'admin_page_copy_get',{p_key:key}),definition:PAGE_COPY_DEFINITIONS[key]});}
 const stored=await call(context,'admin_page_copy_list',{});
 return json({pages:Object.entries(PAGE_COPY_DEFINITIONS).map(([key,p])=>({key,path:p.path,name:p.name,fields:Object.keys(p.fields).length,...stored.find(s=>s.key===key)}))});
});
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user,role})=>{
 const body=await readJson(context.request,70000),{key,action,expected_revision,version_id}=body;
 if(!Object.hasOwn(PAGE_COPY_DEFINITIONS,key)||!['draft','publish','rollback'].includes(action)||!Number.isSafeInteger(expected_revision)||expected_revision<0)httpError('Invalid page action or revision',422);
 if(action!=='draft'&&!['owner','manager'].includes(role))httpError('Only owner/manager can publish pages',403,'forbidden_role');
 let content=null;
 if(action==='draft')try{content=validatePageCopy(key,body.content);}catch(e){httpError(e.message,422,'invalid_content');}
 if(action==='rollback'&&(!Number.isSafeInteger(version_id)||version_id<1))httpError('Invalid version',422);
 try{return json({page:await call(context,'admin_page_copy_mutate',{p_actor:user.id,p_key:key,p_action:action,p_expected:expected_revision,p_content:content,p_version:version_id??null})});}
 catch(e){if(e instanceof Response){let message='';try{message=(await e.clone().json())?.error?.message||'';}catch{}if(message.includes('STALE_PAGE'))httpError('This page changed in another session. Reload and review before saving.',409,'content_conflict');}throw e;}
});

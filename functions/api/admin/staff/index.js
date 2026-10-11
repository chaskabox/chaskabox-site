import { withAdmin, sb, json, readJson, httpError, audit, env, requireMfa } from '../_lib/auth.js';
const ROLES=new Set(['owner','manager','fulfilment','content']);
export const onRequestGet=withAdmin(['owner'],async(context)=>{const rows=await sb(context,'/rest/v1/admin_roles?select=user_id,role,active,granted_by,granted_at&order=granted_at.asc');return json({staff:rows||[]});});
export const onRequestPost=withAdmin(['owner'],async(context,{user,role})=>{
 requireMfa(user);
 const body=await readJson(context.request);const email=String(body.email||'').trim().toLowerCase();const newRole=String(body.role||'');if(!email.includes('@')||!ROLES.has(newRole))httpError('valid email and role required',400,'invalid_staff');
 const e=env(context);const r=await fetch(`${String(e.SUPABASE_URL).replace(/\/+$/,'')}/auth/v1/invite`,{method:'POST',headers:{apikey:e.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email})});
 let invited=null;try{invited=await r.json();}catch{} if(!r.ok||!invited?.id)httpError('Could not invite staff. Check Supabase Auth email configuration.',502,'invite_failed');
 const rows=await sb(context,'/rest/v1/admin_roles',{method:'POST',body:{user_id:invited.id,role:newRole,active:true,granted_by:user.id}});
 await audit(context,{actorId:user.id,actorRole:role,action:'role.assigned',entityType:'role',entityId:invited.id,before:null,after:{role:newRole,email}});
 return json({staff:rows?.[0]||{user_id:invited.id,role:newRole,active:true},email},201);
});
export const onRequestPatch=withAdmin(['owner'],async(context,{user})=>{
 requireMfa(user);
 const body=await readJson(context.request);const id=String(body.user_id||'');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))httpError('Valid user_id required',400);
 const patch={};if(body.role!==undefined)patch.role=body.role;if(body.active!==undefined)patch.active=body.active;
 if(!Object.keys(patch).length)httpError('A change is required',400);
 const result=await sb(context,'/rest/v1/rpc/admin_staff_update',{method:'POST',body:{p_actor:user.id,p_target:id,p_patch:patch}});
 if(result?.error)httpError(result.error,result.status||409,result.code||'staff_update_failed');
 return json(result);
});

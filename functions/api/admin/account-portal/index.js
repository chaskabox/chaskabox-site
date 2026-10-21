import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
import {accountRpc} from '../_lib/customer-account.js';
import {portalConfig} from '../../../../account-portal-contract.js';

export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const rows=await sb(c,'/rest/v1/site_settings?key=eq.account_portal&select=value,updated_at');
 return json({portal:portalConfig(rows?.[0]?.value||{}),updated_at:rows?.[0]?.updated_at||null});
});
export const onRequestPatch=withAdmin(['owner'],async(c,{user})=>{
 const body=await readJson(c.request,4096);let value;
 try{value=portalConfig(body.portal,true);}catch(e){httpError(e.message,422,'invalid_portal');}
 if(!Object.hasOwn(body,'expected_updated_at')||(body.expected_updated_at!==null&&(typeof body.expected_updated_at!=='string'||!Number.isFinite(Date.parse(body.expected_updated_at)))))httpError('Reload portal settings before saving',422);
 return json(await accountRpc(c,'admin_account_portal_settings',{p_actor:user.id,p_expected:body.expected_updated_at,p_value:value}));
});

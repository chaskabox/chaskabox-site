import {withAdmin,sb,json,readJson,httpError,pagination} from '../_lib/auth.js';
import {accountRpc,accountId} from '../_lib/customer-account.js';
import {profileInput,addressInput} from '../../../../account-portal-contract.js';
export const onRequestGet=withAdmin(['owner','manager'],async(c,{user})=>{
 const id=accountId(c.params.id),result=await accountRpc(c,'admin_account_directory',{p_actor:user.id,p_id:id,p_q:'',p_limit:1,p_offset:0});
 const account=result.accounts?.[0];if(!account)httpError('Account not found',404);
 const {page,per,rangeHeader}=pagination(new URL(c.request.url),10,50);
 const [addresses,orders,wishlist,reviews]=await Promise.all([
  sb(c,'/rest/v1/addresses?user_id=eq.'+id+'&select=id,label,address,city,is_default,updated_at&order=is_default.desc,created_at.desc'),
  sb(c,'/rest/v1/orders?user_id=eq.'+id+'&select=id,order_number,total,payment_status,fulfilment_status,created_at&order=created_at.desc,id.desc',{headers:{Range:rangeHeader},count:true}),
  sb(c,'/rest/v1/wishlists?user_id=eq.'+id+'&select=product_id',{headers:{Range:'0-0'},count:true}),
  sb(c,'/rest/v1/reviews?user_id=eq.'+id+'&select=id,product_id,rating,moderation_status,created_at&order=created_at.desc',{headers:{Range:'0-4'},count:true}),
 ]);
 return json({account,addresses,orders:orders.data,wishlist_count:wishlist.total,reviews:reviews.data,review_count:reviews.total,page,per_page:per,total:orders.total,total_pages:Math.ceil(orders.total/per)});
});
export const onRequestPatch=withAdmin(['owner'],async(c,{user})=>{
 const id=accountId(c.params.id),body=await readJson(c.request,8192),action=body.action;
 if(Object.keys(body).some(k=>!['action','address_id','expected_updated_at','data'].includes(k)))httpError('Unexpected account field',422);
 if(!['profile','address_create','address_update','address_delete','address_default'].includes(action))httpError('Invalid account action',422);
 let data={};
 try{
  if(action==='profile')data=profileInput(body.data||{});
  else if(['address_create','address_update'].includes(action))data=addressInput(body.data||{});
  if(body.data&&Object.keys(body.data).some(k=>!Object.hasOwn(data,k)))throw Error('Unexpected account data');
 }catch(e){httpError(e.message,422,'invalid_account_data');}
 const address=action.startsWith('address_')&&action!=='address_create'?accountId(body.address_id):null;
 if(!Object.hasOwn(body,'expected_updated_at')||(body.expected_updated_at!==null&&(!Number.isFinite(Date.parse(body.expected_updated_at))||typeof body.expected_updated_at!=='string')))httpError('Reload account details before saving',422);
 return json(await accountRpc(c,'admin_account_mutate',{p_actor:user.id,p_user:id,p_action:action,p_id:address,p_expected:body.expected_updated_at,p_data:data}));
});

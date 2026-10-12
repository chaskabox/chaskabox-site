import { sb, httpError } from './auth.js';

// Only the server supplies operations; never accept an operations array from a
// browser. The RPC also rechecks the live role, table/field allowlists and limits.
export async function cmsMutate(context, user, operations) {
  const result=await sb(context,'/rest/v1/rpc/admin_cms_transaction',{
    method:'POST',body:{p_actor:user.id,p_operations:operations},
  });
  if(!Array.isArray(result)) httpError('CMS transaction returned an invalid result',502,'invalid_database_result');
  return result;
}

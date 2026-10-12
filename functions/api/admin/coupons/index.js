import {withAdmin,sb,json,readJson} from '../_lib/auth.js';
import {cmsMutate} from '../_lib/cms-mutate.js';
import {businessInput} from '../_lib/business-input.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>json({coupons:await sb(c,'/rest/v1/coupons?select=*&order=id.asc')}));
export const onRequestPost=withAdmin(['owner','manager'],async(c,{user})=>{
 const data=businessInput(await readJson(c.request),'coupon',true);
 const [row]=await cmsMutate(c,user,[{table:'coupons',op:'insert',data}]);return json({coupon:row},201);
});

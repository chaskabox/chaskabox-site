import {withAdmin,sb,json,readJson} from '../_lib/auth.js';
import {cmsMutate} from '../_lib/cms-mutate.js';
import {businessInput} from '../_lib/business-input.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>json({zones:await sb(c,'/rest/v1/shipping_zones?select=*&order=id.asc')}));
export const onRequestPost=withAdmin(['owner','manager'],async(c,{user})=>{
 const data=businessInput(await readJson(c.request),'zone',true);
 const [row]=await cmsMutate(c,user,[{table:'shipping_zones',op:'insert',data}]);return json({zone:row},201);
});

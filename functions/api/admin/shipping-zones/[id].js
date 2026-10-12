import {withAdmin,json,readJson,httpError} from '../_lib/auth.js';
import {cmsMutate} from '../_lib/cms-mutate.js';
import {businessInput} from '../_lib/business-input.js';
function id(c){const n=Number(c.params.id);if(!Number.isSafeInteger(n)||n<1)httpError('Invalid id',400);return String(n);}
export const onRequestPatch=withAdmin(['owner','manager'],async(c,{user})=>{
 const data=businessInput(await readJson(c.request),'zone');
 const [row]=await cmsMutate(c,user,[{table:'shipping_zones',op:'update',id:id(c),data}]);return json({zone:row});
});
export const onRequestDelete=withAdmin(['owner','manager'],async(c,{user})=>{
 await cmsMutate(c,user,[{table:'shipping_zones',op:'delete',id:id(c)}]);return json({ok:true});
});

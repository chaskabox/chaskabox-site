import {rpc} from './db.js';
import {readableTheme} from './theme-contract.js';
export async function storefrontConfig(env){
 const data=await rpc(env,'storefront_manifest',{});
 data.theme=readableTheme(data.theme);
 return data;
}

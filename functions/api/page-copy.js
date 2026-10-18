import {pageKeyForPath} from '../../page-copy-contract.js';
import {publishedPageCopy} from './_lib/page-copy.js';
export async function onRequestGet({request,env}){
 const path=new URL(request.url).searchParams.get('path')||'/',key=pageKeyForPath(path);
 if(!key)return Response.json({fields:{}},{headers:{'Cache-Control':'no-store'}});
 try{return Response.json(await publishedPageCopy(env,key),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:{code:'CONTENT_UNAVAILABLE',message:'Published copy is temporarily unavailable'}},{status:503,headers:{'Cache-Control':'no-store'}});}
}

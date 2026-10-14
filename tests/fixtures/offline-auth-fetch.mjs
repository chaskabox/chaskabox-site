import assert from 'node:assert/strict';
let loggedOut=false,revocationChecked=false;
globalThis.fetch=async(value,options)=>{
 const u=new URL(value);assert.equal(u.origin,'http://127.0.0.1:9999');
 if(u.pathname==='/health'){assert.equal(options.method,'GET');return Response.json({version:'fixture'});}
 if(u.pathname==='/admin/users'){assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).email_confirm,true);return Response.json({id:'fixture-user'});}
 if(u.pathname==='/user'){assert.equal(options.method,'GET');return Response.json({id:'fixture-user'});}
 if(u.pathname==='/logout'){assert.equal(options.method,'POST','GoTrue logout requires POST');assert.equal(u.searchParams.get('scope'),'global');loggedOut=true;return new Response(null,{status:204});}
 if(u.pathname==='/token'){
  assert.equal(options.method,'POST');
  if(loggedOut){revocationChecked=true;return Response.json({error_code:'refresh_token_not_found'},{status:400});}
  return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',user:{id:'fixture-user'}});
 }
 throw Error('Unexpected offline Auth request');
};
process.on('beforeExit',()=>{assert.equal(loggedOut,true);assert.equal(revocationChecked,true);});

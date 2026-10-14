/* Runs only inside the recovered database's offline network namespace. */
import {createHmac,randomBytes} from 'node:crypto';
const e=process.env;if(e.ISOLATED_AUTH_RECOVERY!=='true')throw Error('Offline acceptance only');
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);
const unsigned=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',aud:'authenticated',iat:now,exp:now+600});
const admin=unsigned+'.'+createHmac('sha256',e.GOTRUE_JWT_SECRET).update(unsigned).digest('base64url');
async function api(route,{token,body,method=body?'POST':'GET',status=200}={}){const r=await fetch('http://127.0.0.1:9999'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});if(r.status!==status){let d={};try{d=await r.json();}catch{}const code=d.error_code||d.code;console.error('AUTH_RECOVERY_FAILURE '+JSON.stringify({route:route.split('?')[0],http_status:r.status,error_code:typeof code==='string'&&/^[a-zA-Z_]{1,64}$/.test(code)?code:null}));throw Error('Offline Auth status mismatch');}return r.status===204?null:r.json();}
let ready=false;for(let i=0;i<40;i++){try{await api('/health');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error('Offline Auth did not become healthy');
const email='recovery-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(32).toString('hex');
const user=await api('/admin/users',{token:admin,body:{email,password,email_confirm:true}});
const signed=await api('/token?grant_type=password',{body:{email,password}});
if(!signed.access_token||!signed.refresh_token||signed.user.id!==user.id)throw Error('Offline password sign-in failed');
const refreshed=await api('/token?grant_type=refresh_token',{body:{refresh_token:signed.refresh_token}});
if(!refreshed.access_token||!refreshed.refresh_token)throw Error('Offline refresh failed');
const current=await api('/user',{token:refreshed.access_token});if(current.id!==user.id)throw Error('Offline recovered user failed');
await api('/logout?scope=global',{token:refreshed.access_token,status:204});
await api('/token?grant_type=refresh_token',{body:{refresh_token:refreshed.refresh_token},status:400});
console.log(JSON.stringify({synthetic_user_only:true,password_login:true,token_refresh:true,user_lookup:true,logout_revocation:true,external_provider_sends:false}));

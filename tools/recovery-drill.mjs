/* Restore an actual completed private archive only inside a disposable, offline container. */
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {backupConfiguration,verifyPrivateBackupBucket,verifyDatabaseArchive} from './database-backup.mjs';
import {verifyMediaArchive,STORAGE_INVENTORY_SQL} from './media-backup.mjs';
const e=process.env,root=path.join(e.RUNNER_TEMP||'/tmp','chaskabox-isolated-recovery');
const container='chaskabox-recovery-'+String(e.GITHUB_RUN_ID||process.pid),image='supabase/postgres:17.6.1.136';
const authContainer=container+'-auth',authImage='supabase/gotrue:v2.196.0',nodeImage='node:24-alpine';
let step='preflight',operatorPassword;
function run(bin,args,env=e,input){try{return execFileSync(bin,args,{env,input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,timeout:8*60000});}catch(error){if(step==='start_offline_target'&&!(bin==='docker'&&args[0]==='exec')){const diagnostic=String(error.stderr||'');console.error(JSON.stringify({step,command:args[0],exit_code:error.status??null,signals:{invalid_mount:/invalid mount|mount.*denied|not shared/i.test(diagnostic),permission_denied:/permission denied/i.test(diagnostic),invalid_environment:/invalid.*env|poorly formatted/i.test(diagnostic),docker_unavailable:/daemon|not found/i.test(diagnostic),image_unavailable:/pull access|manifest|No such image/i.test(diagnostic)}}));}throw new Error('recovery_'+step+'_failed');}}
function db(sql,database='postgres',user='chaskabox_recovery_operator'){const operator=user==='chaskabox_recovery_operator';return run('docker',['exec',...(operator?['-e','PGPASSWORD']:[]),'-i',container,'psql',...(operator?['-h','127.0.0.1']:[]),'-U',user,'-d',database,'-At','-v','ON_ERROR_STOP=1'],operator?{...e,PGPASSWORD:operatorPassword}:e,sql);}
try{
 if(e.GITHUB_ACTIONS!=='true'||!e.RUNNER_TEMP)throw Error('Isolated Actions runner required');
 const config=backupConfiguration(e);await verifyPrivateBackupBucket(e);await mkdir(root,{mode:0o700});
 const aws={...e,AWS_ACCESS_KEY_ID:e.R2_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY:e.R2_SECRET_ACCESS_KEY,AWS_DEFAULT_REGION:'auto',AWS_EC2_METADATA_DISABLED:'true'};
 const endpoint=['--endpoint-url',config.endpoint];step='select_completed_archive';
 const objects=JSON.parse(run('aws',['s3api','list-objects-v2','--bucket',config.bucket,'--prefix','chaskabox-db/','--output','json',...endpoint],aws)).Contents||[];
 const marker=objects.filter(x=>x.Key.endsWith('/SUCCESS.json')).sort((a,b)=>b.LastModified.localeCompare(a.LastModified))[0];
 if(!marker)throw Error('No completed archive');const prefix=marker.Key.replace(/\/SUCCESS.json$/,'');
 for(const name of ['database.dump','roles.sql','manifest.json','SHA256SUMS','SUCCESS.json'])run('aws',['s3','cp','s3://'+config.bucket+'/'+prefix+'/'+name,path.join(root,name),'--only-show-errors',...endpoint],aws);
 const initialManifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 if(initialManifest.version===2)for(const name of ['media.json','media.tar.gz'])run('aws',['s3','cp','s3://'+config.bucket+'/'+prefix+'/'+name,path.join(root,name),'--only-show-errors',...endpoint],aws);
 const manifest=await verifyDatabaseArchive(root),success=JSON.parse(await readFile(path.join(root,'SUCCESS.json'),'utf8'));
 if(success.readback_verified!==true||success.archive_hash!==manifest.files['database.dump'])throw Error('Archive marker mismatch');
 step='restore_actual_media_bytes';const media=manifest.version===2?await verifyMediaArchive(root):null;
 step='pull_official_postgres_image';run('docker',['pull',image]);
 const imageDigest=JSON.parse(run('docker',['image','inspect',image]))[0].RepoDigests?.[0];
 if(!imageDigest?.startsWith('supabase/postgres@sha256:'))throw Error('Unexpected container image');
 step='pull_official_auth_images';run('docker',['pull',authImage]);run('docker',['pull',nodeImage]);
 const password=randomBytes(32).toString('hex');
 operatorPassword=password;
 await writeFile(path.join(root,'container.env'),'POSTGRES_PASSWORD='+password+'\nPGPASSWORD='+password+'\nPGHOST=/var/run/postgresql\nPOSTGRES_DB=postgres\n',{mode:0o600});
 step='start_offline_target';run('docker',['run','-d','--name',container,'--network','none','--env-file',path.join(root,'container.env'),'-v',root+':/recovery:ro',image]);
 let bootstrap=null;
 for(let i=0;i<40&&!bootstrap;i++){for(const user of ['supabase_admin','postgres'])try{db('select current_user;','postgres',user);bootstrap=user;break;}catch{}if(!bootstrap)await new Promise(r=>setTimeout(r,1000));}
 if(!bootstrap){
  const state=JSON.parse(run('docker',['inspect',container]))[0].State;
  const logs=run('docker',['logs',container]);
  console.error(JSON.stringify({target_running:state.Running,target_exit_code:state.ExitCode,startup_signals:{password_authentication_failed:/password authentication failed/i.test(logs),permission_denied:/permission denied/i.test(logs),configuration_missing:/could not access.*configuration|configuration file.*does not exist/i.test(logs),database_ready:/database system is ready to accept connections/i.test(logs)}}));
  throw Error('Disposable target did not start');
 }
 step='create_recovery_operator';
 db("set password_encryption='scram-sha-256'; create role chaskabox_recovery_operator login superuser password '"+password+"';",'postgres',bootstrap);
 step='configure_isolated_operator_access';
 const hba=db('show hba_file;','postgres',bootstrap).trim();
 if(!/^\/[a-zA-Z0-9_./-]+$/.test(hba))throw Error('Unexpected offline authentication config path');
 const originalHba=run('docker',['exec',container,'cat',hba]);
 run('docker',['exec','-i',container,'sh','-c','cat > "$1"','sh',hba],e,'host all chaskabox_recovery_operator 127.0.0.1/32 scram-sha-256\n'+originalHba);
 db('select pg_reload_conf();','postgres',bootstrap);
 step='wait_for_isolated_operator';let operatorReady=false;
 for(let i=0;i<20&&!operatorReady;i++){try{db('select current_user;');operatorReady=true;}catch{}if(!operatorReady)await new Promise(r=>setTimeout(r,250));}
 if(!operatorReady){const logs=run('docker',['logs',container]);console.error(JSON.stringify({operator_access_signals:{password_authentication_failed:/password authentication failed/i.test(logs),hba_rejected:/no pg_hba|pg_hba.*reject/i.test(logs),hba_parse_error:/invalid.*(authentication|address)|could not load.*pg_hba/i.test(logs)}}));throw Error('Isolated recovery operator not ready');}
 step='list_target_roles';
 const existing=new Set(db('select rolname from pg_roles;').trim().split('\n'));
 step='validate_role_export';
 const roles=await readFile(path.join(root,'roles.sql'),'utf8');
 const passwords=[...roles.matchAll(/^\s*ALTER\s+ROLE\b[^\n]*\bPASSWORD\s+([^;\n]+)/gim)];
 if(passwords.some(m=>m[1].trim()!=='NULL'))throw Error('Role password export forbidden');
 const filtered=roles.split('\n').filter(line=>{const m=/^CREATE ROLE ("(?:[^"]|"")*"|[a-zA-Z0-9_]+);$/.exec(line);return !m||!existing.has(m[1].replace(/^"|"$/g,'').replace(/""/g,'"'));}).join('\n');
 step='restore_roles';db(filtered);step='create_disposable_database';db('create database chaskabox_recovery template template0;');
 step='restore_actual_archive';run('docker',['exec','-e','PGPASSWORD',container,'pg_restore','-h','127.0.0.1','-U','chaskabox_recovery_operator','-d','chaskabox_recovery','--clean','--if-exists','--exit-on-error','--single-transaction','/recovery/database.dump'],{...e,PGPASSWORD:operatorPassword});
 step='verify_recovered_application';
 const checks=JSON.parse(db("select json_build_object('products',(select count(*) from public.products),'visible_products',(select count(*) from public.public_products),'bundle_links',(select count(*) from public.bundle_items),'public_tables',(select count(*) from pg_tables where schemaname='public'),'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'policies',(select count(*) from pg_policies where schemaname='public'),'order_count',(select count(*) from public.orders),'product_sequence_valid',(select last_value >= (select coalesce(max(id),0) from public.products) from public.products_id_seq));",'chaskabox_recovery'));
 if(checks.products<1||checks.rls_tables<1||checks.policies<1||!checks.product_sequence_valid)throw Error('Recovery verification failed');
 if(media){const recoveredInventory=JSON.parse(db(STORAGE_INVENTORY_SQL,'chaskabox_recovery'));const expected=JSON.parse(await readFile(path.join(root,'media.json'),'utf8')).storage_inventory_sha256;if(createHash('sha256').update(JSON.stringify(recoveredInventory)).digest('hex')!==expected)throw Error('Restored Storage metadata does not match recovered media inventory');}
 const authCountsSQL="select json_build_object('users',(select count(*) from auth.users),'identities',(select count(*) from auth.identities),'verified_factors',(select count(*) from auth.mfa_factors where status='verified'),'admin_roles',(select count(*) from public.admin_roles));";
 const recoveredAuth=JSON.parse(db(authCountsSQL,'chaskabox_recovery'));
 step='configure_offline_auth_runtime';const authPassword=randomBytes(32).toString('hex'),jwtSecret=randomBytes(32).toString('hex');
 db("set password_encryption='scram-sha-256';alter role supabase_auth_admin login password '"+authPassword+"';",'chaskabox_recovery');
 run('docker',['exec','-i',container,'sh','-c','cat > "$1"','sh',hba],e,'host all supabase_auth_admin 127.0.0.1/32 scram-sha-256\nhost all chaskabox_recovery_operator 127.0.0.1/32 scram-sha-256\n'+originalHba);db('select pg_reload_conf();');
 step='wait_for_offline_auth_database';let authDatabaseReady=false;
 for(let i=0;i<20&&!authDatabaseReady;i++){try{run('docker',['exec','-e','PGPASSWORD',container,'psql','-h','127.0.0.1','-U','supabase_auth_admin','-d','chaskabox_recovery','-At','-c','select 1'],{...e,PGPASSWORD:authPassword});authDatabaseReady=true;}catch{}if(!authDatabaseReady)await new Promise(r=>setTimeout(r,250));}
 if(!authDatabaseReady)throw Error('Offline Auth database login not ready');
 const authEnv=['ISOLATED_AUTH_RECOVERY=true','GOTRUE_API_HOST=0.0.0.0','GOTRUE_API_PORT=9999','API_EXTERNAL_URL=http://127.0.0.1:9999','GOTRUE_SITE_URL=http://127.0.0.1:9999','GOTRUE_DB_DRIVER=postgres','GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:'+authPassword+'@127.0.0.1:5432/chaskabox_recovery?sslmode=disable','GOTRUE_JWT_SECRET='+jwtSecret,'GOTRUE_JWT_ADMIN_ROLES=service_role','GOTRUE_JWT_AUD=authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','GOTRUE_JWT_EXP=3600','GOTRUE_DISABLE_SIGNUP=false','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','GOTRUE_MAILER_AUTOCONFIRM=true','GOTRUE_RATE_LIMIT_EMAIL_SENT=100'];
 await writeFile(path.join(root,'auth.env'),authEnv.join('\n')+'\n',{mode:0o600});
 await writeFile(path.join(root,'auth-acceptance.mjs'),await readFile(new URL('./auth-recovery-acceptance.mjs',import.meta.url)),{mode:0o600});
 step='start_offline_auth';run('docker',['run','-d','--name',authContainer,'--network','container:'+container,'--env-file',path.join(root,'auth.env'),authImage]);
 step='verify_offline_auth_login';let auth;
 try{auth=JSON.parse(run('docker',['run','--rm','--network','container:'+container,'--env-file',path.join(root,'auth.env'),'-v',root+':/recovery:ro',nodeImage,'node','/recovery/auth-acceptance.mjs']).trim());}
 catch(error){const logs=run('docker',['logs',authContainer]);console.error(JSON.stringify({auth_startup_signals:{migration_error:/migration.*(fail|error)/i.test(logs),database_permission_denied:/permission denied/i.test(logs),database_authentication_failed:/password authentication failed/i.test(logs),missing_configuration:/required|missing/i.test(logs)}}));throw error;}
 const afterAuth=JSON.parse(db(authCountsSQL,'chaskabox_recovery'));if(afterAuth.users!==recoveredAuth.users+1||afterAuth.verified_factors!==recoveredAuth.verified_factors||afterAuth.admin_roles!==recoveredAuth.admin_roles)throw Error('Recovered Auth metadata unexpectedly changed');
 const report={archive_prefix:prefix,image_digest:imageDigest,auth_image:authImage,archive_checksum_verified:true,full_database_archive_restored:true,owners_and_grants_preserved:true,target_network:'none',production_database_modified:false,checks,recovered_auth_counts:recoveredAuth,isolated_auth_runtime:auth,media_object_recovery_verified:!!media,media,live_auth_provider_acceptance_verified:false};
 console.log(JSON.stringify(report));if(e.GITHUB_STEP_SUMMARY)await writeFile(e.GITHUB_STEP_SUMMARY,JSON.stringify(report,null,2)+'\n',{flag:'a'});
}catch(error){console.error('Isolated recovery did not pass: '+step+'. No database rows, SQL, credentials or archive contents are logged.');process.exitCode=1;}
finally{for(const name of [authContainer,container])try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}catch{}await rm(root,{recursive:true,force:true});}

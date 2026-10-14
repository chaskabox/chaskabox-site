/* Restore an actual completed private archive only inside a disposable, offline container. */
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {backupConfiguration,verifyPrivateBackupBucket,verifyDatabaseArchive} from './database-backup.mjs';
const e=process.env,root=path.join(e.RUNNER_TEMP||'/tmp','chaskabox-isolated-recovery');
const container='chaskabox-recovery-'+String(e.GITHUB_RUN_ID||process.pid),image='supabase/postgres:17.6.1.136';
let step='preflight';
function run(bin,args,env=e,input){try{return execFileSync(bin,args,{env,input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,timeout:8*60000});}catch{throw new Error('recovery_'+step+'_failed');}}
function db(sql,database='postgres',user='chaskabox_recovery_operator'){return run('docker',['exec','-i',container,'psql','-U',user,'-d',database,'-At','-v','ON_ERROR_STOP=1'],e,sql);}
try{
 if(e.GITHUB_ACTIONS!=='true'||!e.RUNNER_TEMP)throw Error('Isolated Actions runner required');
 const config=backupConfiguration(e);await verifyPrivateBackupBucket(e);await mkdir(root,{mode:0o700});
 const aws={...e,AWS_ACCESS_KEY_ID:e.R2_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY:e.R2_SECRET_ACCESS_KEY,AWS_DEFAULT_REGION:'auto',AWS_EC2_METADATA_DISABLED:'true'};
 const endpoint=['--endpoint-url',config.endpoint];step='select_completed_archive';
 const objects=JSON.parse(run('aws',['s3api','list-objects-v2','--bucket',config.bucket,'--prefix','chaskabox-db/','--output','json',...endpoint],aws)).Contents||[];
 const marker=objects.filter(x=>x.Key.endsWith('/SUCCESS.json')).sort((a,b)=>b.LastModified.localeCompare(a.LastModified))[0];
 if(!marker)throw Error('No completed archive');const prefix=marker.Key.replace(/\/SUCCESS.json$/,'');
 for(const name of ['database.dump','roles.sql','manifest.json','SHA256SUMS','SUCCESS.json'])run('aws',['s3','cp','s3://'+config.bucket+'/'+prefix+'/'+name,path.join(root,name),'--only-show-errors',...endpoint],aws);
 const manifest=await verifyDatabaseArchive(root),success=JSON.parse(await readFile(path.join(root,'SUCCESS.json'),'utf8'));
 if(success.readback_verified!==true||success.archive_hash!==manifest.files['database.dump'])throw Error('Archive marker mismatch');
 step='pull_official_postgres_image';run('docker',['pull',image]);
 const imageDigest=JSON.parse(run('docker',['image','inspect',image]))[0].RepoDigests?.[0];
 if(!imageDigest?.startsWith('supabase/postgres@sha256:'))throw Error('Unexpected container image');
 const password=randomBytes(32).toString('hex');
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
 db("create role chaskabox_recovery_operator login superuser password '"+password+"';",'postgres',bootstrap);
 const existing=new Set(db('select rolname from pg_roles;').trim().split('\n'));
 const roles=await readFile(path.join(root,'roles.sql'),'utf8');if(/\bPASSWORD\b/i.test(roles))throw Error('Role password export forbidden');
 const filtered=roles.split('\n').filter(line=>{const m=/^CREATE ROLE ("(?:[^"]|"")*"|[a-zA-Z0-9_]+);$/.exec(line);return !m||!existing.has(m[1].replace(/^"|"$/g,'').replace(/""/g,'"'));}).join('\n');
 step='restore_roles';db(filtered);step='create_disposable_database';db('create database chaskabox_recovery template template0;');
 step='restore_actual_archive';run('docker',['exec',container,'pg_restore','-U','chaskabox_recovery_operator','-d','chaskabox_recovery','--clean','--if-exists','--exit-on-error','--single-transaction','/recovery/database.dump']);
 step='verify_recovered_application';
 const checks=JSON.parse(db("select json_build_object('products',(select count(*) from public.products),'visible_products',(select count(*) from public.public_products),'bundle_links',(select count(*) from public.bundle_items),'public_tables',(select count(*) from pg_tables where schemaname='public'),'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'policies',(select count(*) from pg_policies where schemaname='public'),'order_count',(select count(*) from public.orders),'product_sequence_valid',(select last_value >= (select coalesce(max(id),0) from public.products) from public.products_id_seq));",'chaskabox_recovery'));
 if(checks.products<1||checks.rls_tables<1||checks.policies<1||!checks.product_sequence_valid)throw Error('Recovery verification failed');
 const report={archive_prefix:prefix,image_digest:imageDigest,archive_checksum_verified:true,full_database_archive_restored:true,owners_and_grants_preserved:true,target_network:'none',production_database_modified:false,checks,media_object_recovery_verified:false,live_auth_provider_acceptance_verified:false};
 console.log(JSON.stringify(report));if(e.GITHUB_STEP_SUMMARY)await writeFile(e.GITHUB_STEP_SUMMARY,JSON.stringify(report,null,2)+'\n',{flag:'a'});
}catch(error){console.error('Isolated recovery did not pass: '+step+'. No database rows, SQL, credentials or archive contents are logged.');process.exitCode=1;}
finally{try{execFileSync('docker',['rm','-f',container],{stdio:'ignore'});}catch{}await rm(root,{recursive:true,force:true});}

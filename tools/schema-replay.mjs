import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function replayPlan(){
 const manifest=JSON.parse(await readFile(path.join(root,'database/schema-manifest.json'),'utf8'));
 const baseline=await readFile(path.join(root,manifest.baseline.path),'utf8');
 if(createHash('sha256').update(baseline).digest('hex')!==manifest.baseline.sha256)throw new Error('Baseline checksum mismatch');
 return {manifest,files:[manifest.baseline.path,...manifest.replay_migrations],baseline};
}
export function isolatedURL(value){
 const url=new URL(value);
 if(!['postgresql:','postgres:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Schema replay is restricted to an isolated local PostgreSQL database');
 if([...url.searchParams.keys()].some(k=>k!=='sslmode')||url.searchParams.getAll('sslmode').length>1||url.searchParams.has('sslmode')&&!['disable','prefer','require'].includes(url.searchParams.get('sslmode')))throw new Error('Unsafe database connection options');
 return url;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const plan=await replayPlan();
  if(process.argv.includes('--apply')){
   const db=isolatedURL(process.env.SCHEMA_TEST_DATABASE_URL||'');
   const bin=process.env.PG17_BIN||'/usr/lib/postgresql/17/bin';
   const files=['tests/fixtures/platform-schema.sql',...plan.files];
   for(const file of files)execFileSync(path.join(bin,'psql'),['-X','-v','ON_ERROR_STOP=1','--dbname',db.href],{input:await readFile(path.join(root,file),'utf8'),stdio:['pipe','ignore','pipe'],timeout:30000});
   console.log('Isolated schema replay completed. Dispatch remains disabled.');
  }else console.log(JSON.stringify({baseline:plan.manifest.baseline,files:plan.files,applied:false},null,2));
 }catch{console.error('Schema replay failed. Inspect the isolated test database and recreate it before retrying; no success is claimed.');process.exitCode=1;}
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../database/migrations/20261014170000_m0_internal_table_grants.sql',import.meta.url),'utf8');
const internal=['api_rate_limits','customer_notification_outbox','notification_outbox','order_status_events','product_versions'];

test('M0 internal tables: revoked client grants, preserved server access and idempotence',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  for(const table of internal){
   await db.exec(`CREATE TABLE public.${table}(id integer PRIMARY KEY, value text); ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON TABLE public.${table} TO PUBLIC, anon, authenticated, service_role;`);
  }
  await db.exec(migration);
  await db.exec(migration);
  for(const table of internal){
   for(const role of ['anon','authenticated']){
    const result=await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'public.'+table,'SELECT']);
    assert.equal(result.rows[0].allowed,false,table+' '+role+' SELECT');
    const write=await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',[role,'public.'+table,'INSERT,UPDATE,DELETE']);
    assert.equal(write.rows[0].allowed,false,table+' '+role+' write');
   }
   const server=await db.query('SELECT has_table_privilege($1,$2,$3) AS allowed',['service_role','public.'+table,'SELECT,INSERT,UPDATE,DELETE']);
   assert.equal(server.rows[0].allowed,true,table+' server access');
  }
 } finally {await db.close();}
});

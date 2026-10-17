import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDatabaseArchive, verifyDatabaseArchive } from '../tools/database-backup.mjs';
import { notificationSQL } from './notification-fixture.mjs';

const bin = process.env.PG17_BIN || '/usr/lib/postgresql/17/bin';
const available = ['pg_dump', 'pg_restore', 'psql', 'initdb', 'postgres'].every(name => existsSync(path.join(bin, name))) && process.getuid?.() !== 0;
const required = process.env.REQUIRE_NATIVE_RECOVERY === 'true';
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function query(connection, sql) {
  return execFileSync(path.join(bin, 'psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '--dbname', connection], { input:sql, encoding: 'utf8', timeout: 30_000 });
}
function queryFile(connection, file) {
  return execFileSync(path.join(bin, 'psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '--dbname', connection, '--file', file], { encoding: 'utf8', timeout: 30_000 });
}
async function fixture(mode, directory, processes) {
  const data = path.join(directory, mode);
  execFileSync(path.join(bin, 'initdb'), ['-D', data, '--no-locale', '--encoding=UTF8', '--username=postgres', '--auth=trust'], { stdio: 'pipe', timeout: 30_000 });
  const port = await freePort();
  const child = spawn(path.join(bin, 'postgres'), ['-D', data, '-h', '127.0.0.1', '-p', String(port), '-c', 'unix_socket_directories=', '-c', 'fsync=off', '-c', 'synchronous_commit=off'], { stdio: ['ignore', 'ignore', 'pipe'] });
  processes.push(child);
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated PostgreSQL startup timed out')), 15_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Isolated PostgreSQL exited (' + code + '): ' + output)); });
    child.stderr.on('data', chunk => {
      output += chunk;
      if (output.includes('database system is ready to accept connections')) { clearTimeout(timer); resolve(); }
    });
  });
  const connection = 'postgresql://postgres@127.0.0.1:' + port + '/postgres?sslmode=disable';
  query(connection, 'CREATE ROLE fixture_reader NOLOGIN;');
  if (mode === 'source') {query(connection, await readFile(new URL('./fixtures/recovery-schema.sql', import.meta.url), 'utf8'));query(connection,'create schema storage;create table storage.buckets(id text,public boolean);create table storage.objects(bucket_id text,name text,version text,metadata jsonb,updated_at timestamptz);');}
  if (mode === 'notifications') query(connection, await notificationSQL());
  if (mode === 'baseline') {
    query(connection, await readFile(new URL('./fixtures/platform-schema.sql',import.meta.url),'utf8'));
    const manifest=JSON.parse(await readFile(new URL('../database/schema-manifest.json',import.meta.url),'utf8'));
    for(const file of [manifest.baseline.path,...manifest.replay_migrations])query(connection,await readFile(new URL('../'+file,import.meta.url),'utf8'));
  }
  if (mode === 'conflict') query(connection, 'CREATE TABLE products(id integer PRIMARY KEY); INSERT INTO products VALUES(9999);');
  return connection;
}
function restore(connection, archive) {
  return execFileSync(path.join(bin, 'pg_restore'), ['--exit-on-error', '--single-transaction', '--dbname', connection, archive], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
}
async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGINT');
  });
}

test('native PostgreSQL 17 COPY archive restores data, links, sequences, functions and RLS; failure rolls back', { skip: !available && !required && 'Native PostgreSQL 17 server/client and a non-root test user are required', timeout: 90_000 }, async () => {
  assert.ok(available, 'CI must install PostgreSQL 17 server/client; this recovery test must not be skipped.');
  const directory = await mkdtemp(path.join(tmpdir(), 'chaskabox-native-recovery-')), processes = [];
  try {
    const source = await fixture('source', directory, processes);
    const output = path.join(directory, 'archive');
    const manifest = await createDatabaseArchive({ databaseURL: source, directory: output, bin, runId: 'isolated-fixture' });
    await verifyDatabaseArchive(output);
    assert.equal(manifest.data_format, 'copy');
    assert.equal(manifest.recovery_verified, false);
    const target = await fixture('target', directory, processes);
    restore(target, path.join(output, 'database.dump'));
    const sql = "SELECT jsonb_build_object('products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM products p),'links',(SELECT jsonb_agg(to_jsonb(b) ORDER BY component_product_id) FROM bundle_items b),'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY key) FROM settings s))";
    const original = query(source, sql), recovered = query(target, sql);
    assert.equal(createHash('sha256').update(recovered).digest('hex'), createHash('sha256').update(original).digest('hex'));
    assert.equal(query(target, 'SELECT count(*) FROM products').trim(), '1205');
    assert.equal(query(target, 'SELECT count(*) FROM bundle_items').trim(), '2');
    assert.equal(query(target, 'SELECT fixture_total()').trim(), '726615');
    assert.match(query(target, "BEGIN; INSERT INTO products(name,price,brand_id,visible,created_at) VALUES('New fixture',1,1,true,now()) RETURNING id; ROLLBACK;"), /1206/);
    assert.match(query(target, 'SET ROLE fixture_reader; SELECT count(*) FROM products; RESET ROLE;'), /1204/);
    const conflict = await fixture('conflict', directory, processes);
    assert.throws(() => restore(conflict, path.join(output, 'database.dump')));
    assert.equal(query(conflict, "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='brands'").trim(), '0');
    assert.equal(query(conflict, 'SELECT id FROM products').trim(), '9999');
  } finally {
    await Promise.all(processes.map(stop));
    await rm(directory, { recursive: true, force: true });
  }
});

test('native PostgreSQL 17 concurrent consumers skip locked jobs and reject an expired sender token', { skip: !available && !required && 'Native PostgreSQL 17 server/client and a non-root test user are required', timeout: 30_000 }, async () => {
  assert.ok(available, 'CI must execute the PostgreSQL 17 concurrent notification claim test.');
  const directory = await mkdtemp(path.join(tmpdir(), 'chaskabox-native-notifications-')), processes = [];
  try {
    const connection = await fixture('notifications', directory, processes);
    query(connection, "INSERT INTO orders(order_number) VALUES('CONCURRENT-FIRST'),('CONCURRENT-SECOND'); UPDATE notification_dispatch_state SET enabled=true,activated_after=now()-interval '1 hour';");
    const after = query(connection, 'SELECT activated_after FROM notification_dispatch_state').trim();
    const sql = "SELECT row_to_json(j) FROM notification_claim('" + after + "',ARRAY['owner_email']) j;";
    const holder = spawn(path.join(bin, 'psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '--dbname', connection], { stdio: ['pipe', 'pipe', 'pipe'] });
    processes.push(holder);
    let output = '', errors = '';
    const held = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Concurrent claim fixture did not acquire a lease')), 5000);
      holder.once('error', error => { clearTimeout(timer); reject(error); });
      holder.once('exit', code => { if (!output.includes('LEASE_HELD')) { clearTimeout(timer); reject(new Error('Claim fixture exited: ' + code + ' ' + errors)); } });
      holder.stderr.on('data', chunk => { errors += chunk; });
      holder.stdout.on('data', chunk => { output += chunk; if (output.includes('LEASE_HELD')) { clearTimeout(timer); resolve(); } });
    });
    holder.stdin.write("BEGIN;\n" + sql + "\nSELECT 'LEASE_HELD';\n");
    await held;
    const first = JSON.parse(output.split('\n').find(line => line.startsWith('{')));
    const second = JSON.parse(query(connection, sql).trim());
    assert.notEqual(first.id, second.id, 'Second consumer must acquire a different unlocked job while the first transaction remains open.');
    assert.notEqual(first.lease_token, second.lease_token);
    await new Promise((resolve, reject) => { holder.once('exit', code => code === 0 ? resolve() : reject(new Error(errors))); holder.stdin.end('COMMIT;\n'); });
    query(connection, "UPDATE notification_deliveries SET lease_expires_at=now()-interval '1 minute' WHERE id=" + first.id);
    const reclaimed = JSON.parse(query(connection, sql).trim());
    assert.equal(reclaimed.id, first.id);
    assert.notEqual(reclaimed.lease_token, first.lease_token);
    assert.equal(query(connection, "SELECT notification_finish(" + first.id + ",'" + first.lease_token + "','accepted','synthetic-expired-ack')->>'saved'").trim(), 'false');
    assert.equal(query(connection, 'SELECT attempts FROM notification_deliveries WHERE id=' + first.id).trim(), '0');
  } finally {
    await Promise.all(processes.map(stop));
    await rm(directory, { recursive: true, force: true });
  }
});

test('native PostgreSQL 17 clean application baseline, role matrix, CMS rollback and live MFA session checks', {skip:!available&&!required&&'Native PostgreSQL 17 with pgvector and a non-root test user is required',timeout:90_000},async()=>{
 assert.ok(available,'CI must execute the complete application schema replay.');
 const directory=await mkdtemp(path.join(tmpdir(),'chaskabox-native-schema-')),processes=[];
 const owner='00000000-0000-4000-8000-000000000001',content='00000000-0000-4000-8000-000000000003',manager='00000000-0000-4000-8000-000000000004',factor='00000000-0000-4000-8000-000000000020',session='00000000-0000-4000-8000-000000000010';
 const lit=value=>"'"+String(value).replace(/'/g,"''")+"'";
 try{
  const connection=await fixture('baseline',directory,processes);
  assert.equal(query(connection,"SELECT count(*) FROM pg_tables WHERE schemaname='public'").trim(),'46');
  assert.equal(query(connection,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proconfig IS NULL AND p.prorettype='trigger'::regtype").trim(),'0');
  query(connection,"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('"+owner+"','owner@example.invalid',now()),('"+content+"','content@example.invalid',now()),('"+manager+"','manager@example.invalid',now()); INSERT INTO admin_roles(user_id,role,active) VALUES('"+owner+"','owner',true),('"+content+"','content',true),('"+manager+"','manager',true);");
  query(connection,"INSERT INTO auth.mfa_factors(id,user_id,status) VALUES('"+factor+"','"+owner+"','verified'); INSERT INTO auth.sessions(id,user_id,factor_id,aal) VALUES('"+session+"','"+owner+"','"+factor+"','aal2');");
  const mfa=()=>query(connection,"SET ROLE service_role; SELECT admin_session_check('"+owner+"','"+session+"');").trim().split('\n').at(-1);
  assert.equal(mfa(),'t');
  query(connection,"UPDATE auth.sessions SET not_after=now()-interval '1 minute';");assert.equal(mfa(),'f');
  query(connection,"UPDATE auth.sessions SET not_after=NULL; UPDATE auth.mfa_factors SET status='unverified';");assert.equal(mfa(),'f');
  query(connection,"UPDATE auth.mfa_factors SET status='verified';");
  const run=(ops,actor=owner)=>{const output=query(connection,"SET ROLE service_role; SELECT admin_cms_transaction("+lit(actor)+","+lit(JSON.stringify(ops))+"::jsonb);");return JSON.parse(output.split('\n').find(l=>l.startsWith('[')));};
  const created=run([{table:'categories',op:'insert',data:{name:'Synthetic category',slug:'synthetic'}}],content)[0];
  const cat=created.id;
  assert.ok(cat);assert.equal(query(connection,"SELECT count(*) FROM audit_log WHERE entity_type='category'").trim(),'1');
  assert.throws(()=>run([{table:'site_settings',op:'upsert',id:'cod_enabled',data:{key:'cod_enabled',value:true}}],content),/Role not allowed/);
  assert.throws(()=>run([{table:'categories',op:'update',id:cat,data:{name:'Must roll back'}},{table:'categories',op:'update',id:cat,data:{unsupported:true}}]),/Unsupported CMS field/);
  assert.equal(query(connection,"SELECT name FROM categories WHERE id="+lit(cat)).trim(),'Synthetic category');
  assert.throws(()=>run([{table:'categories',op:'update',id:cat,data:{is_visible:'false'}}]),/boolean must be/);
  assert.throws(()=>run([{table:'navigation_menus',op:'insert',data:{location:'header',label:'Unsafe',url:'javascript:alert(1)'}}]),/Unsafe navigation URL/);
  query(connection,"CREATE FUNCTION public.fixture_block_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER fixture_block_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fixture_block_audit();");
  assert.throws(()=>run([{table:'categories',op:'update',id:cat,data:{name:'Audit rollback'}}]),/synthetic audit unavailable/);
  assert.equal(query(connection,"SELECT name FROM categories WHERE id="+lit(cat)).trim(),'Synthetic category');
  query(connection,'DROP TRIGGER fixture_block_audit ON audit_log; DROP FUNCTION fixture_block_audit();');
  query(connection,"INSERT INTO homepage_sections(section_key,config,draft_config) VALUES('hero','{}','{\"heading\":\"Synthetic\"}'),('faq','{}',NULL);");
  assert.throws(()=>run([{table:'homepage_sections',op:'publish',id:'hero'},{table:'homepage_sections',op:'publish',id:'faq'}]),/no draft/);
  assert.equal(query(connection,"SELECT config::text FROM homepage_sections WHERE section_key='hero'").trim(),'{}');
  assert.throws(()=>run([{table:'homepage_sections',op:'publish',id:'hero'}],content),/Role not allowed/);
  assert.equal(run([{table:'homepage_sections',op:'publish',id:'hero'}],manager)[0].config.heading,'Synthetic');
  for(const role of ['anon','authenticated']){
   assert.throws(()=>query(connection,"SET ROLE "+role+"; SELECT admin_cms_transaction("+lit(owner)+",'[]');"),/permission denied/);
   assert.throws(()=>query(connection,"SET ROLE "+role+"; SELECT admin_session_check("+lit(owner)+","+lit(session)+");"),/permission denied/);
   assert.throws(()=>query(connection,"SET ROLE "+role+"; SELECT handle_new_user();"),/permission denied/);
  }
  query(connection,"UPDATE admin_roles SET active=false WHERE user_id="+lit(content));assert.throws(()=>run([{table:'categories',op:'update',id:cat,data:{name:'Revoked'}}],content),/Active CMS staff/);
  query(connection,"INSERT INTO products(slug,name,price,category,pack,visibility) VALUES('synthetic-visible','Synthetic visible',100,'Fixture','1','visible'),('synthetic-hidden','Synthetic hidden',100,'Fixture','1','hidden');");
  assert.equal(query(connection,'SET ROLE anon; SELECT count(*) FROM public_products;').trim().split('\n').at(-1),'1');
  query(connection,"INSERT INTO orders(order_number,idempotency_key,customer_name,customer_phone,customer_address,customer_city,payment_method,payment_status,subtotal,delivery_fee,total) VALUES('SYNTHETIC-ORDER',gen_random_uuid(),'Fixture','03000000000','Synthetic address','Karachi','cod','cod_due',100,0,100);");
  assert.equal(query(connection,'SELECT count(*) FROM notification_deliveries').trim(),'3');
  assert.equal(query(connection,'SELECT enabled FROM notification_dispatch_state').trim(),'f');
  query(connection,"UPDATE admin_roles SET role='owner' WHERE user_id="+lit(manager));
  const first=spawn(path.join(bin,'psql'),['-X','-At','-v','ON_ERROR_STOP=1','--dbname',connection],{stdio:['pipe','pipe','pipe']});processes.push(first);
  let firstOutput='';const held=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owner fixture did not acquire lock')),5000);first.stdout.on('data',chunk=>{firstOutput+=chunk;if(firstOutput.includes('OWNER_HELD')){clearTimeout(timer);resolve();}});first.once('error',reject);});
  first.stdin.write("BEGIN; SELECT admin_staff_update("+lit(owner)+","+lit(owner)+",'{\"role\":\"content\"}'); SELECT 'OWNER_HELD';\n");await held;
  const second=spawn(path.join(bin,'psql'),['-X','-At','-v','ON_ERROR_STOP=1','--dbname',connection],{stdio:['pipe','pipe','pipe']});processes.push(second);
  let secondOutput='';const started=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Second owner session did not start')),5000);second.stdout.on('data',chunk=>{secondOutput+=chunk;if(secondOutput.includes('SECOND_STARTED')){clearTimeout(timer);resolve();}});second.once('error',reject);});
  const completed=new Promise((resolve,reject)=>{second.once('exit',code=>code===0?resolve():reject(new Error('Second owner update failed')));second.once('error',reject);});
  second.stdin.end("SELECT 'SECOND_STARTED'; SELECT admin_staff_update("+lit(manager)+","+lit(manager)+",'{\"role\":\"content\"}');\n");await started;
  await new Promise((resolve,reject)=>{first.once('exit',code=>code===0?resolve():reject(new Error('First owner commit failed')));first.stdin.end('COMMIT;\n');});await completed;
  assert.equal(JSON.parse(secondOutput.split('\n').find(line=>line.startsWith('{'))).code,'LAST_OWNER');
  assert.equal(query(connection,"SELECT count(*) FROM admin_roles WHERE role='owner' AND active").trim(),'1');
  // File input preserves PostgreSQL's early rejection instead of an EPIPE from
  // writing the rest of a large, intentionally rejected script to stdin.
  const baseline=fileURLToPath(new URL('../database/baseline/20261011_public.sql',import.meta.url));
  assert.throws(()=>queryFile(connection,baseline),/Baseline requires an empty public schema/);
 }finally{await Promise.all(processes.map(stop));await rm(directory,{recursive:true,force:true});}
});

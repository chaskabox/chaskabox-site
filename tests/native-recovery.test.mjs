import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
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
  return execFileSync(path.join(bin, 'psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '--dbname', connection, '-c', sql], { encoding: 'utf8', timeout: 30_000 });
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
  if (mode === 'source') query(connection, await readFile(new URL('./fixtures/recovery-schema.sql', import.meta.url), 'utf8'));
  if (mode === 'notifications') query(connection, await notificationSQL());
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
    assert.equal(query(connection, "SELECT notification_finish(" + first.id + ",'" + first.lease_token + "','accepted','synthetic-expired-ack')").trim(), 'f');
    assert.equal(query(connection, 'SELECT attempts FROM notification_deliveries WHERE id=' + first.id).trim(), '0');
  } finally {
    await Promise.all(processes.map(stop));
    await rm(directory, { recursive: true, force: true });
  }
});

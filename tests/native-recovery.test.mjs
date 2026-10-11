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

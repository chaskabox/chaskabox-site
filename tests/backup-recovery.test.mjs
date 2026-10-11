import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { SNAPSHOT_TABLES, selectSnapshotTables, catalogueSnapshot } from '../functions/api/admin/_lib/catalogue-snapshot.js';
import { onRequestGet, onRequestPost } from '../functions/api/admin/backup/index.js';
import { backupConfiguration, verifyDatabaseArchive, verifyPrivateBackupBucket } from '../tools/database-backup.mjs';

const env = { SUPABASE_URL: 'https://database.fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon' };
function database(rows = {}, alter = () => {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url), table = u.pathname.split('/').at(-1);
    calls.push({ url: u, options, table });
    assert.equal(options.headers.Prefer, 'count=exact');
    assert.equal(u.searchParams.get('order'), SNAPSHOT_TABLES[table].keys.map(k => `${k}.asc`).join(','));
    const all = rows[table] || [], offset = Number(u.searchParams.get('offset')), limit = Number(u.searchParams.get('limit'));
    // A configured REST cap smaller than the requested page must still export all rows.
    const slice = all.slice(offset, offset + Math.min(limit, 200));
    const result = { rows: slice, total: all.length, status: 200, range: slice.length ? `${offset}-${offset + slice.length - 1}/${all.length}` : `*/${all.length}` };
    alter(result, calls.at(-1), calls);
    return new Response(JSON.stringify(result.rows), { status: result.status, headers: result.range == null ? {} : { 'Content-Range': result.range } });
  };
  return { fetcher, calls };
}

test('catalogue export includes every row beyond REST limits, dependencies and composite keys', async () => {
  const rows = {
    brands: [{ id: 1, name: 'Fixture brand' }],
    products: Array.from({ length: 1205 }, (_, i) => ({ id: i + 1, name: `مصنوعات ${i + 1}`, brand_id: 1, created_at: '2026-10-11T00:00:00Z' })),
    categories: [{ id: 'fixture-category' }],
    category_products: [{ category_id: 'fixture-category', product_id: 1 }, { category_id: 'fixture-category', product_id: 2 }],
    bundle_items: [{ bundle_product_id: 3, component_product_id: 1 }, { bundle_product_id: 3, component_product_id: 2 }],
    homepage_sections: [{ section_key: 'weekly' }],
    theme_settings: [{ key: 'primary', value: '#0b2344' }],
  };
  const db = database(rows), result = await catalogueSnapshot({ env }, undefined, db.fetcher);
  assert.equal(result.tables.products.length, 1205);
  assert.equal(result.tables.products.at(-1).id, 1205);
  assert.equal(result.tables.products[0].created_at, rows.products[0].created_at);
  assert.equal(result.scope.full_database_backup, false);
  assert.equal(result.scope.complete_catalogue_scope, true);
  assert.equal(result.consistency.transactionally_consistent, false);
  assert.deepEqual(result.manifest.primary_keys.bundle_items, ['bundle_product_id', 'component_product_id']);
  assert.deepEqual(Object.keys(result.tables), Object.keys(SNAPSHOT_TABLES));
  assert.equal(result.manifest.tables_sha256, createHash('sha256').update(JSON.stringify(result.tables)).digest('hex'));
  assert.ok(db.calls.length < 40);
});

test('unknown selections fail and subsets retain referenced catalogue tables', () => {
  for (const value of ['', 'orders', 'products,orders', 'products,']) assert.throws(() => selectSnapshotTables(value), e => e instanceof Response && e.status === 400);
  assert.deepEqual(selectSnapshotTables('bundle_items,category_products'), ['brands', 'products', 'categories', 'category_products', 'bundle_items']);
  assert.deepEqual(selectSnapshotTables('theme_settings'), ['theme_settings']);
});

test('missing count, failed table, duplicate rows, truncated pages and count changes never produce a partial snapshot', async () => {
  const rows = { products: Array.from({ length: 401 }, (_, i) => ({ id: i + 1 })) };
  const failures = [
    result => { result.range = null; },
    result => { result.status = 500; },
    (result, call) => { if (Number(call.url.searchParams.get('offset')) === 200) result.rows[0] = { id: 1 }; },
    (result, call) => { if (Number(call.url.searchParams.get('offset')) === 200) { result.rows = []; result.range = '*/401'; } },
    (result, call) => { if (call.url.searchParams.get('limit') === '1') result.range = '0-0/402'; },
  ];
  for (const alter of failures) await assert.rejects(catalogueSnapshot({ env }, ['products'], database(rows, alter).fetcher));
});

test('missing keys, unsafe integer keys, row/request ceilings and network failure stop export', async () => {
  for (const row of [{ name: 'No key' }, { id: Number.MAX_SAFE_INTEGER + 1 }]) await assert.rejects(catalogueSnapshot({ env }, ['products'], database({ products: [row] }).fetcher));
  const huge = database({}, result => { result.range = '*/25001'; });
  await assert.rejects(catalogueSnapshot({ env }, ['products'], huge.fetcher), /size limit/);
  const slowPages = database({ products: Array.from({ length: 401 }, (_, i) => ({ id: i + 1 })) }, (result, call) => {
    const offset = Number(call.url.searchParams.get('offset'));
    if (call.url.searchParams.get('limit') !== '1') { result.rows = [{ id: offset + 1 }]; result.range = `${offset}-${offset}/401`; }
  });
  await assert.rejects(catalogueSnapshot({ env }, ['products'], slowPages.fetcher), /request limit/);
  assert.equal(slowPages.calls.length, 40);
  await assert.rejects(catalogueSnapshot({ env }, ['products'], async () => { throw new Error('Offline'); }));
});

async function apiFixture({ method = 'GET', role = 'owner', signedIn = true, allowed = true, tableFailure = false } = {}) {
  const original = globalThis.fetch, calls = [];
  const db = database({}, result => { if (tableFailure) result.status = 503; });
  globalThis.fetch = async (url, options = {}) => {
    const u = new URL(url); calls.push({ path: u.pathname, method: options.method || 'GET' });
    if (u.pathname === '/auth/v1/user') return new Response(JSON.stringify(signedIn ? { id: 'fixture-owner' } : {}), { status: signedIn ? 200 : 401 });
    if (u.pathname === '/rest/v1/admin_roles') return Response.json([{ role }]);
    if (u.pathname === '/rest/v1/rpc/take_rate_limit_token') return Response.json([{ allowed, retry_after_sec: 30 }]);
    return db.fetcher(url, options);
  };
  try {
    const context = { env, request: new Request('https://shop.fixture.invalid/api/admin/backup', { method, headers: { Authorization: 'Bearer fixture-token' }, ...(method === 'POST' ? { body: JSON.stringify({ confirm: 'RESTORE', backup: { version: 1, tables: { products: [{ id: 1 }] } } }) } : {}) }) };
    const response = await (method === 'POST' ? onRequestPost : onRequestGet)(context);
    return { response, calls };
  } finally { globalThis.fetch = original; }
}

test('only the owner receives a valid noncached snapshot and export rate denial is enforced', async () => {
  const owner = await apiFixture(); assert.equal(owner.response.status, 200);
  assert.equal(owner.response.headers.get('Cache-Control'), 'no-store');
  assert.match(owner.response.headers.get('Content-Disposition'), /chaskabox-catalogue/);
  assert.equal((await owner.response.json()).version, 2);
  for (const role of ['manager', 'content', 'fulfilment']) {
    const denied = await apiFixture({ role }); assert.equal(denied.response.status, 403);
    assert.equal(denied.calls.some(c => c.path === '/rest/v1/products'), false);
  }
  assert.equal((await apiFixture({ signedIn: false })).response.status, 401);
  const limited = await apiFixture({ allowed: false }); assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get('Retry-After'), '30');
});

test('database failure returns an error response without a downloadable partial file', async () => {
  const { response } = await apiFixture({ tableFailure: true });
  assert.equal(response.status, 503); assert.equal(response.headers.has('Content-Disposition'), false);
  const data = await response.json(); assert.equal(data.error.code, 'SNAPSHOT_FAILED'); assert.equal(data.tables, undefined);
});

test('legacy JSON restore stays unavailable and performs no catalogue or audit mutations', async () => {
  const { response, calls } = await apiFixture({ method: 'POST' });
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'RESTORE_UNAVAILABLE');
  assert.equal(calls.filter(c => c.method !== 'GET' && c.path !== '/rest/v1/rpc/take_rate_limit_token').length, 0);
  for (const role of ['manager', 'content', 'fulfilment']) assert.equal((await apiFixture({ method: 'POST', role })).response.status, 403);
});

test('backup preflight requires every secret, rejects wrong projects and unsafe endpoints, and uses TLS', () => {
  const good = { SUPABASE_DB_URL: 'postgresql://postgres:fixture-password@db.jtvswuvnasqqzrjysgfd.supabase.co:5432/postgres', R2_ACCESS_KEY_ID: 'fixture-key', R2_SECRET_ACCESS_KEY: 'fixture-secret', R2_ENDPOINT: 'https://16d9379f99684cfc5cad2e5a1b6a4363.r2.cloudflarestorage.com', R2_BUCKET: 'fixture-private-backups', CLOUDFLARE_BACKUP_READ_TOKEN: 'fixture-read-token' };
  assert.equal(new URL(backupConfiguration(good).databaseURL).searchParams.get('sslmode'), 'require');
  for (const key of Object.keys(good)) assert.throws(() => backupConfiguration({ ...good, [key]: '' }), e => e.message.includes(key) && !e.message.includes('fixture-password'));
  for (const change of [{ SUPABASE_DB_URL: good.SUPABASE_DB_URL.replace('5432', '6543') }, { SUPABASE_DB_URL: good.SUPABASE_DB_URL.replace('jtvswuvnasqqzrjysgfd', 'another-project') }, { SUPABASE_DB_URL: good.SUPABASE_DB_URL + '?sslmode=disable' }, { R2_ENDPOINT: good.R2_ENDPOINT.replace('https:', 'http:') }, { R2_ENDPOINT: 'https://untrusted.invalid' }, { R2_BUCKET: '../outside' }]) assert.throws(() => backupConfiguration({ ...good, ...change }));
});

test('backup destination must have both r2.dev and custom-domain public access disabled', async () => {
  const e = { SUPABASE_DB_URL: 'postgresql://postgres:fixture-password@db.jtvswuvnasqqzrjysgfd.supabase.co:5432/postgres', R2_ACCESS_KEY_ID: 'fixture-key', R2_SECRET_ACCESS_KEY: 'fixture-secret', R2_ENDPOINT: 'https://16d9379f99684cfc5cad2e5a1b6a4363.r2.cloudflarestorage.com', R2_BUCKET: 'fixture-private-backups', CLOUDFLARE_BACKUP_READ_TOKEN: 'fixture-read-token' };
  const replies = (managed, custom) => async url => Response.json({ success: true, result: url.endsWith('/managed') ? managed : custom });
  await verifyPrivateBackupBucket(e, replies({ enabled: false }, { domains: [] }));
  for (const [managed, custom] of [[{ enabled: true }, { domains: [] }], [{ enabled: false }, { domains: [{ enabled: true }] }], [{}, { domains: [] }], [{ enabled: false }, {}]]) await assert.rejects(verifyPrivateBackupBucket(e, replies(managed, custom)));
  await assert.rejects(verifyPrivateBackupBucket(e, async () => new Response('{}', { status: 403 })));
});

test('archive verification detects corrupt bytes and malformed or unsafe checksum paths', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chaskabox-integrity-'));
  try {
    const files = { 'database.dump': 'fixture archive', 'roles.sql': 'fixture roles' }, hashes = {};
    for (const [name, content] of Object.entries(files)) { await writeFile(path.join(directory, name), content); hashes[name] = createHash('sha256').update(content).digest('hex'); }
    const manifest = JSON.stringify({ kind: 'postgresql_database_archive', postgres_major: 17, files: hashes });
    await writeFile(path.join(directory, 'manifest.json'), manifest);
    const sums = Object.entries({ ...hashes, 'manifest.json': createHash('sha256').update(manifest).digest('hex') }).map(([name, hash]) => `${hash}  ${name}\n`).join('');
    await writeFile(path.join(directory, 'SHA256SUMS'), sums);
    assert.equal((await verifyDatabaseArchive(directory)).postgres_major, 17);
    await writeFile(path.join(directory, 'database.dump'), 'corrupt');
    await assert.rejects(verifyDatabaseArchive(directory), /checksum mismatch/);
    await writeFile(path.join(directory, 'SHA256SUMS'), sums.replace('database.dump', '..'));
    await assert.rejects(verifyDatabaseArchive(directory), /checksum mismatch/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('admin download validates row counts, reports API errors, releases URLs and never offers partial restore', async () => {
  const source = await readFile(new URL('../admin-live.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  function initBackup(){'), source.indexOf('  /* ============ PRODUCT VERSION HISTORY'));
  const messages = [], events = new Map(), timers = [], downloads = [], revoked = [];
  const button = { disabled: false, textContent: 'Download', addEventListener: (event, fn) => events.set(event, fn) };
  let reply;
  const context = { $: selector => selector === '#downloadBackupBtn' ? button : null, api: async () => { if (reply instanceof Error) throw reply; return reply; }, Blob, URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: value => revoked.push(value) }, document: { createElement: () => ({ click() { downloads.push(this.download); } }) }, toast: msg => messages.push(msg), setTimeout: fn => timers.push(fn) };
  vm.createContext(context); vm.runInContext(fn + '\ninitBackup();', context);
  reply = { version: 2, kind: 'catalogue_configuration', scope: { full_database_backup: false, complete_catalogue_scope: true }, consistency: { exact_counts_verified: true }, tables: { products: [{ id: 1 }] }, manifest: { row_counts: { products: 2 } } };
  await events.get('click')(); assert.equal(downloads.length, 0); assert.match(messages.at(-1), /validation failed/); assert.equal(button.disabled, false);
  reply = new Error('Snapshot service unavailable'); await events.get('click')(); assert.equal(downloads.length, 0); assert.equal(messages.at(-1), reply.message);
  reply = { version: 2, kind: 'catalogue_configuration', scope: { full_database_backup: false, complete_catalogue_scope: true }, consistency: { exact_counts_verified: true }, tables: { products: [{ id: 1 }] }, manifest: { row_counts: { products: 1 } } };
  await events.get('click')(); assert.equal(downloads.length, 1); assert.match(downloads[0], /catalogue/); timers.forEach(fn => fn()); assert.deepEqual(revoked, ['blob:fixture']);
  assert.equal(fn.includes("method:'POST'"), false);
});

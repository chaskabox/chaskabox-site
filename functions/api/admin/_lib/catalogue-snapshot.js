import { httpError } from './auth.js';

// Primary keys checked against production metadata. Include referenced rows
// when a caller requests a subset of the catalogue/configuration.
export const SNAPSHOT_TABLES = Object.freeze({
  brands: { keys: ['id'] },
  products: { keys: ['id'], dependencies: ['brands'] },
  categories: { keys: ['id'] },
  category_products: { keys: ['category_id', 'product_id'], dependencies: ['categories', 'products'] },
  bundle_items: { keys: ['bundle_product_id', 'component_product_id'], dependencies: ['products'] },
  homepage_sections: { keys: ['section_key'], dependencies: ['products', 'categories'] },
  coupons: { keys: ['id'] },
  shipping_zones: { keys: ['id'] },
  notification_templates: { keys: ['id'] },
  theme_settings: { keys: ['key'] },
  navigation_menus: { keys: ['id'], dependencies: ['categories'] },
  site_settings: { keys: ['key'] },
  store_settings: { keys: ['key'] },
  media: { keys: ['id'] },
});

export function selectSnapshotTables(value) {
  const all = Object.keys(SNAPSHOT_TABLES);
  if (value == null) return all;
  const requested = value.split(',').map(x => x.trim());
  if (!requested.length || requested.some(x => !Object.hasOwn(SNAPSHOT_TABLES, x))) {
    httpError('Unknown or empty snapshot table selection.', 400, 'invalid_tables');
  }
  const selected = new Set();
  function include(table) {
    if (selected.has(table)) return;
    selected.add(table);
    for (const dependency of SNAPSHOT_TABLES[table].dependencies || []) include(dependency);
  }
  requested.forEach(include);
  return all.filter(table => selected.has(table));
}

const PAGE_SIZE = 500;
const MAX_ROWS = 25_000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REQUESTS = 40; // Leaves room for Auth, role and rate-limit subrequests.
const DEADLINE_MS = 20_000;

async function digest(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function catalogueSnapshot(context, tables = Object.keys(SNAPSHOT_TABLES), fetcher = fetch) {
  const e = context.env || {};
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing server configuration');
  const started = Date.now(), data = {}, rowCounts = {}, keys = {};
  let requests = 0, bytes = 0;
  async function page(table, offset, limit) {
    if (++requests > MAX_REQUESTS || Date.now() - started >= DEADLINE_MS) throw new Error('Snapshot request limit');
    const params = new URLSearchParams({ select: '*', order: SNAPSHOT_TABLES[table].keys.map(k => `${k}.asc`).join(','), limit: String(limit), offset: String(offset) });
    const response = await fetcher(`${e.SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(Math.max(1, DEADLINE_MS - (Date.now() - started))),
    });
    if (!response.ok) throw new Error('Snapshot table request failed');
    const range = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
    const rows = await response.json();
    if (!range || !Array.isArray(rows)) throw new Error('Missing exact table count');
    const total = Number(range[3]);
    if (!Number.isSafeInteger(total) || total > MAX_ROWS || rows.length > limit) throw new Error('Snapshot size limit');
    if (rows.length && (Number(range[1]) !== offset || Number(range[2]) - Number(range[1]) + 1 !== rows.length)) throw new Error('Invalid page range');
    if (!rows.length && range[1] !== undefined) throw new Error('Invalid empty page range');
    return { rows, total };
  }

  for (const table of tables) {
    if (!Object.hasOwn(SNAPSHOT_TABLES, table)) throw new Error('Unknown snapshot table');
    const records = [], seen = new Set(), primaryKeys = SNAPSHOT_TABLES[table].keys;
    let total;
    do {
      const result = await page(table, records.length, PAGE_SIZE);
      if (total === undefined) total = result.total;
      if (result.total !== total || (!result.rows.length && records.length < total)) throw new Error('Table changed or page truncated');
      bytes += new TextEncoder().encode(JSON.stringify(result.rows)).byteLength;
      if (bytes > MAX_BYTES) throw new Error('Snapshot byte limit');
      for (const row of result.rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid table row');
        const key = primaryKeys.map(k => row[k]);
        if (key.some(x => x == null || !['string', 'number'].includes(typeof x) || (typeof x === 'number' && !Number.isSafeInteger(x)))) throw new Error('Invalid primary key');
        const identity = JSON.stringify(key);
        if (seen.has(identity)) throw new Error('Duplicate page row');
        seen.add(identity);
        records.push(row);
      }
      if (records.length > total) throw new Error('Rows exceed exact count');
    } while (records.length < total);
    data[table] = records;
    rowCounts[table] = total;
    keys[table] = primaryKeys;
  }
  // Count changes fail the entire export. Counts do not prove that individual
  // values were read in one transaction; the manifest states this limitation.
  for (const table of tables) {
    if ((await page(table, 0, 1)).total !== rowCounts[table]) throw new Error('Table changed during export');
  }
  const snapshot = {
    version: 2,
    kind: 'catalogue_configuration',
    export_started_at: new Date(started).toISOString(),
    exported_at: new Date().toISOString(),
    scope: {
      selected_tables: tables,
      complete_catalogue_scope: tables.length === Object.keys(SNAPSHOT_TABLES).length,
      full_database_backup: false,
      excluded: ['orders', 'customers', 'auth', 'audit/history/events', 'environment secrets', 'storage object bytes'],
    },
    consistency: { exact_counts_verified: true, transactionally_consistent: false },
    manifest: { row_counts: rowCounts, primary_keys: keys, tables_sha256: await digest(JSON.stringify(data)) },
    tables: data,
  };
  if (new TextEncoder().encode(JSON.stringify(snapshot, null, 2)).byteLength > MAX_BYTES) throw new Error('Snapshot byte limit');
  return snapshot;
}

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createMediaArchive,verifyMediaArchive,STORAGE_INVENTORY_SQL} from './media-backup.mjs';

const ACCOUNT = '16d9379f99684cfc5cad2e5a1b6a4363';
const PROJECT = 'jtvswuvnasqqzrjysgfd';
const REQUIRED = ['SUPABASE_DB_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'CLOUDFLARE_BACKUP_READ_TOKEN'];
const PG_BIN = '/usr/lib/postgresql/17/bin';

export function backupConfiguration(e) {
  const missing = REQUIRED.filter(k => !e[k]?.trim());
  if (missing.length) throw new Error(`Missing backup configuration: ${missing.join(', ')}. No backup was created.`);
  let db, endpoint;
  try { db = new URL(e.SUPABASE_DB_URL); endpoint = new URL(e.R2_ENDPOINT); }
  catch { throw new Error('Invalid database connection or backup endpoint.'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.username || !db.password || db.pathname !== '/postgres' || (db.port && db.port !== '5432')) throw new Error('Use the production direct/session database connection on port 5432.');
  const direct = db.hostname === `db.${PROJECT}.supabase.co`;
  const pooler = db.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(db.username) === `postgres.${PROJECT}`;
  if (!direct && !pooler) throw new Error('Backup connection does not match the production project.');
  if (endpoint.origin !== `https://${ACCOUNT}.r2.cloudflarestorage.com` || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error('Use the account HTTPS R2 endpoint.');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(e.R2_BUCKET) || e.R2_BUCKET.includes('..')) throw new Error('Invalid private backup bucket name.');
  if (db.searchParams.has('sslmode') && !['require', 'verify-ca', 'verify-full'].includes(db.searchParams.get('sslmode'))) throw new Error('Database backup requires TLS.');
  db.searchParams.set('sslmode', db.searchParams.get('sslmode') || 'require');
  return { databaseURL: db.href, endpoint: endpoint.origin, bucket: e.R2_BUCKET };
}

export async function verifyPrivateBackupBucket(e, fetcher = fetch) {
  const { bucket } = backupConfiguration(e);
  async function settings(suffix) {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${encodeURIComponent(bucket)}/domains/${suffix}`, {
      headers: { Authorization: `Bearer ${e.CLOUDFLARE_BACKUP_READ_TOKEN}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Cannot verify private backup destination.');
    const data = await response.json();
    if (data.success !== true) throw new Error('Cannot verify private backup destination.');
    return data.result;
  }
  const managed = await settings('managed'), custom = await settings('custom');
  if (managed?.enabled !== false || !Array.isArray(custom?.domains) || custom.domains.some(d => d.enabled !== false)) throw new Error('Backup destination is public or its privacy cannot be verified.');
}

function command(bin, args, env, step) {
  try { return execFileSync(bin, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60 * 1000 }); }
  catch { throw new Error(`Database backup failed during ${step}. No success marker was written.`); }
}

async function hashFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

// A custom-format archive retains schema/data/ACLs/owners in one database
// snapshot. Global roles are separate and exclude login password hashes.
export async function createDatabaseArchive({ databaseURL, directory, runId = 'manual', bin = PG_BIN }) {
  const env = { ...process.env, PGCONNECT_TIMEOUT: '15' };
  const client = command(path.join(bin, 'pg_dump'), ['--version'], env, 'client version check');
  const server = command(path.join(bin, 'psql'), ['--dbname', databaseURL, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SHOW server_version_num'], env, 'server version check').trim();
  if (!/^pg_dump \(PostgreSQL\) 17\./.test(client) || !/^17\d{4}$/.test(server)) throw new Error('Backup requires PostgreSQL 17 client and server.');
  process.umask(0o077);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await readdir(directory)).length) throw new Error('Backup directory must be empty.');
  const archive = path.join(directory, 'database.dump');
  const readInventory=async()=>JSON.parse(command(path.join(bin,'psql'),['--dbname',databaseURL,'-X','-At','-v','ON_ERROR_STOP=1','-c',STORAGE_INVENTORY_SQL],env,'storage inventory'));
  const inventory=await readInventory();
  command(path.join(bin, 'pg_dump'), ['--dbname', databaseURL, '--format=custom', '--file', archive], env, 'consistent database dump');
  command(path.join(bin, 'pg_restore'), ['--list', archive], env, 'archive validation');
  command(path.join(bin, 'pg_dumpall'), ['--dbname', databaseURL, '--roles-only', '--no-role-passwords', '--file', path.join(directory, 'roles.sql')], env, 'role export');
  const media=await createMediaArchive({directory,inventory,readInventory});
  await verifyMediaArchive(directory);
  const files = {};
  for (const name of ['database.dump', 'roles.sql','media.json','media.tar.gz']) files[name] = await hashFile(path.join(directory, name));
  const manifest = {
    version: 2, kind: 'postgresql_database_archive', completed_at: new Date().toISOString(),
    run_id: String(runId), postgres_major: 17, data_format: 'copy', archive_consistency: 'single_database_snapshot',
    scope: ['accessible database schemas', 'table data', 'sequences', 'functions', 'triggers', 'RLS policies', 'owners and grants', 'roles without login passwords'],
    media:{...media,entries:undefined},media_consistency:'Storage inventory unchanged before database dump and after media download; separate systems are not one atomic snapshot',
    excluded: ['provider configuration', 'environment secrets', 'role login passwords'],
    recovery_verified: false, files,
  };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await writeFile(path.join(directory, 'SHA256SUMS'), Object.entries({ ...files, 'manifest.json': await hashFile(path.join(directory, 'manifest.json')) }).map(([name, sha]) => `${sha}  ${name}\n`).join(''), { mode: 0o600 });
  return manifest;
}

export async function verifyDatabaseArchive(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const checksums = await readFile(path.join(directory, 'SHA256SUMS'), 'utf8');
  const lines = checksums.trim().split('\n');
  const allowed = new Set(['database.dump', 'roles.sql', 'manifest.json']);
  if(manifest.version===2){allowed.add('media.json');allowed.add('media.tar.gz');}
  if (lines.length !== allowed.size || manifest.kind !== 'postgresql_database_archive' || manifest.postgres_major !== 17) throw new Error('Invalid archive manifest.');
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9.]+)$/.exec(line);
    if (!match || !allowed.delete(match[2]) || await hashFile(path.join(directory, match[2])) !== match[1]) throw new Error('Backup checksum mismatch.');
    if (match[2] !== 'manifest.json' && manifest.files?.[match[2]] !== match[1]) throw new Error('Backup manifest mismatch.');
  }
  return manifest;
}

async function main(mode) {
  const e = process.env;
  if (mode === 'cleanup') {
    if (!e.RUNNER_TEMP || !e.BACKUP_DIR || path.resolve(e.BACKUP_DIR) !== path.join(path.resolve(e.RUNNER_TEMP), 'chaskabox-database-backup')) throw new Error('Unsafe backup cleanup path.');
    await rm(e.BACKUP_DIR, { recursive: true, force: true });
    return;
  }
  const config = backupConfiguration(e);
  if (mode === 'preflight') {
    if (e.GITHUB_ACTIONS === 'true') {
      const escape = x => x.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      console.log(`::add-mask::${escape(decodeURIComponent(new URL(config.databaseURL).password))}`);
    }
    await verifyPrivateBackupBucket(e);
    console.log('Backup configuration validated; no credentials are printed.');
  } else if (mode === 'dump') {
    await createDatabaseArchive({ databaseURL: config.databaseURL, directory: e.BACKUP_DIR, runId: e.GITHUB_RUN_ID });
    console.log('Database archive created and checked. Recovery drill is still required.');
  } else if (mode === 'upload') {
    await verifyPrivateBackupBucket(e);
    const manifest = await verifyDatabaseArchive(e.BACKUP_DIR);
    const awsEnv = { ...e, AWS_ACCESS_KEY_ID: e.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: e.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto', AWS_EC2_METADATA_DISABLED: 'true' };
    const args = ['--endpoint-url', config.endpoint];
    command('aws', ['s3api', 'head-bucket', '--bucket', config.bucket, ...args], awsEnv, 'private bucket access check');
    const prefix = `chaskabox-db/${manifest.completed_at.replace(/[:.]/g, '-')}-${manifest.run_id}`;
    const destination = `s3://${config.bucket}/${prefix}`;
    // Every file is downloaded and hashed before a dated success marker exists.
    const verifyDirectory = path.join(e.BACKUP_DIR, 'readback');
    await mkdir(verifyDirectory, { mode: 0o700 });
    for (const name of [...Object.keys(manifest.files),'manifest.json','SHA256SUMS']) {
      command('aws', ['s3', 'cp', path.join(e.BACKUP_DIR, name), `${destination}/${name}`, '--only-show-errors', ...args], awsEnv, 'private upload');
      command('aws', ['s3', 'cp', `${destination}/${name}`, path.join(verifyDirectory, name), '--only-show-errors', ...args], awsEnv, 'backup readback');
    }
    await verifyDatabaseArchive(verifyDirectory);
    if(manifest.version===2)await verifyMediaArchive(verifyDirectory);
    const marker = path.join(e.BACKUP_DIR, 'SUCCESS.json');
    await writeFile(marker, JSON.stringify({ completed_at: new Date().toISOString(), prefix, archive_hash: manifest.files['database.dump'], readback_verified: true, recovery_verified: false }) + '\n', { mode: 0o600 });
    command('aws', ['s3', 'cp', marker, `${destination}/SUCCESS.json`, '--only-show-errors', ...args], awsEnv, 'success marker upload');
    console.log('Private upload and checksum readback succeeded. This does not certify restoration.');
    if (e.GITHUB_STEP_SUMMARY) await writeFile(e.GITHUB_STEP_SUMMARY, `Database archive uploaded with verified readback at ${new Date().toISOString()}.\n\nRecovery from production data still requires an isolated restore drill.\n`, { flag: 'a' });
  } else throw new Error('Use preflight, dump, upload or cleanup.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}

import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler', '.temp'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(?:js|mjs)$/.test(e.name)) files.push(p);
  }
}
await walk('.');
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
console.log(`JavaScript syntax passed: ${files.length} files.`);

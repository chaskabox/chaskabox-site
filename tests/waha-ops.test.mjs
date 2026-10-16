import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const preflight = readFileSync(new URL('../ops/waha/preflight.sh', import.meta.url), 'utf8');
const overlay = readFileSync(new URL('../ops/waha/compose.override.example.yml', import.meta.url), 'utf8');

test('WAHA preflight is syntactically valid Bash', () => {
  const result = spawnSync('bash', ['-n'], { input: preflight, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('WAHA preflight never changes server state or prints secrets', () => {
  const commands = preflight.split('\n').filter(s => !s.trimStart().startsWith('#')).join('\n');
  assert.match(commands, /docker compose -f "\$COMPOSE" config --format json/);
  assert.doesNotMatch(commands, /\bdocker\s+(?:run|start|restart|stop|rm|rmi|volume\s+rm|system\s+prune)\b/);
  assert.doesNotMatch(commands, /\bdocker\s+compose\s+(?:up|down|pull|restart|stop)\b/);
  assert.doesNotMatch(commands, /\bsystemctl\s+(?:start|stop|restart|enable|disable)\b/);
  assert.doesNotMatch(commands, /print\s*\(\s*env\s*\)/);
  assert.match(commands, /\/app\/\.sessions/);
  assert.match(commands, /non-loopback published port detected/);
});

test('WAHA resilience override targets native ARM and deliberate-stop-safe restart', () => {
  assert.match(overlay, /image:\s*devlikeapro\/waha:arm/);
  assert.match(overlay, /platform:\s*linux\/arm64/);
  assert.match(overlay, /restart:\s*unless-stopped/);
  assert.match(overlay, /max-size:\s*["']?10m/);
  assert.doesNotMatch(overlay, /\b(?:ports|volumes|env_file):/);
});

#!/usr/bin/env bash
# One-time, guarded Oracle ARM64 WAHA startup. No customer WhatsApp sends.
# Leaves PM2 wa-server and cf-tunnel untouched; never opens public port 3000.
set -Eeuo pipefail
umask 077

ROOT=/home/ubuntu/waha
BACKUP=/home/ubuntu/waha-private-backups
BASE="$ROOT/docker-compose.yml"
OVERLAY="$ROOT/compose.oci.override.yml"
OVERRIDE_SOURCE=https://raw.githubusercontent.com/chaskabox/chaskabox-site/563fc9085a43b246f24206b55b6509a2d610978b/ops/waha/compose.override.example.yml
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null || fail 'curl missing'
command -v python3 >/dev/null || fail 'python3 missing'
command -v docker >/dev/null || fail 'Docker missing'
command -v ss >/dev/null || fail 'ss missing'
[ "$(uname -m)" = aarch64 ] || fail 'Expected Oracle ARM64 host'
sudo test -f "$BASE" || fail 'Original Compose file missing'
sudo test -d "$ROOT/.sessions" || fail 'Existing persistent session directory missing'
sudo docker compose version >/dev/null || fail 'Docker Compose unavailable'
[ -z "$(sudo docker ps -a --format '{{.Names}}' | grep -Ei '(^|[-_])waha([_-]|$)' || true)" ] || fail 'WAHA container already exists; inspect instead of recreating'
[ -z "$(ss -lnt '( sport = :3001 )' | tail -n +2)" ] || fail 'Port 3001 is already in use'
DR="$(sudo docker info --format '{{.DockerRootDir}}')"
[ -d "$DR" ] || fail 'Docker storage location unavailable'
AVAIL="$(df -Pk "$DR" | awk 'NR==2 {print $4}')"
[ "${AVAIL:-0}" -ge 3145728 ] || fail 'Docker storage has less than 3 GiB free; avoid full-disk crash'
echo 'Pre-checks passed: aarch64, free local 3001, Docker on host, disk space available.'

# Preserve original config/secrets/sessions privately before changes.
sudo install -d -m 700 "$BACKUP"
sudo cp -p "$BASE" "$BACKUP/docker-compose.$STAMP.yml"
if sudo test -f "$ROOT/.env"; then
  sudo cp -p "$ROOT/.env" "$BACKUP/waha.env.$STAMP"
fi
sudo tar -C "$ROOT" -czf "$BACKUP/sessions.$STAMP.tgz" .sessions
# Do not expand a root-only directory glob as the unprivileged SSH user.
# Also secure snapshots left behind by earlier interrupted attempts.
sudo find "$BACKUP" -maxdepth 1 -type f -exec chmod 600 {} +

# Review only trusted, pinned GitHub file: a small add-on Compose overlay.
curl -fsSL --max-time 20 -o "$OVERLAY.tmp" "$OVERRIDE_SOURCE" || fail 'Could not download reviewed Compose override'
mv "$OVERLAY.tmp" "$OVERLAY"
chmod 600 "$OVERLAY"

# Docker Compose may parse environment secrets. Pipe JSON only to the local
# parser and do not print or write resolved JSON to disk.
sudo docker compose -f "$BASE" -f "$OVERLAY" config --format json | python3 -c '
import json,sys,os
try:
    cfg=json.load(sys.stdin)
    assert set(cfg["services"])=={"waha"}, "unexpected service list"
    s=cfg["services"]["waha"]
    assert s.get("image")=="devlikeapro/waha:arm", "unexpected image"
    assert s.get("platform")=="linux/arm64", "wrong architecture"
    assert s.get("restart")=="unless-stopped", "restart policy missing"
    ports=[(str(p.get("host_ip")),str(p.get("published")),str(p.get("target"))) for p in s.get("ports",[])]
    assert ports==[("127.0.0.1","3001","3000")], "public or unexpected port binding"
    sessions=[v for v in s.get("volumes",[]) if v.get("target")=="/app/.sessions"]
    assert len(sessions)==1 and sessions[0].get("type")=="bind", "persistent session bind mount missing"
    assert os.path.realpath(sessions[0]["source"])=="/home/ubuntu/waha/.sessions", "session mount changed"
    env=s.get("environment") or {}
    assert isinstance(env,dict) and bool(env.get("WAHA_API_KEY")), "WAHA API key missing"
except (AssertionError,KeyError,ValueError,TypeError) as exc:
    print("STOP: unsafe Compose config: "+str(exc),file=sys.stderr)
    sys.exit(1)
print("Configuration gate PASSED: ARM64; loopback 3001 only; persistent sessions; API key; crash-restart")
' || fail 'Config validation failed; WAHA has NOT been started.'

echo 'Pulling official WAHA ARM image. PM2 wa-server and cf-tunnel are untouched.'
sudo docker compose -f "$BASE" -f "$OVERLAY" pull waha
echo 'Starting isolated WAHA container. No outbound WhatsApp jobs triggered here.'
sudo docker compose -f "$BASE" -f "$OVERLAY" up -d --no-deps waha
sudo docker compose -f "$BASE" -f "$OVERLAY" ps
echo 'Check locally:'
status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 http://127.0.0.1:3001/dashboard || true)"
echo "WAHA dashboard HTTP status: $status (401/302/200 may be valid; 000 means unreachable)"
echo 'WhatsApp session must still be paired and verified manually. No Cloudflare WA channel activated.'

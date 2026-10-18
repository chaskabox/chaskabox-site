#!/usr/bin/env bash
# ChaskaBox WAHA named tunnel: unprivileged PM2 connector (no sudo).
# This does not start/stop WAHA or alter the user's existing PM2 services.
set -Eeuo pipefail
umask 077
ACCOUNT=16d9379f99684cfc5cad2e5a1b6a4363
TUNNEL=b83a32c9-4ed0-482a-9703-89181fe29717
NAME=chaskabox-waha-named
DIR="$HOME/.config/chaskabox-waha-named"
TOKENFILE="$DIR/tunnel-token"
LAUNCH="$DIR/launch.sh"
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
command -v pm2 >/dev/null || fail 'PM2 not available as ubuntu'
command -v cloudflared >/dev/null || fail 'cloudflared executable not in PATH'
command -v python3 >/dev/null || fail 'python3 missing'
command -v curl >/dev/null || fail 'curl missing'
[[ -r /dev/tty ]] || fail 'SSH terminal needed for confidential token input'
[[ "$(uname -m)" == 'aarch64' ]] || fail 'Unexpected machine architecture'
CF="$(command -v cloudflared)"
[[ -x "$CF" ]] || fail 'cloudflared binary not executable'
cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file' || fail 'cloudflared is too old for secure --token-file mode'

# Read-only local endpoint check. WAHA /health returns HTTP 401 if authenticated.
HEALTH="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 http://127.0.0.1:3001/health || true)"
[[ "$HEALTH" == '401' || "$HEALTH" == '200' ]] || fail "WAHA localhost port 3001 health response $HEALTH; inspect before touching tunnel"

# Avoid concurrent duplicate tunnels or accidental PM2 process replacement.
if pm2 jlist | python3 -c '
import json,sys
processes=json.load(sys.stdin)
sys.exit(0 if any(x.get("name")=="chaskabox-waha-named" for x in processes) else 1)
'; then
  echo 'Named-tunnel PM2 process already exists. No changes made.'
  exit 0
fi
echo "WAHA local health response: $HEALTH. Existing wa-server and cf-tunnel untouched."
echo 'Cloudflare dashboard: Tunnels > chaskabox-waha > Add a replica.'
echo 'From the installer command copy ONLY the long token beginning eyJ (not the command).'
IFS= read -r -s -p 'Paste Cloudflare named-tunnel token (hidden): ' TKN </dev/tty
printf '\n'
[[ -n "$TKN" ]] || fail 'No token entered'
printf '%s' "$TKN" | python3 -c '
import sys,json,base64
token=sys.stdin.read().strip()
try: d=json.loads(base64.urlsafe_b64decode(token+"="*(-len(token)%4)))
except (ValueError,TypeError): raise SystemExit("STOP: bad token encoding")
if d.get("a")!="16d9379f99684cfc5cad2e5a1b6a4363" or d.get("t")!="b83a32c9-4ed0-482a-9703-89181fe29717" or not d.get("s"):
 raise SystemExit("STOP: wrong Cloudflare account or tunnel token")
print("Cloudflare tunnel identity verified (token remains private)")
'
echo 'IMPORTANT: Live notification dispatch is enabled. Connecting the tunnel may release eligible WhatsApp messages.'
IFS= read -r -p 'To allow the connection and possible notifications type CONNECT: ' ANSWER </dev/tty
[[ "$ANSWER" == 'CONNECT' ]] || fail 'Cancelled with no changes'

mkdir -p "$DIR"
chmod 700 "$DIR"
if [[ -e "$TOKENFILE" || -e "$LAUNCH" ]]; then
  fail 'Local connector files already exist; refusing to overwrite'
fi
printf '%s\n' "$TKN" > "$TOKENFILE"
chmod 600 "$TOKENFILE"
unset TKN
cat > "$LAUNCH" <<EOF
#!/usr/bin/env bash
exec "$CF" tunnel run --token-file "$TOKENFILE"
EOF
chmod 700 "$LAUNCH"

# Separate PM2 app under ubuntu; does not touch existing wa-server or cf-tunnel.
pm2 start "$LAUNCH" --name "$NAME" --interpreter bash --time
sleep 7
if pm2 jlist | python3 -c '
import json,sys
processes=json.load(sys.stdin)
sys.exit(0 if any(x.get("name")=="chaskabox-waha-named" and x.get("pm2_env",{}).get("status")=="online" for x in processes) else 1)
'; then
  pm2 save
  echo 'Named-tunnel PM2 process ONLINE. Cloudflare tunnel dashboard connection must still be verified.'
else
  echo 'New connector not online; inspect PM2 logs, do not restart WAHA.' >&2
  exit 1
fi

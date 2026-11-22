#!/usr/bin/env bash
# One interactive run, no WAHA/PM2 restarts; installs a separate named-tunnel connector.
# Requires a protected backup and an already WORKING authenticated WAHA session.
set -Eeuo pipefail
umask 077
ID=b83a32c9-4ed0-482a-9703-89181fe29717
ACCOUNT=16d9379f99684cfc5cad2e5a1b6a4363
SVC=chaskabox-waha-named.service
STATE=/etc/chaskabox-waha-tunnel
TOKENFILE="$STATE/token"
fail(){ printf 'STOP: %s\n' "$*" >&2; exit 1; }
command -v sudo >/dev/null || fail 'sudo missing'
command -v python3 >/dev/null || fail 'python3 missing'
command -v cloudflared >/dev/null || fail 'cloudflared CLI missing'
command -v systemctl >/dev/null || fail 'systemctl missing'
[[ -r /dev/tty ]] || fail 'Interactive SSH terminal required to securely paste tunnel token'
sudo -v
[[ "$(uname -m)" == 'aarch64' ]] || fail 'Not expected Oracle ARM64 VM'
[[ "$(sudo docker inspect -f '{{.State.Running}}' waha 2>/dev/null)" == 'true' ]] || fail 'Existing WAHA container is not running'
[[ "$(sudo docker port waha 3000/tcp)" == '127.0.0.1:3001' ]] || fail 'WAHA is not bound exclusively to 127.0.0.1:3001'
sudo python3 - <<'PY'
import json,subprocess,urllib.request
environment=json.loads(subprocess.check_output(["docker","inspect","waha","--format","{{json .Config.Env}}"],text=True))
e=dict(s.split("=",1) for s in environment if "=" in s)
key=e.get("WAHA_API_KEY_PLAIN") or e.get("WAHA_API_KEY")
if not key: raise SystemExit("STOP: WAHA API key missing")
req=urllib.request.Request("http://127.0.0.1:3001/api/sessions?all=true",
                           headers={"X-Api-Key":key,"Accept":"application/json"})
with urllib.request.urlopen(req,timeout=8) as resp: sessions=json.load(resp)
if not isinstance(sessions,list) or not any(x.get("status")=="WORKING" for x in sessions):
    raise SystemExit("STOP: no authenticated WORKING WAHA session")
print("WAHA gate PASS: authenticated WORKING session found; no messages sent")
PY
BACKUP="$(sudo find /home/ubuntu/waha-private-backups -maxdepth 1 -type f -name 'waha-sessions-*.tgz' -size +1M -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)"
[[ -n "$BACKUP" ]] || fail 'Session backup archive >1MB not found; do not proceed'
sudo tar -tzf "$BACKUP" >/dev/null || fail 'Session backup archive failed integrity check'
echo "Session backup integrity PASS. Existing WAHA and PM2 processes remain untouched."
CF="$(command -v cloudflared)"
[[ "$CF" == /usr/bin/cloudflared || "$CF" == /usr/local/bin/cloudflared ]] || fail 'Unexpected cloudflared binary path'
cloudflared tunnel run --help 2>&1 | grep -q -- '--token-file' || fail 'cloudflared 2025.4.0+ with --token-file is required'
if sudo systemctl is-active --quiet "$SVC"; then
 echo 'Named tunnel service is already active; no change made.'
 exit 0
fi
echo 'Get the token: Cloudflare Zero Trust > Networking > Tunnels > chaskabox-waha > Add a replica.'
echo 'Copy ONLY the long eyJ... tunnel token, NOT a command. It will not be echoed or saved in shell history.'
IFS= read -r -s -p 'Paste chaskabox-waha named tunnel token: ' TKN </dev/tty
printf '\n'
[[ -n "$TKN" ]] || fail 'Empty token'
printf '%s' "$TKN" | python3 -c '
import base64,json,sys
t=sys.stdin.read().strip()
try: d=json.loads(base64.urlsafe_b64decode(t+"="*(-len(t)%4)))
except Exception: raise SystemExit("STOP: invalid tunnel token format")
if d.get("t")!="b83a32c9-4ed0-482a-9703-89181fe29717" or d.get("a")!="16d9379f99684cfc5cad2e5a1b6a4363":
 raise SystemExit("STOP: token is for a different account or tunnel")
print("Tunnel identity verified; token not displayed")
'
echo 'NOTICE: Existing notification Worker has WhatsApp dispatch configured.'
echo 'When the named tunnel connects, eligible queued messages may be delivered.'
IFS= read -r -p 'Type CONNECT to activate the tunnel with that risk: ' ANSWER </dev/tty
[[ "$ANSWER" == "CONNECT" ]] || fail 'Cancelled safely; nothing changed'
sudo install -d -m 700 "$STATE"
printf '%s\n' "$TKN" | sudo tee "$TOKENFILE" >/dev/null
unset TKN
sudo chmod 600 "$TOKENFILE"
UNIT="$(mktemp)"
trap 'rm -f "$UNIT"' EXIT
cat > "$UNIT" <<EOF
[Unit]
Description=ChaskaBox named WAHA Cloudflare Tunnel (keeps PM2 quick tunnel unchanged)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$CF tunnel run --token-file $TOKENFILE
Restart=on-failure
RestartSec=8
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
if sudo test -e "/etc/systemd/system/$SVC"; then
 fail 'Unit already exists; refusing to overwrite'
fi
sudo install -m 644 "$UNIT" "/etc/systemd/system/$SVC"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SVC" >/dev/null
sleep 8
if sudo systemctl is-active --quiet "$SVC"; then
 echo "Named tunnel connector service ACTIVE (Cloudflare dashboard confirmation still required)"
else
 echo "Named tunnel connector failed to stay active; existing WAHA and PM2 remain untouched." >&2
 exit 1
fi

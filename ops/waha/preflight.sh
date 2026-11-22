#!/usr/bin/env bash
# ChaskaBox / Oracle WAHA preflight. READ ONLY; never echo API keys or .env.
set -Eeuo pipefail

ROOT="/home/ubuntu/waha"
if [ "$#" -gt 0 ]; then ROOT="$1"; fi
COMPOSE="$ROOT/docker-compose.yml"

echo "== WAHA OCI preflight (read-only) =="
echo "Host architecture: $(uname -m)"
if ! sudo test -f "$COMPOSE"; then echo "ERROR: compose not found: $COMPOSE"; exit 2; fi
if ! command -v python3 >/dev/null; then echo "ERROR: python3 not installed"; exit 2; fi
if ! sudo docker info >/dev/null 2>&1; then echo "ERROR: Docker daemon unavailable"; exit 2; fi

echo "Docker boot policy: $(systemctl is-enabled docker 2>/dev/null || true)"
echo "Docker service: $(systemctl is-active docker 2>/dev/null || true)"
echo "WAHA containers (names/status only):"
sudo docker ps -a --format '{{.Names}} {{.Status}}' | grep -Ei '^([[:alnum:]_.-]*[-_])?waha([_-][[:alnum:]_.-]+)?[[:space:]]' || echo "  none"
echo "WAHA images already downloaded:"
sudo docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep '^devlikeapro/waha:' || echo "  none"

# Resolved Compose JSON contains secrets. It is piped only to the local parser,
# never saved to disk, echoed to the terminal, or sent to a network service.
sudo docker compose -f "$COMPOSE" config --format json | python3 -c '
import json,os,sys
try:
  cfg=json.load(sys.stdin)
  s=cfg["services"]["waha"]
except (ValueError,KeyError,TypeError) as exc:
  print("ERROR: invalid WAHA Compose configuration ("+type(exc).__name__+")")
  sys.exit(2)
issues=[]
image=s.get("image","unset")
platform=s.get("platform","auto")
restart=s.get("restart","none")
print("Image:", image)
print("Configured platform:",platform)
print("Container restart policy:",restart)
if restart not in ("always","unless-stopped"):
  issues.append("container is not configured to restart after failures")
if platform=="linux/amd64" and os.uname().machine in ("aarch64","arm64"):
  issues.append("AMD64 image selected on ARM64 host (emulation or native ARM migration required)")
ports=s.get("ports",[])
if not ports: print("Published ports: none")
for p in ports:
  if isinstance(p,str):
    print("Port declaration: short syntax; review manually")
    issues.append("port binding requires manual security review")
    continue
  host=p.get("host_ip") or "0.0.0.0"
  published=str(p.get("published","unset"))
  target=str(p.get("target","unset"))
  print("Port binding:",host+":"+published+" -> "+target)
  if host not in ("127.0.0.1","::1"):
    issues.append("non-loopback published port detected; secure WAHA before exposure")
session_found=False
for v in s.get("volumes",[]):
  if not isinstance(v,dict): continue
  target=v.get("target")
  if target=="/app/.sessions":
    session_found=True
    typ=v.get("type","unknown")
    source=v.get("source","")
    print("Session persistence: mount configured ("+typ+")")
    if typ=="bind":
      print("Session directory exists:",os.path.isdir(source))
      if not os.path.isdir(source):
        issues.append("session bind directory missing; inspect before creating")
    elif typ=="volume":
      print("Session persistence: named Docker volume; verify backups separately")
    else:
      issues.append("unexpected session mount type")
if not session_found:
  issues.append("CRITICAL: /app/.sessions storage mount is missing")
env=s.get("environment") or {}
if not isinstance(env,dict): env={}
print("WAHA API key configured:",bool(env.get("WAHA_API_KEY")))
print("Dashboard password configured:",bool(env.get("WAHA_DASHBOARD_PASSWORD")))
print("Environment: secret values never displayed")
print("=== Findings ===")
if not issues: print("No automatic blockers found; manual security and session checks still required.")
for issue in issues: print("REVIEW:",issue)
'
echo "Local /health HTTP status (if running; no credentials):"
if command -v curl >/dev/null; then
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 http://127.0.0.1:3000/health || true)"
  echo "  $status (000 = unreachable; HTTP 200 = app health only, NOT WhatsApp session delivery)"
else echo "  curl unavailable"; fi
echo "End of read-only preflight. No container or configuration was changed."

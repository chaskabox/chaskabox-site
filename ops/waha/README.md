# ChaskaBox WAHA resilience kit — Oracle Ubuntu ARM64

**State:** Staging/reference kit. **Not installed on the Oracle VM.** No Cloudflare notification channels are enabled or queued messages replayed by these files.

Known 2026-10-16 observations from the owner:
- Oracle VM: `130.61.106.54`, Ubuntu 22.04, `aarch64`.
- Docker daemon runs, but no containers, named volumes or Compose projects were running or registered.
- Existing configuration: `/home/ubuntu/waha/docker-compose.yml` with service `waha`, image `devlikeapro/waha:latest`, forced `platform: linux/amd64`, ports and volumes declared (their *values* not yet inspected).
- Cached image `devlikeapro/waha:latest` is `amd64`.
- PM2 processes `wa-server` (on 127.0.0.1:3000) and `cf-tunnel` are online; `127.0.0.1:3001` was free. Do not stop or modify those services without inspecting their full role. The existing WAHA session bind directory exists but is empty.
- Cloudflare Worker has WAHA credentials but only `owner_email` is enabled. The gateway points to an ephemeral trycloudflare tunnel; no persistent named tunnel was found. WhatsApp delivery remains disabled.

## 2026-10-18 recheck — existing Cloudflare resources (read-only)
- **Named tunnel exists**: `chaskabox-waha`, Cloudflare status **down**, **zero connected connectors**. This supersedes the 2026-10-16 observation above that no named tunnel existed.
- Its existing Cloudflare-managed ingress is `waha.chaskabox.online` → HTTP localhost port **3001**, with an origin request access configuration. Do **not** create a duplicate tunnel or rotate an existing connector token without a verified backup.
- `chaskabox-notification-outbox` Worker exists. Its dispatch toggle is enabled and the configured channel list includes owner email and owner/customer WhatsApp. Owner-canary and webhook setup/verification toggles are currently off. **These settings do not prove WhatsApp messages are being delivered.** Leave them unchanged while recovering the VM to avoid accidental or duplicate sends.
- **Remaining hard blocker:** This ChatGPT connection has Cloudflare and GitHub management access, **not Oracle VM SSH**. Cloudflare API cannot start a `cloudflared` connector or Docker container inside the Oracle instance. Run read-only preflight via an authenticated SSH session before any production changes. Do not paste API tokens, Compose resolved JSON, WAHA QR codes, session files, or private credentials into chats.
- After preflight, identify whether the working WhatsApp service is the earlier PM2 gateway or Docker WAHA, determine which process (if any) is paired, and secure private session backups **before** recovery. If the PM2 service is the current working sender, never replace or restart it simply to activate a new WAHA container.
- **No VM restart, image pull, WhatsApp sending, Cloudflare tunnel change or Worker setting change was performed in this recheck.**

## 2026-10-18 latest owner verification: WAHA already running — do NOT reinstall
- Actual `docker ps -a` shows **container `waha` up 2 days**, using native `devlikeapro/waha:arm` and mapping only **127.0.0.1:3001 → 3000**. The local `/health` returns **HTTP 401**, proving an authenticated endpoint responds, **not** that a WhatsApp session is WORKING.
- Earlier preflight showed `none` due to a defective grep rule: it parsed `waha Up 2 days` but did not accept the whitespace after the container name. That detection bug and a regression test were corrected in this branch.
- Backup directory **exists**, but its contents, recoverability, and timestamps **have not been verified**. The session directory contains **586 files**. Protect the existing bind mount and never share auth files, QR, tokens, or environment values.
- **Do not execute `deploy-local-oci.sh`, start another WAHA container, pull over the active image or run the original AMD64 Compose file.** The host already has a live native ARM WAHA container; deployment preconditions are no longer valid.
- The named Cloudflare tunnel **chaskabox-waha** continues to report **DOWN, zero connectors** even though PM2 `cf-tunnel` is online. Inspect the PM2 process/tunnel identity without printing its token before any tunnel change.
- Remaining gates: authenticated, read-only `GET /api/sessions?all=true` via localhost (report status/name only); confirm private backup files and their integrity; safely reconnect the named tunnel while preserving existing PM2 services; approved canary test; no customer outbox replay.

## Safety boundaries

Do **not** use `docker system prune`, `docker compose down -v`, `docker volume rm`, session deletion, blind `docker pull && docker compose up`, or publish port 3000 to `0.0.0.0`. Do **not** commit `.env`, `.sessions`, QR images, media, private keys, backups, or API credentials to GitHub. WAHA is an unofficial integration: do not broadcast, bulk replay stale outbox jobs, or bypass WhatsApp consent/rate limits.

## 1. Read-only audit on the VM

In SSH as ubuntu (not in the Cloud Shell prompt), download the reviewed script:

```bash
curl -fsSLo /tmp/chaskabox-waha-preflight.sh https://raw.githubusercontent.com/chaskabox/chaskabox-site/ops/waha-oci-resilience-20261016/ops/waha/preflight.sh
less /tmp/chaskabox-waha-preflight.sh
bash /tmp/chaskabox-waha-preflight.sh
```

It reads `docker compose config` *locally* and prints only safe metadata — no secret values. It does not start, stop, reboot, change any Docker resource, or modify any file. Review findings before making changes. Also check old session data (paths only, not contents):

```bash
sudo find /home/ubuntu/waha -maxdepth 3 -type d \( -name 'sessions' -o -name '.sessions' -o -name 'media' -o -name '.media' \) -print
sudo ls -ld /home/ubuntu/waha /home/ubuntu/waha/.env
```

## 2. Back up original settings AND session data (before any change)

Determine the actual bind-mount sources from preflight. Store copies in a private folder **outside Git** and restrict access. A backup that is not restored/tested is not sufficient. If storage is empty, plan a fresh authorized QR pairing. Never copy session files to chat.

```bash
sudo install -d -m 700 /home/ubuntu/waha-private-backups
sudo cp -p /home/ubuntu/waha/docker-compose.yml /home/ubuntu/waha-private-backups/docker-compose.yml.original
# Only if .env exists:
sudo test ! -f /home/ubuntu/waha/.env || sudo cp -p /home/ubuntu/waha/.env /home/ubuntu/waha-private-backups/waha.env.original
sudo chmod 600 /home/ubuntu/waha-private-backups/*
```

Back up the actual *existing* session mount after inspecting its path; do not assume `sessions/` contains it. Make an off-VM encrypted copy with limited retention after the first successful test.

## 3. Proposed hardening, NOT yet applied

See `compose.override.example.yml`. It **requires Docker Compose >=2.24.4**, because the `ports: !override` directive must **replace**, not append to, the original public `0.0.0.0:3000` binding. Never apply a normal merge that keeps the original public binding. Apply an override only after these release gates pass:

1. Confirm `/app/.sessions` is bind-mounted or backed by persistent storage; verify the location and snapshot it. Keep existing WAHA engine and namespace settings so previously paired sessions remain readable.
2. Confirm API key and dashboard/password policy without printing them; verify local `/health` and authenticated session status.
3. Confirm merged Compose config publishes **only `127.0.0.1:3001` -> `3000`**, never `0.0.0.0:3000`. The overlay uses `!override` to replace the original exposure. Keep PM2 `wa-server` and `cf-tunnel` untouched.
4. Use native `devlikeapro/waha:arm` for this aarch64 machine. Test pulled image architecture before switching; keep prior image/tag and session backup for rollback.
5. Add `restart: unless-stopped`, bounded container logging, optional verified app-health check. Ensure Docker starts on boot via `systemctl is-enabled docker`; only enable it as an authorized separate action. A stopped/removed container that has **never been started** will not magically be resurrected by a restart policy.
6. Create a *persistent named* Cloudflare Tunnel and DNS hostname instead of temporary `*.trycloudflare.com`; validate secure inbound access using the required WAHA API key. Do not make Dashboard/Swagger freely public.
7. Verify session status `WORKING`, manually approved owner-only test message, provider acknowledgement vs actual receipt, server reboot recovery, and an encrypted backup restore test. Only then consider enabling a single allowlisted WhatsApp target.

For a new verified native ARM release, keep a version/digest-pinned image once evaluated. Avoid automatic unreviewed image upgrades. `restart: unless-stopped` keeps a healthy Docker container alive across process crashes and boots when Docker is enabled, while honoring deliberate stops. It cannot guarantee zero downtime, revive WhatsApp authentication after logout or provider bans, or solve a VM/network outage. Health checks and on-call alerts are still needed; a Docker "unhealthy" status alone does **not** restart a container.

## 4. Post-release verification commands (read-only)

```bash
sudo docker compose -f /home/ubuntu/waha/docker-compose.yml ps
sudo docker inspect waha --format '{{.HostConfig.RestartPolicy.Name}} {{.State.Status}}' 2>/dev/null || true
curl -sS -o /dev/null -w 'health HTTP %{http_code}\n' --max-time 5 http://127.0.0.1:3000/health
sudo systemctl is-enabled docker
```

**References:** [WAHA Docker install](https://waha.devlike.pro/blog/waha-on-docker/), [WAHA session storage](https://waha.devlike.pro/docs/how-to/storages/), [WAHA security](https://waha.devlike.pro/docs/how-to/security/), [WAHA observability](https://waha.devlike.pro/docs/how-to/observability/), [Docker restart policy](https://docs.docker.com/reference/compose-file/services/#restart).

## PM2-discovery fast route (current host)

`pm2 list` has confirmed a long-running `wa-server` on port 3000 and a `cf-tunnel` process. They are not WAHA Docker containers. **Do not restart either**, and do not assume the tunnel already targets the new WAHA port. Inspect their purpose and align proxy/tunnel routing separately after WAHA works locally on 3001. To prepare an additive override while preserving the original settings:

```bash
sudo docker compose version
sudo ss -lntp | grep ':3001 ' || echo 'Port 3001 available'
cd /home/ubuntu/waha
sudo install -d -m 700 /home/ubuntu/waha-private-backups
sudo cp -p docker-compose.yml /home/ubuntu/waha-private-backups/docker-compose.yml.before-arm
sudo test ! -f .env || sudo cp -p .env /home/ubuntu/waha-private-backups/waha.env.before-arm
sudo chmod 600 /home/ubuntu/waha-private-backups/*
curl -fsSL -o compose.oci.override.yml https://raw.githubusercontent.com/chaskabox/chaskabox-site/ops/waha-oci-resilience-20261016/ops/waha/compose.override.example.yml
```

**Pre-start gate** (read-only, sanitizes and validates merged config; does not print env secrets):

```bash
sudo docker compose -f docker-compose.yml -f compose.oci.override.yml config --format json | python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]["waha"]; ports=s.get("ports",[]); actual=[(str(p.get("host_ip")),str(p.get("published")),str(p.get("target"))) for p in ports]; assert actual==[("127.0.0.1","3001","3000")], "Unsafe/incompatible port mapping: "+repr(actual); assert s.get("platform")=="linux/arm64"; assert s.get("restart")=="unless-stopped"; assert any(v.get("target")=="/app/.sessions" for v in s.get("volumes",[])); print("Pre-start gate PASSED: ARM64, local port 3001, session mount, restart")'
```

Do **not** start if this validation fails, if the `.env` has unexpected/missing values, or if available disk space is low. Successful pre-start gate does not prove actual WhatsApp session login or an authorized external tunnel connection. Only after reviewed/approved startup should the command use **both** Compose files (never original alone) to avoid re-exposing the public port.

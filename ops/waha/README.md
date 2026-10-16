# ChaskaBox WAHA resilience kit — Oracle Ubuntu ARM64

**State:** Staging/reference kit. **Not installed on the Oracle VM.** No Cloudflare notification channels are enabled or queued messages replayed by these files.

Known 2026-10-16 observations from the owner:
- Oracle VM: `130.61.106.54`, Ubuntu 22.04, `aarch64`.
- Docker daemon runs, but no containers, named volumes or Compose projects were running or registered.
- Existing configuration: `/home/ubuntu/waha/docker-compose.yml` with service `waha`, image `devlikeapro/waha:latest`, forced `platform: linux/amd64`, ports and volumes declared (their *values* not yet inspected).
- Cached image `devlikeapro/waha:latest` is `amd64`.
- Cloudflare Worker has WAHA credentials but only `owner_email` is enabled. The gateway points to an ephemeral trycloudflare tunnel; no persistent named tunnel was found. WhatsApp delivery remains disabled.

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

See `compose.override.example.yml`. Apply an override only after these release gates pass:

1. Confirm `/app/.sessions` is bind-mounted or backed by persistent storage; verify the location and snapshot it. Keep existing WAHA engine and namespace settings so previously paired sessions remain readable.
2. Confirm API key and dashboard/password policy without printing them; verify local `/health` and authenticated session status.
3. Confirm all published WAHA ports bind to `127.0.0.1` (or `::1`) or are otherwise protected behind a trusted proxy, firewall and access layer. **Compose overlay does not remove an already-public port.** Fix base port binding first, if necessary.
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

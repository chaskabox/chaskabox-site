# Free, one-run WAHA tunnel recovery

This helper is for the existing Oracle Ubuntu VM running the `waha` container.
It does not connect ChatGPT to a remote shell. It executes a reviewed, fixed
sequence locally, so the owner needs one paste rather than a series of commands.
There is no new service subscription, remote executor, public SSH access, or
repository runner. The existing Oracle and Cloudflare accounts are used.

## What running it authorizes

`sudo python3 recover.py --apply`:

1. Checks the existing running `waha` container, its exact localhost port 3001
   mapping and session bind mount under `/home/ubuntu/waha`. It requires the
   existing `default` WhatsApp session to be `WORKING`.
2. Reuses a private token file or an eligible private PM2 snapshot if its token
   matches the existing ChaskaBox account and tunnel. Otherwise, one hidden
   terminal prompt accepts that tunnel token or the dashboard's copied install
   command. The copied command is parsed as data and is never executed.
3. Creates a private local archive of the existing session directory. It reads
   every regular archived file, verifies it against the source, checks the gzip
   stream, membership and SHA-256 checksum. Active changes or missing backup
   space stop recovery before connector changes. Symlinks are archived without
   following their targets. Archives stay in `/var/backups/chaskabox-waha-recovery`.
   This is local integrity evidence; it is not an off-VM restore certification.
4. Configures only `chaskabox-waha-tunnel.service`. Its existing, system-owned
   `cloudflared` binary runs as the unprivileged Ubuntu user, with its token in a
   private file, an automatic restart policy, and a loopback readiness endpoint.
5. Waits for the connector to become ready. A startup failure restores the helper's
   previous unit and token and its previous enabled/running state. An already
   matching, ready connector is left running.

It never restarts WAHA or PM2, pulls images, deletes/re-pairs sessions, changes
DNS/Access rules, changes dispatch settings, retries old jobs, or sends messages.
No raw Docker metadata, session filenames, credentials or service logs are printed.
The final output is one bounded JSON summary, safe to share for follow-up.

## Before the one paste

Open SSH **inside the existing WAHA VM**, normally `ubuntu@130.61.106.54`.
The separate OCI Cloud Shell machine is not the VM and will fail the host check.
The helper needs Python 3.9+, Docker, systemd, the Ubuntu user, and an existing
system-owned `cloudflared` version at least 2025.4.0. It installs no software and
will report a bounded hold code if the host differs from these known assumptions.

If asked for a tunnel token, open Cloudflare **Networking → Tunnels →
chaskabox-waha → Add a replica** and copy its install command into the helper's
hidden prompt. Do not run that command separately or post it to chat. Tokens for
other tunnels/accounts are rejected. If Docker stores only the local WAHA key's
SHA-512 hash, an additional hidden local API-key prompt is necessary; its hash is
checked before use. A plaintext key already in the container configuration is
used privately without an extra prompt.

The release command downloads an immutable Git commit, verifies the published
SHA-256 and invokes this helper with `--apply`. The script alone, without
`--apply`, checks the host without changing services or creating a backup.

## Reading the result

`connector_ready: true` proves a local cloudflared connection, not delivery of
a WhatsApp message. The next external check must confirm the owned hostname,
Cloudflare Access authentication and the WAHA session through the existing
notification worker. A real message test is a separate explicit action.

Selected hold codes:

| Code | Meaning |
| --- | --- |
| `run_inside_existing_waha_vm_not_cloud_shell` | Run from the actual existing VM's SSH terminal. |
| `default_whatsapp_session_not_working` | Session recovery is needed; no reset or QR is attempted. |
| `existing_cloudflared_needs_token_file_support` | Existing binary is too old; no upgrade was performed. |
| `session_changed_during_backup` | Backup could not be verified against the active files; no connector changes. |
| `token_is_not_for_chaskabox_tunnel` | Input did not identify the existing account and named tunnel. |
| `existing_unit_is_not_owned` | An existing unit does not belong to this helper; it is preserved. |
| `connector_start_failed_previous_state_restored` | The helper reverted its service and credential changes. |
| `connector_recovery_needs_manual_rollback` | Rollback itself could not finish; inspect only this helper's unit. |

## Verification

The Python tests use isolated temporary directories, fake session/API data and
mocked systemctl calls. They never access a real container, provider or service.
They also run through `npm test` via `tests/waha-free-recovery.test.mjs`.

Primary documentation:

- [Cloudflare token-file and version requirement](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
- [Oracle Cloud Shell is separate and has no external SSH ingress](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/cloudshellintro.htm)
- [WAHA API key and hash formats](https://waha.devlike.pro/docs/how-to/security/)

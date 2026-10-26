#!/usr/bin/env python3
"""ChaskaBox's scoped, one-run Oracle host recovery. Python stdlib only.

Run on the existing WAHA VM, not on the separate OCI Cloud Shell machine.
No remote shell, paid service, image replacement, session reset or message send.
"""
import argparse
import base64
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import termios
import time
import urllib.error
import urllib.request

ACCOUNT = "16d9379f99684cfc5cad2e5a1b6a4363"
TUNNEL = "b83a32c9-4ed0-482a-9703-89181fe29717"
HOME = Path("/home/ubuntu")
WAHA_ROOT = HOME / "waha"
CONFIG = Path("/etc/chaskabox-waha-recovery")
TOKEN = CONFIG / "token"
UNIT_NAME = "chaskabox-waha-tunnel.service"
UNIT = Path("/etc/systemd/system") / UNIT_NAME
BACKUPS = Path("/var/backups/chaskabox-waha-recovery")
LOCK = Path("/run/lock/chaskabox-waha-recovery.lock")
METRICS_PORT = 49387
MARKER = "# Managed by ChaskaBox one-run recovery v1\n"

class Hold(Exception):
    """A bounded code, never provider/command output or a credential."""

def command(args, *, check=True, timeout=25):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                                env={**os.environ, "LC_ALL": "C"})
    except (OSError, subprocess.SubprocessError):
        raise Hold("command_unavailable") from None
    if check and result.returncode:
        raise Hold("command_failed")
    return result

def tunnel_token(value):
    """Accept a token or copied install command, but never execute that command."""
    if not isinstance(value, str) or len(value) > 16384:
        raise Hold("invalid_tunnel_token")
    try:
        candidates = shlex.split(value.strip())
    except ValueError:
        raise Hold("invalid_tunnel_token") from None
    for candidate in candidates:
        if not re.fullmatch(r"[A-Za-z0-9_+/=-]{40,8192}", candidate):
            continue
        try:
            data = json.loads(base64.b64decode(candidate + "=" * (-len(candidate) % 4), altchars=b"-_", validate=True))
        except (ValueError, UnicodeError):
            continue
        if (isinstance(data, dict) and data.get("a") == ACCOUNT and data.get("t") == TUNNEL
                and isinstance(data.get("s"), str) and 16 <= len(data["s"]) <= 1024):
            return candidate
    raise Hold("token_is_not_for_chaskabox_tunnel")

def secret_prompt(label):
    """Read only from an echo-disabled controlling terminal; never stdin fallback."""
    try:
        with open("/dev/tty", "r+", encoding="utf-8", buffering=1) as terminal:
            before = termios.tcgetattr(terminal.fileno())
            hidden = before.copy()
            hidden[3] &= ~(termios.ECHO | termios.ECHONL)
            termios.tcsetattr(terminal.fileno(), termios.TCSAFLUSH, hidden)
            try:
                terminal.write(label + ": ")
                terminal.flush()
                value = terminal.readline(16385)
            finally:
                termios.tcsetattr(terminal.fileno(), termios.TCSAFLUSH, before)
                terminal.write("\n")
            if not value or len(value) > 16384:
                raise Hold("secret_input_cancelled")
            return value.strip()
    except (OSError, termios.error):
        raise Hold("interactive_ssh_terminal_required") from None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def local_get(url, key=None):
    if not re.fullmatch(r"http://127\.0\.0\.1:(3001|49387)/(api/sessions\?all=true|ready)", url):
        raise Hold("unexpected_local_endpoint")
    headers = {"Accept": "application/json"}
    if key is not None:
        headers["X-Api-Key"] = key
    # Do not send a local credential through a proxy or a redirect.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(urllib.request.Request(url, headers=headers), timeout=8) as response:
            body = response.read(65537)
            if len(body) > 65536:
                raise Hold("local_response_too_large")
            return response.status, body
    except urllib.error.HTTPError as error:
        return error.code, b""
    except (OSError, ValueError):
        raise Hold("local_gateway_unreachable") from None

def inspect_waha(data):
    if not isinstance(data, list) or len(data) != 1 or data[0].get("Name") != "/waha":
        raise Hold("existing_waha_container_missing")
    container = data[0]
    if container.get("State", {}).get("Running") is not True:
        raise Hold("existing_waha_container_not_running")
    ports = container.get("NetworkSettings", {}).get("Ports", {}).get("3000/tcp")
    if ports != [{"HostIp": "127.0.0.1", "HostPort": "3001"}]:
        raise Hold("expected_loopback_mapping_missing")
    mounts = [m for m in container.get("Mounts", []) if m.get("Destination") == "/app/.sessions"]
    if len(mounts) != 1 or mounts[0].get("Type") != "bind":
        raise Hold("session_bind_mount_not_verified")
    source = Path(mounts[0].get("Source", "/"))
    if source.is_symlink() or not source.is_dir():
        raise Hold("session_directory_missing")
    source = source.resolve()
    if not source.is_relative_to(WAHA_ROOT.resolve()) or source == WAHA_ROOT.resolve():
        raise Hold("unexpected_session_location")
    values = dict(item.split("=", 1) for item in container.get("Config", {}).get("Env", []) if "=" in item)
    key = values.get("WHATSAPP_API_KEY") or values.get("WAHA_API_KEY")
    if not key or "\n" in key or "\r" in key:
        raise Hold("local_waha_key_missing")
    return source, key

def plain_waha_key(value, prompt=secret_prompt):
    if not value.startswith("sha512:"):
        return value
    digest = value[7:].lower()
    if not re.fullmatch(r"[0-9a-f]{128}", digest):
        raise Hold("local_waha_hash_invalid")
    supplied = prompt("Local WAHA API key (hidden; not a chat message)")
    import hmac
    if not hmac.compare_digest(hashlib.sha512(supplied.encode()).hexdigest(), digest):
        raise Hold("local_waha_key_does_not_match")
    return supplied

def verify_session(key, get=local_get):
    status, raw = get("http://127.0.0.1:3001/api/sessions?all=true", key)
    if status != 200:
        raise Hold("local_waha_authentication_failed")
    try:
        sessions = json.loads(raw)
    except (ValueError, UnicodeError):
        raise Hold("local_session_response_invalid") from None
    if not isinstance(sessions, list) or not any(s.get("name") == "default" and s.get("status") == "WORKING" for s in sessions if isinstance(s, dict)):
        raise Hold("default_whatsapp_session_not_working")

def private_read(path):
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 16384 or info.st_mode & 0o077:
            return None
        if info.st_uid not in (0, pwd.getpwnam("ubuntu").pw_uid):
            return None
        return path.read_text()
    except (OSError, KeyError, UnicodeError):
        return None

def find_token(prompt=secret_prompt):
    paths = [TOKEN, Path("/etc/cloudflared/token"), HOME / ".cloudflared" / (TUNNEL + ".token")]
    for path in paths:
        value = private_read(path)
        if value:
            try:
                return tunnel_token(value)
            except Hold:
                pass
    # The existing PM2 snapshot is read privately; its environment is never printed.
    snapshot = HOME / ".pm2/dump.pm2"
    try:
        info = snapshot.lstat()
        if stat.S_ISREG(info.st_mode) and info.st_size <= 4 * 1024 * 1024 and not info.st_mode & 0o077:
            processes = json.loads(snapshot.read_text())
            for process in processes if isinstance(processes, list) else []:
                env = process.get("pm2_env", process)
                if (process.get("name") or env.get("name")) not in ("cf-tunnel", "chaskabox-waha-tunnel"):
                    continue
                args = env.get("args", [])
                if isinstance(args, list):
                    args = shlex.join(str(a) for a in args)
                for value in [args, env.get("TUNNEL_TOKEN", ""), env.get("env", {}).get("TUNNEL_TOKEN", "")]:
                    try:
                        return tunnel_token(value)
                    except Hold:
                        pass
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return tunnel_token(prompt("Cloudflare chaskabox-waha token OR its copied install command (hidden)"))

def inventory(source):
    files = {}
    size = 0
    for root, directories, names in os.walk(source, followlinks=False):
        for name in names + [n for n in directories if (Path(root) / n).is_symlink()]:
            path = Path(root) / name
            info = path.lstat()
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
                raise Hold("unsupported_session_file_type")
            relative = path.relative_to(source).as_posix()
            files[relative] = info.st_size
            size += info.st_size
    if not files:
        raise Hold("session_directory_empty")
    return files, size

def private_directory(path, uid=0, gid=0):
    if path.is_symlink():
        raise Hold("unsafe_destination_directory")
    path.mkdir(mode=0o700, parents=False, exist_ok=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, uid, os.geteuid()):
        raise Hold("unsafe_destination_directory")
    os.chmod(path, 0o700)
    os.chown(path, uid, gid)

def backup_sessions(source, parent=BACKUPS):
    files, size = inventory(source)
    existing = parent if parent.exists() else parent.parent
    if shutil.disk_usage(existing).free < size * 2 + 64 * 1024 * 1024:
        raise Hold("backup_disk_space_low")
    private_directory(parent)
    directory = Path(tempfile.mkdtemp(prefix="sessions-", dir=parent))
    os.chmod(directory, 0o700)
    archive = directory / "sessions.tar.gz"
    try:
        with tarfile.open(archive, "w:gz", dereference=False) as output:
            output.add(source, arcname="sessions", recursive=True)
        os.chmod(archive, 0o600)
        seen = set()
        with tarfile.open(archive, "r:gz") as packed:
            for member in packed:
                if member.name.startswith("/") or ".." in Path(member.name).parts:
                    raise Hold("backup_member_invalid")
                if member.isfile() or member.issym():
                    seen.add(str(Path(member.name).relative_to("sessions")))
                if member.isfile():
                    digest = hashlib.sha256()
                    with packed.extractfile(member) as stream:
                        for chunk in iter(lambda: stream.read(65536), b""):
                            digest.update(chunk)
                    current = source / Path(member.name).relative_to("sessions")
                    if current.is_symlink() or digest.hexdigest() != hash_file(current):
                        raise Hold("session_changed_during_backup")
        after, _ = inventory(source)
        if seen != set(files) or set(after) != set(files):
            raise Hold("session_changed_during_backup")
        with gzip.open(archive, "rb") as stream:
            for _ in iter(lambda: stream.read(65536), b""):
                pass
        checksum = hash_file(archive)
        (directory / "archive.sha256").write_text(checksum + "  sessions.tar.gz\n")
        return archive
    except (OSError, tarfile.TarError, ValueError):
        raise Hold("session_backup_verification_failed") from None

def hash_file(path):
    value = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            value.update(chunk)
    return value.hexdigest()

def unit_text(binary):
    if not re.fullmatch(r"/[A-Za-z0-9_./+-]+", str(binary)):
        raise Hold("unsupported_cloudflared_path")
    return MARKER + f"""[Unit]
Description=ChaskaBox WAHA named tunnel connector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
ExecStart={binary} tunnel --no-autoupdate --metrics 127.0.0.1:{METRICS_PORT} run --token-file {TOKEN}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
RestrictSUIDSGID=true
CapabilityBoundingSet=
UMask=0077

[Install]
WantedBy=multi-user.target
"""

def check_owned_unit(path=None):
    path = UNIT if path is None else path
    if path.is_symlink():
        raise Hold("existing_unit_is_not_owned")
    if path.exists():
        info = path.stat()
        if (not stat.S_ISREG(info.st_mode) or info.st_size > 16384 or info.st_uid != 0
                or info.st_mode & 0o022 or not path.read_text().startswith(MARKER)):
            raise Hold("existing_unit_is_not_owned")

def atomic_write(path, data, mode, uid=0, gid=0):
    if path.is_symlink():
        raise Hold("unsafe_destination_file")
    fd, temporary = tempfile.mkstemp(prefix=".recovery-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data if isinstance(data, bytes) else data.encode())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            os.fchown(stream.fileno(), uid, gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def ready(get=local_get):
    try:
        return get(f"http://127.0.0.1:{METRICS_PORT}/ready")[0] == 200
    except Hold:
        return False

def install_connector(binary, token, *, run=command, get=local_get, wait=time.sleep):
    check_owned_unit()
    account = pwd.getpwnam("ubuntu")
    if account.pw_uid == 0 or CONFIG.is_symlink():
        raise Hold("unsafe_destination_directory")
    text = unit_text(binary)
    old_unit = UNIT.read_bytes() if UNIT.exists() else None
    if TOKEN.is_symlink() or (TOKEN.exists() and (not stat.S_ISREG(TOKEN.stat().st_mode) or TOKEN.stat().st_size > 8192)):
        raise Hold("unsafe_destination_file")
    old_token = TOKEN.read_bytes() if TOKEN.exists() else None
    old_token_info = TOKEN.stat() if TOKEN.exists() else None
    old_unit_mode = stat.S_IMODE(UNIT.stat().st_mode) if UNIT.exists() else 0o644
    active = run(["systemctl", "is-active", UNIT_NAME], check=False).returncode == 0
    enabled = run(["systemctl", "is-enabled", UNIT_NAME], check=False).returncode == 0
    if active and old_unit == text.encode() and old_token == (token + "\n").encode() and ready(get):
        return False
    if not active:
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", METRICS_PORT))
            except OSError:
                raise Hold("metrics_port_in_use") from None
    private_directory(CONFIG, account.pw_uid, account.pw_gid)
    try:
        atomic_write(TOKEN, token + "\n", 0o600, account.pw_uid, account.pw_gid)
        atomic_write(UNIT, text, 0o644)
        run(["systemctl", "daemon-reload"])
        run(["systemctl", "enable", UNIT_NAME])
        run(["systemctl", "restart", UNIT_NAME])
        for _ in range(20):
            if run(["systemctl", "is-active", UNIT_NAME], check=False).returncode == 0 and ready(get):
                return True
            wait(3)
        raise Hold("connector_did_not_become_ready")
    except (Hold, OSError, KeyboardInterrupt):
        try:
            run(["systemctl", "stop", UNIT_NAME], check=False)
            if not enabled:
                run(["systemctl", "disable", UNIT_NAME], check=False)
            if old_unit is None:
                UNIT.unlink(missing_ok=True)
            else:
                atomic_write(UNIT, old_unit, old_unit_mode)
            if old_token is None:
                TOKEN.unlink(missing_ok=True)
            else:
                atomic_write(TOKEN, old_token, stat.S_IMODE(old_token_info.st_mode), old_token_info.st_uid, old_token_info.st_gid)
            run(["systemctl", "daemon-reload"])
            if enabled:
                run(["systemctl", "enable", UNIT_NAME])
            if active:
                run(["systemctl", "start", UNIT_NAME])
        except (Hold, OSError):
            raise Hold("connector_recovery_needs_manual_rollback") from None
        raise Hold("connector_start_failed_previous_state_restored") from None

def recover(apply=False, *, run=command, get=local_get, prompt=secret_prompt):
    if sys.platform != "linux" or not WAHA_ROOT.is_dir() or not shutil.which("docker"):
        raise Hold("run_inside_existing_waha_vm_not_cloud_shell")
    if apply and os.geteuid() != 0:
        raise Hold("run_this_script_with_sudo")
    try:
        data = json.loads(run(["docker", "inspect", "waha"]).stdout)
    except ValueError:
        raise Hold("container_metadata_invalid") from None
    source, stored = inspect_waha(data)
    local_key = plain_waha_key(stored, prompt)
    verify_session(local_key, get)
    binary = shutil.which("cloudflared")
    if not binary:
        raise Hold("cloudflared_binary_missing_no_software_installed")
    binary = Path(binary).resolve()
    binary_info = binary.stat()
    if not stat.S_ISREG(binary_info.st_mode) or binary_info.st_uid != 0 or binary_info.st_mode & 0o022:
        raise Hold("cloudflared_binary_not_system_owned")
    for parent in binary.parents:
        info = parent.stat()
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise Hold("cloudflared_binary_not_system_owned")
    version = run([str(binary), "--version"]).stdout
    match = re.search(r"\b(20\d\d)\.(\d+)\.(\d+)\b", version)
    if not match or tuple(map(int, match.groups())) < (2025, 4, 0):
        raise Hold("existing_cloudflared_needs_token_file_support")
    check_owned_unit()
    inventory(source)
    if not apply:
        return {"ok": True, "mode": "check", "session": "WORKING", "changes": False}
    # One locked operation; the existing WAHA container and PM2 processes are untouched.
    fd = os.open(LOCK, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Hold("another_recovery_is_running") from None
        token = find_token(prompt)
        backup_sessions(source)
        verify_session(local_key, get)
        changed = install_connector(binary, token, run=run, get=get)
    return {"ok": True, "mode": "apply", "session": "WORKING", "backup_verified": True,
            "connector_ready": True, "connector_changed": changed,
            "messages_sent": 0, "host_recovery_only": True}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Back up sessions and configure only the named tunnel connector")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = recover(args.apply)
    except Hold as error:
        result = {"ok": False, "code": str(error), "messages_sent": 0}
    except (Exception, KeyboardInterrupt):
        result = {"ok": False, "code": "host_check_failed_no_raw_output_shared", "messages_sent": 0}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 2

if __name__ == "__main__":
    sys.exit(main())

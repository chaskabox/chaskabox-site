"""Offline fixtures only. No actual providers, containers, services or credentials."""
import base64
from contextlib import ExitStack, redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "ops/waha/recover.py"
spec = importlib.util.spec_from_file_location("waha_recovery", SCRIPT)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)

def token(account=recovery.ACCOUNT, tunnel=recovery.TUNNEL):
    return base64.b64encode(json.dumps({"a": account, "t": tunnel, "s": "synthetic-not-a-real-secret"}).encode()).decode()

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cb-recovery-test-")
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.waha = self.home / "waha"
        self.source = self.waha / ".sessions"
        self.source.mkdir(parents=True)
        (self.source / "fixture-session").write_text("synthetic session fixture")
        self.unit = self.root / "connector.service"
        self.config = self.root / "config"
        self.keyfile = self.config / "token"
        self.stack = ExitStack()
        for name, value in {"HOME": self.home, "WAHA_ROOT": self.waha, "UNIT": self.unit,
                            "CONFIG": self.config, "TOKEN": self.keyfile, "LOCK": self.root / "lock"}.items():
            self.stack.enter_context(patch.object(recovery, name, value))
        self.uid = os.getuid() or 1000
        self.stack.enter_context(patch.object(recovery.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=self.uid, pw_gid=self.uid)))
        self.stack.enter_context(patch.object(recovery.os, "chown"))
        self.stack.enter_context(patch.object(recovery.os, "fchown"))
        self.data = [{"Name": "/waha", "State": {"Running": True},
                      "NetworkSettings": {"Ports": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3001"}]}},
                      "Mounts": [{"Type": "bind", "Source": str(self.source), "Destination": "/app/.sessions"}],
                      "Config": {"Env": ["WAHA_API_KEY=synthetic-local-key"]}}]

    def tearDown(self):
        self.stack.close()
        self.temp.cleanup()

    def test_token_is_scoped_to_existing_account_and_tunnel(self):
        expected = token()
        self.assertEqual(recovery.tunnel_token(expected), expected)
        self.assertEqual(recovery.tunnel_token("sudo cloudflared service install " + expected), expected)
        self.assertEqual(recovery.tunnel_token("docker run cloudflare/cloudflared tunnel run --token " + expected), expected)
        for value in [token(account="other"), token(tunnel="other"), "$(touch /tmp/should-never-run)", "x" * 20000, "\"unterminated"]:
            with self.assertRaises(recovery.Hold):
                recovery.tunnel_token(value)

    def test_container_scope_requires_existing_running_loopback_and_session_mount(self):
        source, key = recovery.inspect_waha(self.data)
        self.assertEqual(source, self.source.resolve())
        self.assertEqual(key, "synthetic-local-key")
        for change in [lambda d: d[0]["State"].update(Running=False),
                       lambda d: d[0]["NetworkSettings"]["Ports"]["3000/tcp"][0].update(HostIp="0.0.0.0"),
                       lambda d: d[0]["Mounts"][0].update(Source=str(self.root)),
                       lambda d: d[0]["Mounts"][0].update(Type="volume")]:
            fixture = json.loads(json.dumps(self.data)); change(fixture)
            with self.assertRaises(recovery.Hold):
                recovery.inspect_waha(fixture)

    def test_hashed_key_requires_local_hidden_input_and_never_changes_it(self):
        value = "fixture-local-plain-value"
        hashed = "sha512:" + hashlib.sha512(value.encode()).hexdigest()
        self.assertEqual(recovery.plain_waha_key(hashed, lambda _: value), value)
        self.assertEqual(recovery.plain_waha_key(value, lambda _: self.fail("Unexpected prompt")), value)
        with self.assertRaisesRegex(recovery.Hold, "does_not_match"):
            recovery.plain_waha_key(hashed, lambda _: "wrong")

    def test_only_working_default_session_passes_and_only_get_endpoint_is_used(self):
        calls = []
        def get(url, key=None):
            calls.append((url, key))
            return 200, b'[{"name":"default","status":"WORKING"}]'
        recovery.verify_session("fixture", get)
        self.assertEqual(calls, [("http://127.0.0.1:3001/api/sessions?all=true", "fixture")])
        for response in [(401, b""), (200, b'[{"name":"default","status":"SCAN_QR_CODE"}]'),
                         (200, b'[{"name":"other","status":"WORKING"}]'), (200, b"bad-json")]:
            with self.assertRaises(recovery.Hold):
                recovery.verify_session("fixture", lambda *args: response)
        with self.assertRaisesRegex(recovery.Hold, "unexpected_local_endpoint"):
            recovery.local_get("https://untrusted.example.invalid", "fixture")

    def test_backup_reads_every_file_and_preserves_private_permissions(self):
        outside = self.root / "outside"
        outside.write_text("not part of the backup")
        (self.source / "link").symlink_to(outside)
        archive = recovery.backup_sessions(self.source, self.root / "backups")
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(archive.parent.stat().st_mode), 0o700)
        with recovery.tarfile.open(archive, "r:gz") as packed:
            self.assertTrue(packed.getmember("sessions/link").issym())
            self.assertEqual(packed.extractfile("sessions/fixture-session").read(), b"synthetic session fixture")
        self.assertEqual((archive.parent / "archive.sha256").read_text().split()[0], recovery.hash_file(archive))
        with self.assertRaises(OSError):
            recovery.hash_file(self.source / "link")

    def test_backup_holds_on_empty_sessions_low_disk_or_changed_files(self):
        (self.source / "fixture-session").unlink()
        with self.assertRaisesRegex(recovery.Hold, "empty"):
            recovery.backup_sessions(self.source, self.root / "backups")
        (self.source / "fixture-session").write_text("again")
        with patch.object(recovery.shutil, "disk_usage", return_value=SimpleNamespace(free=0)):
            with self.assertRaisesRegex(recovery.Hold, "disk_space"):
                recovery.backup_sessions(self.source, self.root / "backups")
        original = recovery.hash_file
        def changed(path):
            return "changed" if path.parent == self.source else original(path)
        with patch.object(recovery, "hash_file", side_effect=changed):
            with self.assertRaisesRegex(recovery.Hold, "changed_during_backup"):
                recovery.backup_sessions(self.source, self.root / "backups")

    def test_existing_tokens_are_private_and_wrong_tunnel_does_not_get_reused(self):
        self.config.mkdir(); self.keyfile.write_text(token()); self.keyfile.chmod(0o600)
        self.assertEqual(recovery.find_token(lambda _: self.fail("Existing credential should be reused")), token())
        self.keyfile.chmod(0o644)
        prompts = []
        self.assertEqual(recovery.find_token(lambda label: prompts.append(label) or token()), token())
        self.assertEqual(len(prompts), 1)
        self.keyfile.chmod(0o600); self.keyfile.write_text(token(tunnel="wrong"))
        self.assertEqual(recovery.find_token(lambda _: token()), token())

    def test_pm2_snapshot_is_read_but_no_pm2_process_is_modified(self):
        directory = self.home / ".pm2"; directory.mkdir()
        snapshot = directory / "dump.pm2"
        snapshot.write_text(json.dumps([{"name": "cf-tunnel", "pm2_env": {"args": ["tunnel", "run", "--token", token()]}}]))
        snapshot.chmod(0o600)
        self.assertEqual(recovery.find_token(lambda _: self.fail("Snapshot should be reused")), token())

    def fake_unit_check(self):
        if self.unit.exists() and not self.unit.read_text().startswith(recovery.MARKER):
            raise recovery.Hold("existing_unit_is_not_owned")

    def service_fixture(self, fail=False, previously_active=False, previously_enabled=False):
        calls = []; state = {"active": previously_active, "enabled": previously_enabled}
        def run(args, **kwargs):
            calls.append(args)
            if args[1] == "is-active": return SimpleNamespace(returncode=0 if state["active"] else 3)
            if args[1] == "is-enabled": return SimpleNamespace(returncode=0 if state["enabled"] else 1)
            if args[1] in ("restart", "start"): state["active"] = True
            if args[1] == "stop": state["active"] = False
            if args[1] == "enable": state["enabled"] = True
            if args[1] == "disable":
                self.assertTrue(self.unit.exists(), "Disable before removing its unit file")
                state["enabled"] = False
            return SimpleNamespace(returncode=0)
        def get(*args): return (503 if fail else 200), b""
        return calls, state, run, get

    def test_connector_install_has_no_credential_arguments_and_starts_only_its_own_unit(self):
        calls, state, run, get = self.service_fixture()
        with patch.object(recovery, "check_owned_unit", side_effect=self.fake_unit_check):
            changed = recovery.install_connector("/usr/bin/cloudflared", token(), run=run, get=get, wait=lambda _: None)
        self.assertTrue(changed); self.assertTrue(state["active"])
        self.assertEqual(self.keyfile.read_text(), token() + "\n")
        self.assertEqual(stat.S_IMODE(self.keyfile.stat().st_mode), 0o600)
        self.assertNotIn(token(), self.unit.read_text())
        self.assertIn("--token-file", self.unit.read_text())
        self.assertNotIn(token(), json.dumps(calls))
        self.assertTrue(all(c[:2] == ["systemctl", "daemon-reload"] or c[-1] == recovery.UNIT_NAME for c in calls))
        calls.clear()
        with patch.object(recovery, "check_owned_unit", side_effect=self.fake_unit_check):
            self.assertFalse(recovery.install_connector("/usr/bin/cloudflared", token(), run=run, get=get, wait=lambda _: None))
        self.assertTrue(all(c[1].startswith("is-") for c in calls))

    def test_failed_new_connector_is_disabled_and_removed_with_no_waHA_restart(self):
        calls, state, run, get = self.service_fixture(fail=True)
        with patch.object(recovery, "check_owned_unit", side_effect=self.fake_unit_check):
            with self.assertRaisesRegex(recovery.Hold, "previous_state_restored"):
                recovery.install_connector("/usr/bin/cloudflared", token(), run=run, get=get, wait=lambda _: None)
        self.assertFalse(self.unit.exists()); self.assertFalse(self.keyfile.exists())
        self.assertFalse(state["active"]); self.assertFalse(state["enabled"])
        self.assertNotIn("docker", json.dumps(calls)); self.assertNotIn("pm2", json.dumps(calls))

    def test_failed_reconfiguration_restores_previous_private_files_and_service_state(self):
        self.config.mkdir(); self.keyfile.write_text("old synthetic credential\n"); self.keyfile.chmod(0o600)
        old = recovery.MARKER + "old fixture unit\n"; self.unit.write_text(old)
        calls, state, run, get = self.service_fixture(fail=True, previously_active=True, previously_enabled=True)
        with patch.object(recovery, "check_owned_unit", side_effect=self.fake_unit_check):
            with self.assertRaisesRegex(recovery.Hold, "previous_state_restored"):
                recovery.install_connector("/usr/bin/cloudflared", token(), run=run, get=get, wait=lambda _: None)
        self.assertEqual(self.unit.read_text(), old)
        self.assertEqual(self.keyfile.read_text(), "old synthetic credential\n")
        self.assertTrue(state["active"]); self.assertTrue(state["enabled"])

    def test_destination_symlinks_and_unowned_units_are_rejected(self):
        self.unit.symlink_to(self.source / "fixture-session")
        with self.assertRaisesRegex(recovery.Hold, "not_owned"):
            recovery.check_owned_unit(self.unit)
        self.unit.unlink(); self.unit.write_text("Existing unrelated unit")
        with self.assertRaisesRegex(recovery.Hold, "not_owned"):
            recovery.check_owned_unit(self.unit)
        with self.assertRaises(recovery.Hold):
            recovery.unit_text("/tmp/binary\nExecStart=unwanted")
        target = self.root / "link"; target.symlink_to(self.source / "fixture-session")
        with self.assertRaisesRegex(recovery.Hold, "unsafe_destination"):
            recovery.atomic_write(target, "never written", 0o600)

    def test_apply_orders_verified_backup_before_connector_and_never_exposes_error_output(self):
        events = []
        def run(args, **kwargs):
            if args[:2] == ["docker", "inspect"]: return SimpleNamespace(stdout=json.dumps(self.data), returncode=0)
            return SimpleNamespace(stdout="cloudflared version 2026.10.0", returncode=0)
        def get(*args): return 200, b'[{"name":"default","status":"WORKING"}]'
        with patch.object(recovery.os, "geteuid", return_value=0), \
             patch.object(recovery.shutil, "which", return_value="/usr/bin/true"), \
             patch.object(recovery, "find_token", return_value=token()), \
             patch.object(recovery, "backup_sessions", side_effect=lambda *_: events.append("backup")), \
             patch.object(recovery, "install_connector", side_effect=lambda *a, **k: events.append("connector") or True):
            result = recovery.recover(True, run=run, get=get)
        self.assertEqual(events, ["backup", "connector"])
        self.assertEqual(result["messages_sent"], 0)
        self.assertNotIn("synthetic-local-key", json.dumps(result))
        output = io.StringIO()
        with patch.object(sys := recovery.sys, "argv", [str(SCRIPT)]), \
             patch.object(recovery, "recover", side_effect=OSError("synthetic-private-provider-text")), redirect_stdout(output):
            self.assertEqual(recovery.main(), 2)
        self.assertNotIn("synthetic-private-provider-text", output.getvalue())

    def test_preflight_failure_never_backs_up_or_changes_a_connector(self):
        with patch.object(recovery.os, "geteuid", return_value=0), \
             patch.object(recovery.shutil, "which", return_value="/usr/bin/true"), \
             patch.object(recovery, "backup_sessions") as backup, \
             patch.object(recovery, "install_connector") as install:
            with self.assertRaisesRegex(recovery.Hold, "authentication_failed"):
                recovery.recover(True, run=lambda *a, **k: SimpleNamespace(stdout=json.dumps(self.data)), get=lambda *a: (401, b""))
            backup.assert_not_called()
            install.assert_not_called()

if __name__ == "__main__":
    unittest.main()

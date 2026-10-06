"""Calendar worker/publication tests using mocks and temporary local Git only."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from server.availability_engine import generate_availability
from server.calendar_bridge import CalendarBridgeError
from server.calendar_sync import (
    CalendarSync, GitPublisher, SyncConfig, SyncError, atomic_write,
    needs_update, public_snapshot, worker_lock,
)


NOW = datetime.fromisoformat("2026-10-05T08:00:00+00:00")
UTC = timezone.utc


def snapshot(now=NOW, config=None, intervals=None):
    configuration = config or SyncConfig.from_dict({})
    return generate_availability(intervals or [], configuration.availability, now)


class FakeBridge:
    def __init__(self, intervals=None, error=None):
        self.intervals = intervals if intervals is not None else []
        self.error = error
        self.calls = []

    def busy_intervals(self, start, end, **selection):
        self.calls.append((start, end, selection))
        if self.error:
            raise self.error
        return deepcopy(self.intervals)


class CalendarSyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="calendar-worker-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.config = SyncConfig.from_dict({})

    def test_config_defaults_and_heartbeat_budget(self):
        self.assertEqual(self.config.poll_seconds, 60)
        self.assertEqual(self.config.refresh_minutes, 60)
        self.assertEqual(self.config.availability.validity_hours, 2)
        self.assertEqual(self.config.availability.buffer_before_minutes, 30)
        self.assertEqual(self.config.availability.buffer_after_minutes, 30)
        self.assertEqual(self.config.source_names, ("iCloud",))
        with self.assertRaises(ValueError):
            SyncConfig.from_dict({"availability": {"validityHours": 1}, "refreshMinutes": 59})
        self.assertEqual(SyncConfig.from_dict({"availability": {"validityHours": 1}, "refreshMinutes": 58}).refresh_minutes, 58)

    def test_config_rejects_unknown_or_browser_incompatible_settings(self):
        invalid = (
            {"unexpected": "secret"}, {"calendar": {"calendarTitle": "Private"}},
            {"calendar": {"sourceNames": [], "sourceIds": []}},
            {"calendar": {"sourceNames": "iCloud"}}, {"calendar": {"sourceIds": [""]}},
            {"git": {"password": "secret"}}, {"git": {"branch": "--force"}},
            {"git": {"branch": "main..other"}}, {"git": {"branch": "main.lock"}},
            {"git": {"remote": "https://example.com"}}, {"git": {"authorName": "Nils\nOther"}},
            {"pollSeconds": True}, {"pollSeconds": 1}, {"pollSeconds": 3601},
            {"refreshMinutes": 0}, {"availability": {"timeZone": "UTC"}},
            {"availability": {"durationMinutes": 30}}, {"availability": {"stepMinutes": 5}},
            {"availability": {"weeks": 5}}, {"availability": {"validityHours": 49}},
        )
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                SyncConfig.from_dict(value)

    def test_config_bounds_buffers_and_notice_before_calendar_query(self):
        maximums = {
            "bufferBeforeMinutes": 7 * 24 * 60,
            "bufferAfterMinutes": 7 * 24 * 60,
            "minNoticeMinutes": 28 * 24 * 60,
        }
        attributes = {
            "bufferBeforeMinutes": "buffer_before_minutes",
            "bufferAfterMinutes": "buffer_after_minutes",
            "minNoticeMinutes": "min_notice_minutes",
        }
        for key, maximum in maximums.items():
            with self.subTest(setting=key, boundary=maximum):
                config = SyncConfig.from_dict({"availability": {key: maximum}})
                self.assertEqual(getattr(config.availability, attributes[key]), maximum)
            for excessive in (maximum + 1, 10 ** 100):
                with self.subTest(setting=key, excessive=excessive), self.assertRaises(ValueError):
                    SyncConfig.from_dict({"availability": {key: excessive}})

    def test_public_schema_whitelists_private_fields_and_sorts_slots(self):
        candidate = snapshot()
        candidate["eventTitles"] = ["Private meeting"]
        candidate["slots"].reverse()
        candidate["slots"][0]["privateSource"] = "Hidden calendar"
        sanitized = public_snapshot(candidate)
        self.assertNotIn("Private meeting", json.dumps(sanitized))
        self.assertNotIn("Hidden calendar", json.dumps(sanitized))
        self.assertEqual(sanitized["slots"], snapshot()["slots"])
        self.assertTrue(all(set(slot) == {"date", "time"} for slot in sanitized["slots"]))

    def test_public_schema_rejects_bad_constants_windows_dates_and_duplicates(self):
        mutations = (
            {"schemaVersion": True}, {"durationMinutes": 45.0}, {"stepMinutes": 15.0},
            {"status": "unconfigured"}, {"isDemo": True}, {"timeZone": "UTC"},
            {"generatedAt": "2026-10-05T08:00:00+00:00"},
            {"validUntil": "2026-10-05T08:00:00Z"},
            {"validUntil": "2026-10-08T08:00:01Z"},
            {"windowEnd": "2026-12-01"}, {"windowStart": "2026-02-30"},
            {"slots": [{"date": "2026-10-05", "time": "15:31"}]},
            {"slots": [{"date": "2026-11-02", "time": "15:30"}]},
            {"slots": [{"date": "2026-10-05", "time": "15:30"}] * 2},
            {"slots": "not a list"},
        )
        for change in mutations:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                public_snapshot({**snapshot(), **change})

    def test_query_bounds_include_boundary_buffers_and_cross_dst_in_utc(self):
        config = SyncConfig.from_dict({
            "calendar": {"sourceNames": ["iCloud", "iCloud"], "sourceIds": ["source-id"]},
            "availability": {"bufferBeforeMinutes": 40, "bufferAfterMinutes": 20},
        })
        bridge = FakeBridge()
        worker = CalendarSync(self.root, config, bridge=bridge)
        worker.run_once(datetime.fromisoformat("2026-10-19T08:00:00+00:00"))
        start, end, selection = bridge.calls[0]
        self.assertEqual(start, datetime.fromisoformat("2026-10-18T21:40:00+00:00"))
        self.assertEqual(end, datetime.fromisoformat("2026-11-15T23:40:00+00:00"))
        self.assertEqual(start.tzinfo, UTC)
        self.assertEqual(end.tzinfo, UTC)
        self.assertEqual(selection, {"source_ids": ("source-id",), "source_names": ("iCloud",)})

    def test_same_schedule_keeps_file_until_heartbeat_then_renews_it(self):
        worker = CalendarSync(self.root, self.config, bridge=FakeBridge())
        first = worker.run_once(NOW)
        path = self.root / "availability.json"
        original = path.read_bytes()
        self.assertTrue(first["updated"])
        self.assertFalse(worker.run_once(NOW + timedelta(seconds=60))["updated"])
        self.assertEqual(path.read_bytes(), original)
        self.assertTrue(worker.run_once(NOW + timedelta(minutes=60))["updated"])
        refreshed = json.loads(path.read_text())
        self.assertEqual(refreshed["generatedAt"], "2026-10-05T09:00:00Z")
        self.assertEqual(refreshed["validUntil"], "2026-10-05T11:00:00Z")
        self.assertEqual(refreshed["slots"], json.loads(original)["slots"])

    def test_calendar_changes_update_file_before_heartbeat(self):
        bridge = FakeBridge()
        worker = CalendarSync(self.root, self.config, bridge=bridge)
        worker.run_once(NOW)
        bridge.intervals = [{"start": "2026-10-05T15:30:00+02:00", "end": "2026-10-05T15:45:00+02:00"}]
        self.assertTrue(worker.run_once(NOW + timedelta(seconds=60))["updated"])
        result = json.loads((self.root / "availability.json").read_text())
        self.assertNotIn({"date": "2026-10-05", "time": "15:30"}, result["slots"])
        self.assertIn({"date": "2026-10-05", "time": "16:15"}, result["slots"])

    def test_calendar_failure_or_malformed_data_preserves_verified_snapshot(self):
        path = self.root / "availability.json"
        atomic_write(path, snapshot())
        original = path.read_bytes()
        failures = (
            FakeBridge(error=CalendarBridgeError("Calendar access denied")),
            FakeBridge(intervals=[{"start": "2026-10-05T15:30:00", "end": "2026-10-05T16:00:00"}]),
            FakeBridge(intervals=[{}]),
        )
        for bridge in failures:
            with self.subTest(bridge=bridge), self.assertRaises((CalendarBridgeError, SyncError)):
                CalendarSync(self.root, self.config, bridge=bridge).run_once(NOW + timedelta(minutes=65))
            self.assertEqual(path.read_bytes(), original)

    def test_failed_atomic_replace_retains_previous_snapshot_and_cleans_temporary_file(self):
        path = self.root / "availability.json"
        atomic_write(path, snapshot())
        original = path.read_bytes()
        with patch("server.calendar_sync.os.replace", side_effect=OSError("blocked")), self.assertRaises(OSError):
            atomic_write(path, snapshot(NOW + timedelta(minutes=60)))
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(list(self.root.glob(".availability-*")), [])

    def test_naive_clock_is_rejected_before_calendar_read(self):
        bridge = FakeBridge()
        with self.assertRaises(ValueError):
            CalendarSync(self.root, self.config, bridge=bridge).run_once(datetime(2026, 10, 5, 8))
        self.assertEqual(bridge.calls, [])

    def test_near_expiry_renews_even_if_normal_heartbeat_is_not_due(self):
        current = snapshot()
        current["validUntil"] = "2026-10-05T08:10:00Z"
        now = NOW + timedelta(minutes=9)
        self.assertTrue(needs_update(current, snapshot(now), now, 60, 60))

    def test_worker_lock_prevents_parallel_writers(self):
        with worker_lock(self.root):
            with self.assertRaises(SyncError):
                with worker_lock(self.root):
                    self.fail("second worker acquired the lock")
        with worker_lock(self.root):
            pass


class GitPublisherTests(unittest.TestCase):
    """All commits/pushes below stay inside this test's temporary directory."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="calendar-publisher-test-")
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.remote = self.folder / "remote.git"
        self.root = self.folder / "website"
        self.root.mkdir()
        self.config = SyncConfig.from_dict({})
        self.git(self.folder, "init", "--bare", "--initial-branch=main", str(self.remote))
        self.git(self.root, "init", "--initial-branch=main")
        self.git(self.root, "config", "user.name", "Local Test")
        self.git(self.root, "config", "user.email", "local-test@example.invalid")
        (self.root / "booking.html").write_text("booking baseline\n")
        (self.root / "availability.js").write_text("availability reader baseline\n")
        (self.root / "unrelated.txt").write_text("original\n")
        (self.root / ".gitignore").write_text(".calendar-sync/\n")
        self.git(self.root, "add", ".")
        self.git(self.root, "commit", "-m", "Initial local website")
        self.git(self.root, "remote", "add", "origin", str(self.remote))
        self.git(self.root, "push", "origin", "main")
        self.initial_head = self.remote_git("rev-parse", "main")

    @staticmethod
    def git(cwd, *arguments):
        env = os.environ.copy()
        for name in (
            "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL",
            "GIT_AUTHOR_DATE", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_COMMITTER_DATE",
        ):
            env.pop(name, None)
        result = subprocess.run(
            ["git", "-C", str(cwd), "-c", "commit.gpgSign=false", *arguments],
            env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=15,
        )
        return result.stdout.strip()

    def remote_git(self, *arguments):
        return self.git(self.folder, "--git-dir", str(self.remote), *arguments)

    def test_separate_push_destination_uses_its_latest_head_and_leaves_fetch_remote_untouched(self):
        push_remote = self.folder / "push-target.git"
        self.git(self.folder, "clone", "--bare", str(self.remote), str(push_remote))
        peer = self.folder / "push-peer"
        self.git(self.folder, "clone", str(push_remote), str(peer))
        self.git(peer, "config", "user.name", "Push Destination Test")
        self.git(peer, "config", "user.email", "push-test@example.invalid")
        (peer / "booking.html").write_text("Latest version exists only on the push destination\n")
        self.git(peer, "add", "booking.html")
        self.git(peer, "commit", "-m", "Independent change on publishing destination")
        self.git(peer, "push", "origin", "main")
        push_head = self.git(self.folder, "--git-dir", str(push_remote), "rev-parse", "main")
        self.assertNotEqual(push_head, self.initial_head)
        self.git(self.root, "remote", "set-url", "--push", "origin", str(push_remote))

        publisher = GitPublisher(self.root, self.config)
        self.assertTrue(publisher.publish(snapshot(), NOW))

        self.assertEqual(self.git(self.folder, "--git-dir", str(push_remote), "rev-parse", "main^"), push_head)
        self.assertEqual(
            self.git(self.folder, "--git-dir", str(push_remote), "diff", "--name-only", push_head, "main"),
            "availability.json",
        )
        self.assertEqual(
            self.git(self.folder, "--git-dir", str(push_remote), "show", "main:booking.html"),
            "Latest version exists only on the push destination",
        )
        self.assertEqual(
            json.loads(self.git(self.folder, "--git-dir", str(push_remote), "show", "main:availability.json")),
            snapshot(),
        )
        self.assertEqual(self.remote_git("rev-parse", "main"), self.initial_head)
        self.assertNotIn("availability.json", self.remote_git("ls-tree", "--name-only", "main"))
        self.assertEqual(self.git(self.root, "rev-parse", "HEAD"), self.initial_head)
        self.assertEqual(self.git(self.root, "remote", "get-url", "origin"), str(self.remote))

    def test_local_auth_settings_are_inherited_privately_through_git_environment(self):
        settings = [
            ("credential.helper", ""),
            ("credential.helper", "!printf synthetic-calendar-helper"),
            ("credential.https://github.com.username", "synthetic-work-account"),
            ("credential.usehttppath", "true"),
            ("core.sshcommand", "ssh -i /tmp/synthetic-calendar-key"),
            ("http.https://github.com.extraheader", "Authorization: bearer synthetic-calendar-auth"),
        ]
        for key, value in settings:
            self.git(self.root, "config", "--add", key, value)
        publisher = GitPublisher(self.root, self.config)
        invocations = []
        original_run = subprocess.run

        def observe(arguments, **keywords):
            if arguments[:2] == ["git", "--git-dir"]:
                invocations.append((list(arguments), dict(keywords["env"])))
            return original_run(arguments, **keywords)

        inherited = {
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "credential.username",
            "GIT_CONFIG_VALUE_0": "inherited-calendar-account",
        }
        with patch.dict(os.environ, inherited), patch("server.calendar_sync.subprocess.run", side_effect=observe):
            self.assertTrue(publisher.publish(snapshot(), NOW))
            self.assertEqual(
                publisher._run(["config", "--get-all", "credential.helper"]).stdout.splitlines()[-2:],
                ["", "!printf synthetic-calendar-helper"],
            )
            self.assertEqual(
                publisher._run(["config", "--get", "core.sshcommand"]).stdout.strip(),
                "ssh -i /tmp/synthetic-calendar-key",
            )
            self.assertEqual(
                publisher._run(["config", "--get", "http.https://github.com.extraheader"]).stdout.strip(),
                "Authorization: bearer synthetic-calendar-auth",
            )

        self.assertTrue(invocations)
        for arguments, environment in invocations:
            inherited_settings = [
                (environment[f"GIT_CONFIG_KEY_{index}"], environment[f"GIT_CONFIG_VALUE_{index}"])
                for index in range(int(environment["GIT_CONFIG_COUNT"]))
            ]
            self.assertEqual(inherited_settings[0], ("credential.username", "inherited-calendar-account"))
            self.assertCountEqual(inherited_settings[1:], settings)
            for _, value in settings:
                if value:
                    self.assertNotIn(value, arguments)

        bare_config = (publisher.repository / "config").read_text()
        public_content = self.remote_git("show", "main:availability.json") + self.remote_git("cat-file", "-p", "main")
        for marker in ("synthetic-calendar-helper", "synthetic-work-account", "synthetic-calendar-key", "synthetic-calendar-auth"):
            self.assertNotIn(marker, bare_config)
            self.assertNotIn(marker, public_content)
        self.assertNotIn("[credential", bare_config)
        self.assertNotIn("[http", bare_config)
        self.assertNotIn("sshcommand", bare_config.lower())
        self.assertEqual(self.remote_git("diff", "--name-only", self.initial_head, "main"), "availability.json")

    def test_only_availability_is_published_and_source_checkout_edits_are_untouched(self):
        unrelated = self.root / "unrelated.txt"
        unrelated.write_text("staged change\n")
        self.git(self.root, "add", "unrelated.txt")
        unrelated.write_text("staged change\nunstaged change\n")
        (self.root / "new-local.txt").write_text("untracked personal draft\n")
        before_status = self.git(self.root, "status", "--porcelain=v1")
        before_index = self.git(self.root, "ls-files", "--stage")
        before_staged = self.git(self.root, "diff", "--cached", "--binary")
        before_unstaged = self.git(self.root, "diff", "--binary")
        publisher = GitPublisher(self.root, self.config)
        self.assertTrue(publisher.publish(snapshot(), NOW))
        remote_head = self.remote_git("rev-parse", "main")
        changed = self.remote_git("diff", "--name-only", self.initial_head, remote_head)
        self.assertEqual(changed, "availability.json")
        published = json.loads(self.remote_git("show", "main:availability.json"))
        self.assertEqual(published, snapshot())
        self.assertEqual(self.git(self.root, "rev-parse", "HEAD"), self.initial_head)
        self.assertEqual(self.git(self.root, "status", "--porcelain=v1"), before_status)
        self.assertEqual(self.git(self.root, "ls-files", "--stage"), before_index)
        self.assertEqual(self.git(self.root, "diff", "--cached", "--binary"), before_staged)
        self.assertEqual(self.git(self.root, "diff", "--binary"), before_unstaged)
        self.assertEqual((self.root / "new-local.txt").read_text(), "untracked personal draft\n")
        self.assertFalse((self.root / "availability.json").exists())

    def test_unchanged_schedule_does_not_create_a_commit_even_after_restart(self):
        publisher = GitPublisher(self.root, self.config)
        self.assertTrue(publisher.publish(snapshot(), NOW))
        published_head = self.remote_git("rev-parse", "main")
        next_time = NOW + timedelta(seconds=60)
        self.assertFalse(publisher.publish(snapshot(next_time), next_time))
        self.assertEqual(self.remote_git("rev-parse", "main"), published_head)
        restarted = GitPublisher(self.root, self.config)
        self.assertFalse(restarted.publish(snapshot(next_time), next_time))
        self.assertEqual(self.remote_git("rev-parse", "main"), published_head)

    def test_heartbeat_renews_remote_freshness_without_changing_slots(self):
        publisher = GitPublisher(self.root, self.config)
        publisher.publish(snapshot(), NOW)
        first_head = self.remote_git("rev-parse", "main")
        next_time = NOW + timedelta(minutes=60)
        self.assertTrue(publisher.publish(snapshot(next_time), next_time))
        new_head = self.remote_git("rev-parse", "main")
        self.assertNotEqual(new_head, first_head)
        self.assertEqual(self.remote_git("diff", "--name-only", first_head, new_head), "availability.json")
        published = json.loads(self.remote_git("show", "main:availability.json"))
        self.assertEqual(published["generatedAt"], "2026-10-05T09:00:00Z")
        self.assertEqual(published["slots"], snapshot()["slots"])

    def test_concurrent_remote_commit_rejects_first_push_then_preserves_peer_changes(self):
        peer = self.folder / "peer"
        self.git(self.folder, "clone", str(self.remote), str(peer))
        self.git(peer, "config", "user.name", "Other Local Test")
        self.git(peer, "config", "user.email", "peer@example.invalid")
        publisher = GitPublisher(self.root, self.config)
        original_run = publisher._run
        raced = []
        push_results = []

        def inject_race(arguments, **keywords):
            if arguments and arguments[0] == "push":
                if not raced:
                    (peer / "booking.html").write_text("Updated independently by another editor\n")
                    self.git(peer, "add", "booking.html")
                    self.git(peer, "commit", "-m", "Independent website change")
                    self.git(peer, "push", "origin", "main")
                    raced.append(self.remote_git("rev-parse", "main"))
                result = original_run(arguments, **keywords)
                push_results.append(result.returncode)
                return result
            return original_run(arguments, **keywords)

        with patch.object(publisher, "_run", side_effect=inject_race):
            self.assertTrue(publisher.publish(snapshot(), NOW))
        self.assertNotEqual(push_results[0], 0)
        self.assertEqual(push_results[-1], 0)
        self.assertEqual(len(push_results), 2)
        self.assertEqual(self.remote_git("show", "main:booking.html"), "Updated independently by another editor")
        self.assertEqual(self.remote_git("rev-parse", "main^"), raced[0])
        self.assertEqual(self.remote_git("diff", "--name-only", raced[0], "main"), "availability.json")

    def test_branch_without_website_refuses_publication(self):
        self.git(self.root, "rm", "booking.html")
        self.git(self.root, "commit", "-m", "Remove draft website for refusal test")
        self.git(self.root, "push", "origin", "main")
        head = self.remote_git("rev-parse", "main")
        with self.assertRaisesRegex(SyncError, "does not contain the website"):
            GitPublisher(self.root, self.config).publish(snapshot(), NOW)
        self.assertEqual(self.remote_git("rev-parse", "main"), head)

    def test_nonexistent_branch_refuses_to_create_it(self):
        config = SyncConfig.from_dict({"git": {"branch": "missing-site-branch"}})
        with self.assertRaises(SyncError):
            GitPublisher(self.root, config).publish(snapshot(config=config), NOW)
        self.assertEqual(self.remote_git("for-each-ref", "--format=%(refname)", "refs/heads"), "refs/heads/main")

    def test_expired_and_future_snapshots_never_reach_push(self):
        publisher = GitPublisher(self.root, self.config)
        candidates = (
            snapshot(NOW - timedelta(hours=3)),
            snapshot(NOW + timedelta(minutes=6)),
        )
        for candidate in candidates:
            with self.subTest(generated=candidate["generatedAt"]), self.assertRaisesRegex(SyncError, "expired or future"):
                publisher.publish(candidate, NOW)
            self.assertFalse(publisher.initialized)
            self.assertEqual(self.remote_git("rev-parse", "main"), self.initial_head)

    def test_repeated_push_failure_retains_last_remote_snapshot(self):
        publisher = GitPublisher(self.root, self.config)
        publisher.publish(snapshot(), NOW)
        head = self.remote_git("rev-parse", "main")
        old_file = self.remote_git("show", "main:availability.json")
        original_run = publisher._run

        def reject_push(arguments, **keywords):
            if arguments and arguments[0] == "push":
                return subprocess.CompletedProcess(arguments, 1, "", "simulated local rejection")
            return original_run(arguments, **keywords)

        later = NOW + timedelta(minutes=60)
        with patch.object(publisher, "_run", side_effect=reject_push), self.assertRaises(SyncError):
            publisher.publish(snapshot(later), later)
        self.assertEqual(self.remote_git("rev-parse", "main"), head)
        self.assertEqual(self.remote_git("show", "main:availability.json"), old_file)
        self.assertEqual(publisher.last_published, snapshot())


if __name__ == "__main__":
    unittest.main()

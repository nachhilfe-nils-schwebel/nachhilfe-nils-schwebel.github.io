#!/usr/bin/env python3
"""Read iCloud busy intervals, publish one availability file, and repeat locally.

No HTTP server or calendar credentials are needed: EventKit reads the Mac's
synced Calendar database; GitHub Pages continues to serve the static website.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
import fcntl
import json
import logging
import os
from pathlib import Path
import plistlib
import re
import signal
import subprocess
import sys
import tempfile
import threading
from zoneinfo import ZoneInfo

if __package__:
    from .availability_engine import AvailabilitySettings, generate_availability
    from .calendar_bridge import CalendarBridge, CalendarBridgeError
else:
    from availability_engine import AvailabilitySettings, generate_availability
    from calendar_bridge import CalendarBridge, CalendarBridgeError


UTC = timezone.utc
ROOT = Path(__file__).resolve().parent.parent
LABEL = "local.nils.tutoring.calendar-sync"
PUBLIC_KEYS = (
    "schemaVersion", "status", "isDemo", "timeZone", "durationMinutes",
    "stepMinutes", "generatedAt", "validUntil", "windowStart", "windowEnd", "slots",
)
LOG = logging.getLogger("calendar-sync")


class SyncError(RuntimeError):
    """An actionable error containing no calendar data or credentials."""


def _integer(value, label, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{label} must be an integer from {minimum} to {maximum}.")
    return value


def _strings(value, label, allow_empty=True):
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError(f"{label} must be a list of nonempty strings.")
    if not allow_empty and not value:
        raise ValueError(f"{label} must contain at least one value.")
    return tuple(dict.fromkeys(value))


def _object(value, allowed, label):
    if not isinstance(value, dict) or set(value).difference(allowed):
        raise ValueError(f"{label} contains an unknown setting or is not an object.")
    return value


@dataclass(frozen=True)
class SyncConfig:
    availability: AvailabilitySettings = field(default_factory=lambda: AvailabilitySettings(validity_hours=2))
    poll_seconds: int = 60
    refresh_minutes: int = 60
    source_names: tuple[str, ...] = ("iCloud",)
    source_ids: tuple[str, ...] = ()
    branch: str = "main"
    remote: str = "origin"
    # Authentication comes from the checkout's private Git configuration.
    # Public commit attribution uses a generic identity unless configured locally.
    author_name: str = "Calendar availability updater"
    author_email: str = "calendar-updater@example.invalid"
    calendar_names: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, raw):
        raw = _object(raw, {"availability", "pollSeconds", "refreshMinutes", "calendar", "git"}, "Configuration")
        availability = {"validityHours": 2, **raw.get("availability", {})} if isinstance(raw.get("availability", {}), dict) else raw["availability"]
        settings = AvailabilitySettings.from_dict(availability)
        # Keep the writer compatible with the static website's public schema.
        if settings.time_zone != "Europe/Berlin" or settings.duration_minutes != 45 or settings.step_minutes != 15:
            raise ValueError("The website requires Europe/Berlin, 45-minute trials, and a 15-minute grid.")
        if settings.weeks > 4 or settings.validity_hours > 48:
            raise ValueError("Use at most four weeks and 48 hours of validity.")
        _integer(settings.buffer_before_minutes, "bufferBeforeMinutes", 0, 7 * 24 * 60)
        _integer(settings.buffer_after_minutes, "bufferAfterMinutes", 0, 7 * 24 * 60)
        _integer(settings.min_notice_minutes, "minNoticeMinutes", 0, 28 * 24 * 60)
        poll = _integer(raw.get("pollSeconds", 60), "pollSeconds", 15, 3600)
        refresh = _integer(raw.get("refreshMinutes", 60), "refreshMinutes", 1, 24 * 60)
        if refresh * 60 + poll >= settings.validity_hours * 3600:
            raise ValueError("refreshMinutes plus one poll must be shorter than validityHours.")
        calendar = _object(raw.get("calendar", {}), {"sourceNames", "sourceIds", "calendarNames"}, "Calendar configuration")
        names = _strings(calendar.get("sourceNames", ["iCloud"]), "sourceNames")
        ids = _strings(calendar.get("sourceIds", []), "sourceIds")
        calendar_names = _strings(calendar.get("calendarNames", []), "calendarNames")
        if not names and not ids:
            raise ValueError("Select an iCloud source by name or source identifier.")
        git = _object(raw.get("git", {}), {"branch", "remote", "authorName", "authorEmail"}, "Git configuration")
        branch, remote = git.get("branch", "main"), git.get("remote", "origin")
        if not isinstance(branch, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", branch) or any(
            marker in branch for marker in ("..", "//", "@{", "/.")
        ) or branch.endswith(("/", ".", ".lock")):
            raise ValueError("git.branch must be a valid branch name.")
        if not isinstance(remote, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", remote):
            raise ValueError("git.remote must be a remote name, such as origin.")
        author_name = git.get("authorName", cls.author_name)
        author_email = git.get("authorEmail", cls.author_email)
        for value in (author_name, author_email):
            if not isinstance(value, str) or not value.strip() or any(char in value for char in "\r\n<>"):
                raise ValueError("Git author name and email must be nonempty single-line values.")
        return cls(settings, poll, refresh, names, ids, branch, remote, author_name, author_email, calendar_names)


def load_config(path: Path | None):
    if path is None:
        local = ROOT / "server" / "calendar-config.local.json"
        path = local if local.exists() else ROOT / "server" / "calendar-config.example.json"
    try:
        config = SyncConfig.from_dict(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise SyncError("Cannot read the calendar configuration. Use the example JSON as a starting point.") from None
    return config, path.resolve()


def _instant(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise ValueError("Invalid public timestamp.")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def public_snapshot(raw):
    """Whitelist public fields; reject malformed data instead of inferring slots."""
    if not isinstance(raw, dict) or any(key not in raw for key in PUBLIC_KEYS):
        raise ValueError("Incomplete availability data.")
    if any(type(raw[key]) is not int for key in ("schemaVersion", "durationMinutes", "stepMinutes")) or \
            raw["schemaVersion"] != 1 or raw["status"] != "ready" or raw["isDemo"] is not False or \
            raw["timeZone"] != "Europe/Berlin" or raw["durationMinutes"] != 45 or raw["stepMinutes"] != 15:
        raise ValueError("Incompatible availability data.")
    start, end = date.fromisoformat(raw["windowStart"]), date.fromisoformat(raw["windowEnd"])
    if start.isoformat() != raw["windowStart"] or end.isoformat() != raw["windowEnd"] or not 0 < (end - start).days <= 28:
        raise ValueError("Invalid availability window.")
    generated, valid_until = _instant(raw["generatedAt"]), _instant(raw["validUntil"])
    if not timedelta(0) < valid_until - generated <= timedelta(hours=48):
        raise ValueError("Invalid availability freshness.")
    if not isinstance(raw["slots"], list) or len(raw["slots"]) > 1000:
        raise ValueError("Invalid availability slots.")
    slots, seen = [], set()
    for slot in raw["slots"]:
        if not isinstance(slot, dict) or not isinstance(slot.get("date"), str) or not isinstance(slot.get("time"), str):
            raise ValueError("Invalid availability slot.")
        day = date.fromisoformat(slot["date"])
        if day.isoformat() != slot["date"] or not start <= day < end or \
                not re.fullmatch(r"(?:[01]\d|2[0-3]):(?:00|15|30|45)", slot["time"]):
            raise ValueError("Invalid availability slot.")
        key = (slot["date"], slot["time"])
        if key in seen:
            raise ValueError("Duplicate availability slot.")
        seen.add(key)
        slots.append({"date": key[0], "time": key[1]})
    result = {key: raw[key] for key in PUBLIC_KEYS if key != "slots"}
    result["slots"] = sorted(slots, key=lambda slot: (slot["date"], slot["time"]))
    return result


def _read_snapshot(path):
    try:
        return public_snapshot(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, UnicodeError, ValueError, TypeError):
        return None


def needs_update(current, candidate, now, refresh_minutes, poll_seconds=60):
    if current is None:
        return True
    semantic = lambda snapshot: {key: value for key, value in snapshot.items() if key not in ("generatedAt", "validUntil")}
    if semantic(current) != semantic(candidate):
        return True
    generated = _instant(current["generatedAt"])
    return generated > now + timedelta(minutes=5) or now - generated >= timedelta(minutes=refresh_minutes) or \
        _instant(current["validUntil"]) <= now + timedelta(seconds=poll_seconds)


def atomic_write(path, snapshot):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(public_snapshot(snapshot), ensure_ascii=False, indent=2) + "\n"
    descriptor, temporary = tempfile.mkstemp(prefix=".availability-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def private_directory(root):
    directory = root / ".calendar-sync"
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o700)
    return directory


@contextmanager
def worker_lock(root):
    path = private_directory(root) / "worker.lock"
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SyncError("An updater is already running in this website folder.") from None
        yield
    finally:
        os.close(descriptor)


class GitPublisher:
    """Create a normal fast-forward commit containing availability.json only.

    A private bare repository and temporary index preserve the website checkout,
    including unrelated staged edits. Remote changes are fetched before each try.
    """

    def __init__(self, root, config):
        self.root, self.config = Path(root).resolve(), config
        self.directory = private_directory(self.root)
        self.repository = self.directory / "publisher.git"
        self.last_published = None
        self.initialized = False
        self.auth_settings = []

    def _run(self, arguments, *, payload=None, check=True, env_extra=None, source=False):
        env = os.environ.copy()
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"):
            env.pop(key, None)
        env["GIT_TERMINAL_PROMPT"] = "0"
        env["GCM_INTERACTIVE"] = "never"
        if not source and self.auth_settings:
            # Carry repo-local work-account authentication without placing it in
            # public files or exposing credential-bearing values in Git's argv.
            count = int(env.get("GIT_CONFIG_COUNT", "0"))
            for key, value in self.auth_settings:
                env[f"GIT_CONFIG_KEY_{count}"] = key
                env[f"GIT_CONFIG_VALUE_{count}"] = value
                count += 1
            env["GIT_CONFIG_COUNT"] = str(count)
        env.update(env_extra or {})
        command = ["git", "-C", str(self.root)] if source else ["git", "--git-dir", str(self.repository)]
        try:
            result = subprocess.run(command + arguments, input=payload, text=True, encoding="utf-8",
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=90)
        except (OSError, subprocess.TimeoutExpired):
            raise SyncError("Git could not complete. Check the network and Git installation; the next poll will retry.") from None
        if check and result.returncode:
            # Git stderr can contain credential-bearing remote URLs. Keep it private.
            raise SyncError("Git publishing failed. Check the branch, network, and GitHub write authentication; the next poll will retry.")
        return result

    def _initialize(self):
        if self.initialized:
            return
        # Read the publication destination, including a separate push URL. Fetch
        # that destination as well, so its latest branch is the commit's parent.
        remote_url = self._run(["remote", "get-url", "--push", self.config.remote], source=True).stdout.strip()
        if not remote_url:
            raise SyncError("The website checkout has no configured Git remote.")
        settings = self._run(["config", "--local", "--null", "--get-regexp", r"^credential\.|^core\.sshcommand$|^http\."], source=True, check=False)
        if settings.returncode not in (0, 1):
            raise SyncError("Could not read the checkout's Git authentication configuration.")
        self.auth_settings = [tuple(entry.split("\n", 1)) for entry in settings.stdout.split("\0") if entry]
        if not self.repository.exists():
            self._run(["init", "--bare", str(self.repository)], source=True)
        configured = self._run(["remote", "get-url", "origin"], check=False)
        action = "set-url" if configured.returncode == 0 else "add"
        self._run(["remote", action, "origin", remote_url])
        self.initialized = True

    def publish(self, snapshot, now):
        snapshot = public_snapshot(snapshot)
        if _instant(snapshot["validUntil"]) <= now or _instant(snapshot["generatedAt"]) > now + timedelta(minutes=5):
            raise SyncError("Refusing to publish expired or future availability.")
        if self.last_published and not needs_update(self.last_published, snapshot, now, self.config.refresh_minutes, self.config.poll_seconds):
            return False
        self._initialize()
        destination = f"refs/heads/{self.config.branch}"
        tracking = "refs/remotes/origin/published"
        for _attempt in range(3):
            # Replace the private tracking ref even after a legitimate remote
            # history rewrite. Only this freshly fetched head becomes a parent;
            # neither the source checkout nor cached old history is republished.
            self._run(["fetch", "--no-tags", "origin", f"+{destination}:{tracking}"])
            base = self._run(["rev-parse", tracking]).stdout.strip()
            for path in ("booking.html", "availability.js"):
                if self._run(["cat-file", "-e", f"{base}:{path}"], check=False).returncode:
                    raise SyncError("The publishing branch does not contain the website yet. Merge the website draft before starting publication.")
            remote_file = self._run(["show", f"{base}:availability.json"], check=False)
            try:
                current = public_snapshot(json.loads(remote_file.stdout)) if remote_file.returncode == 0 else None
            except (ValueError, TypeError):
                current = None
            if current and not needs_update(current, snapshot, now, self.config.refresh_minutes, self.config.poll_seconds):
                self.last_published = current
                return False
            blob = self._run(["hash-object", "-w", "--stdin"], payload=json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").stdout.strip()
            with tempfile.TemporaryDirectory(prefix="publish-", dir=self.directory) as folder:
                index_env = {"GIT_INDEX_FILE": str(Path(folder) / "index")}
                self._run(["read-tree", base], env_extra=index_env)
                self._run(["update-index", "--add", "--cacheinfo", f"100644,{blob},availability.json"], env_extra=index_env)
                tree = self._run(["write-tree"], env_extra=index_env).stdout.strip()
            identity = {
                "GIT_AUTHOR_NAME": self.config.author_name, "GIT_COMMITTER_NAME": self.config.author_name,
                "GIT_AUTHOR_EMAIL": self.config.author_email, "GIT_COMMITTER_EMAIL": self.config.author_email,
                "GIT_AUTHOR_DATE": now.isoformat(), "GIT_COMMITTER_DATE": now.isoformat(),
            }
            commit = self._run(["-c", "commit.gpgSign=false", "commit-tree", tree, "-p", base],
                               payload="Update trial lesson availability\n", env_extra=identity).stdout.strip()
            changed = self._run(["diff-tree", "--no-commit-id", "--name-only", "-r", base, commit]).stdout.splitlines()
            if changed != ["availability.json"]:
                raise SyncError("Refusing to publish changes outside availability.json.")
            pushed = self._run(["push", "origin", f"{commit}:{destination}"], check=False)
            if pushed.returncode == 0:
                self.last_published = snapshot
                return True
            # A normal push rejects concurrent updates. Rebuild from the new head;
            # never force-push or overwrite other website changes.
        raise SyncError("GitHub rejected publication. Check write authentication and branch protection; the next poll will retry.")


class CalendarSync:
    def __init__(self, root, config, bridge=None, publisher=None):
        self.root, self.config = Path(root).resolve(), config
        self.bridge = bridge or CalendarBridge(self.root)
        self.publisher = publisher

    def run_once(self, now=None):
        now = now or datetime.now(UTC)
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("The updater needs a timezone-aware clock.")
        now = now.astimezone(UTC)
        settings = self.config.availability
        zone = ZoneInfo(settings.time_zone)
        today = now.astimezone(zone).date()
        monday = today - timedelta(days=today.weekday())
        # Read beyond the public window so boundary events' buffers still block.
        start = datetime.combine(monday, time(), zone).astimezone(UTC) - timedelta(minutes=settings.buffer_after_minutes)
        end = datetime.combine(monday + timedelta(weeks=settings.weeks), time(), zone).astimezone(UTC) + timedelta(minutes=settings.buffer_before_minutes)
        intervals = self.bridge.busy_intervals(
            start, end, source_ids=self.config.source_ids,
            source_names=self.config.source_names, calendar_names=self.config.calendar_names,
        )
        try:
            candidate = public_snapshot(generate_availability(intervals, settings, now))
        except (ValueError, TypeError):
            raise SyncError("Calendar data could not be validated. The last verified availability is unchanged and will expire normally.") from None
        output = self.root / "availability.json"
        current = _read_snapshot(output)
        updated = needs_update(current, candidate, now, self.config.refresh_minutes, self.config.poll_seconds)
        if updated:
            atomic_write(output, candidate)
        published = self.publisher.publish(candidate, now) if self.publisher else False
        return {"slots": len(candidate["slots"]), "updated": updated, "published": published}


def install_launch_agent(config_path):
    if sys.platform != "darwin":
        raise SyncError("The background job requires macOS.")
    if not (ROOT / ".calendar-sync" / "Tutoring Calendar.app").is_dir():
        raise SyncError("Build the Calendar helper and grant access with --list-calendars first.")
    state = private_directory(ROOT)
    folder = Path.home() / "Library" / "LaunchAgents"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{LABEL}.plist"
    job = {
        "Label": LABEL,
        "ProgramArguments": [sys.executable, str(ROOT / "server" / "calendar_sync.py"), "--config", str(config_path), "--watch", "--publish"],
        "WorkingDirectory": str(ROOT), "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 60,
        "EnvironmentVariables": {"PYTHONUNBUFFERED": "1"},
        "StandardOutPath": str(state / "updater.log"), "StandardErrorPath": str(state / "updater-errors.log"),
    }
    path.write_bytes(plistlib.dumps(job))
    path.chmod(0o600)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    result = subprocess.run(["launchctl", "bootstrap", domain, str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode:
        raise SyncError("The background job was saved but could not start. Run it from your logged-in macOS user session.")
    LOG.info("Background updater installed. It will run while this Mac is awake and your user session is logged in.")


def uninstall_launch_agent():
    if sys.platform != "darwin":
        raise SyncError("The background job requires macOS.")
    path = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    path.unlink(missing_ok=True)
    LOG.info("Background updater removed.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, help="Local JSON configuration (default: local file, then example).")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--watch", action="store_true", help="Check the calendars continuously; default is one check.")
    actions.add_argument("--list-calendars", action="store_true", help="List local calendars for setup and request Calendar permission.")
    actions.add_argument("--install-launch-agent", action="store_true", help="Install and start a user background job on this Mac.")
    actions.add_argument("--uninstall-launch-agent", action="store_true", help="Stop and remove this Mac's user background job.")
    parser.add_argument("--publish", action="store_true", help="Push availability.json to the configured Git branch.")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    try:
        if args.uninstall_launch_agent:
            uninstall_launch_agent()
            return 0
        config, config_path = load_config(args.config)
        if args.install_launch_agent:
            install_launch_agent(config_path)
            return 0
        if args.list_calendars:
            print(json.dumps(CalendarBridge(ROOT).list_calendars(), ensure_ascii=False, indent=2))
            return 0
        publisher = GitPublisher(ROOT, config) if args.publish else None
        worker = CalendarSync(ROOT, config, publisher=publisher)
        stop = threading.Event()
        for name in (signal.SIGINT, signal.SIGTERM):
            signal.signal(name, lambda *_: stop.set())
        previous_error = None
        with worker_lock(ROOT):
            while not stop.is_set():
                try:
                    result = worker.run_once()
                    if previous_error or result["updated"] or result["published"] or not args.watch:
                        LOG.info("Verified %s available trials. File %s; GitHub %s.", result["slots"],
                                 "updated" if result["updated"] else "unchanged", "updated" if result["published"] else "unchanged" if publisher else "not requested")
                    previous_error = None
                except (CalendarBridgeError, SyncError, OSError) as error:
                    message = str(error) if isinstance(error, (CalendarBridgeError, SyncError)) else "The availability file could not be saved. Check folder access."
                    if message != previous_error:
                        LOG.error("%s", message)
                    previous_error = message
                    if not args.watch:
                        return 1
                if not args.watch:
                    break
                stop.wait(config.poll_seconds)
        return 0
    except (SyncError, CalendarBridgeError, ValueError) as error:
        LOG.error("%s", error)
        return 1
    except OSError:
        LOG.error("Setup could not complete. Check folder access and the macOS background-job tools.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Read macOS EventKit through an app with its own Calendar permission identity.

The helper never modifies calendar events. Event payloads contain intervals only;
calendar names and identifiers are returned solely by the explicit setup listing.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime
from typing import Any, Sequence


class CalendarBridgeError(RuntimeError):
    """The calendar cannot be read safely; callers must not infer free time."""


_ERRORS = {
    "calendar_access_denied": (
        "Calendar read access was denied. Enable Full Access for Tutoring Calendar in "
        "System Settings > Privacy & Security > Calendars, then run again."
    ),
    "calendar_access_failed": "macOS could not grant Calendar access. Open Calendar to sync and try again.",
    "calendar_source_missing": (
        "The selected iCloud source is missing. Open Calendar to sync, run --list-calendars, "
        "and configure its source identifier if the account was renamed."
    ),
    "calendars_unavailable": "No calendars are available in the selected iCloud source. Open Calendar to sync.",
    "calendar_missing": "A configured calendar identifier is missing from the selected iCloud source. Run --list-calendars.",
    "invalid_request": "The Calendar helper received an invalid request.",
    "invalid_calendar_interval": "The Calendar helper found an invalid event interval.",
    "calendar_range_too_large": "The Calendar helper returned too many events. Reduce the availability horizon.",
    "calendar_read_failed": "The Calendar helper could not read events.",
}


def _aware_datetime(value: Any, label: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise CalendarBridgeError(f"{label} must be a timezone-aware datetime.")
    return value


def _identifiers(values: Sequence[str], label: str) -> list[str]:
    if isinstance(values, (str, bytes)) or not isinstance(values, (list, tuple)):
        raise CalendarBridgeError(f"{label} must be a list of nonempty strings.")
    if any(not isinstance(value, str) or not value.strip() for value in values):
        raise CalendarBridgeError(f"{label} must be a list of nonempty strings.")
    return list(dict.fromkeys(values))


def _response_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise CalendarBridgeError("The Calendar helper returned an invalid interval.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise CalendarBridgeError("The Calendar helper returned an invalid interval.") from None
    return _aware_datetime(parsed, "Calendar interval")


class CalendarBridge:
    def __init__(self, repo_root: str | Path, *, timeout_seconds: float = 120):
        self.repo_root = Path(repo_root).resolve()
        self.helper = self.repo_root / ".calendar-sync" / "Tutoring Calendar.app"
        self.timeout_seconds = timeout_seconds
        if type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise CalendarBridgeError("Calendar helper timeout must be finite and positive.")

    def list_calendars(self) -> list[dict[str, str]]:
        """Return account/calendar metadata for selecting an iCloud source locally."""
        response = self._request({"action": "list"})
        calendars = response.get("calendars")
        if not isinstance(calendars, list):
            raise CalendarBridgeError("The Calendar helper returned no valid calendar list.")
        result = []
        for calendar in calendars:
            if not isinstance(calendar, dict) or any(
                not isinstance(calendar.get(key), str) for key in ("id", "title", "sourceId", "sourceTitle")
            ) or not calendar["id"] or not calendar["sourceId"]:
                raise CalendarBridgeError("The Calendar helper returned an invalid calendar list.")
            result.append({key: calendar[key] for key in ("id", "title", "sourceId", "sourceTitle")})
        return result

    def busy_intervals(
        self,
        start: datetime,
        end: datetime,
        calendar_ids: Sequence[str] = (),
        source_ids: Sequence[str] = (),
        source_names: Sequence[str] = ("iCloud",),
        calendar_names: Sequence[str] = (),
    ) -> list[dict[str, Any]]:
        """Read busy intervals from every selected iCloud calendar.

        Source identifiers take precedence over source names. Empty calendar
        selectors mean every calendar within those sources, never all accounts.
        Names are resolved locally on each read so a renamed or missing calendar
        fails closed. Duplicate names include all matches in the selected sources.
        Cancellation and explicitly free events are excluded in the native helper.
        Recurrences, overnight events and all-day events are retained.
        """
        start = _aware_datetime(start, "Start")
        end = _aware_datetime(end, "End")
        if end <= start or (end - start).total_seconds() > 366 * 24 * 60 * 60:
            raise CalendarBridgeError("Calendar range must be positive and no longer than 366 days.")
        calendar_ids = _identifiers(calendar_ids, "Calendar identifiers")
        source_ids = _identifiers(source_ids, "Source identifiers")
        source_names = _identifiers(source_names, "Source names")
        calendar_names = _identifiers(calendar_names, "Calendar names")
        if not source_ids and not source_names:
            raise CalendarBridgeError("Select an iCloud source by name or identifier.")
        if calendar_ids and calendar_names:
            raise CalendarBridgeError("Select calendars by names or identifiers, not both.")
        if calendar_names:
            source_titles = {name.casefold() for name in source_names}
            requested = {name.casefold() for name in calendar_names}
            calendars = [
                calendar for calendar in self.list_calendars()
                if (calendar["sourceId"] in source_ids if source_ids
                    else calendar["sourceTitle"].casefold() in source_titles)
                and calendar["title"].casefold() in requested
            ]
            if requested != {calendar["title"].casefold() for calendar in calendars}:
                raise CalendarBridgeError(
                    "A configured calendar name is missing from the selected source. Run --list-calendars."
                )
            calendar_ids = list(dict.fromkeys(calendar["id"] for calendar in calendars))
        response = self._request({
            "action": "busy", "start": start.isoformat(), "end": end.isoformat(),
            "calendarIds": calendar_ids, "sourceIds": source_ids, "sourceNames": source_names,
        })
        intervals = response.get("intervals")
        if not isinstance(intervals, list) or len(intervals) > 100_000:
            raise CalendarBridgeError("The Calendar helper returned no valid busy intervals.")
        result = []
        for interval in intervals:
            if not isinstance(interval, dict) or type(interval.get("allDay")) is not bool:
                raise CalendarBridgeError("The Calendar helper returned an invalid interval.")
            interval_start = _response_datetime(interval.get("start"))
            interval_end = _response_datetime(interval.get("end"))
            if interval_end <= interval_start:
                raise CalendarBridgeError("The Calendar helper returned an invalid interval.")
            if interval_start < end and interval_end > start:
                # Copy only this narrow schema even if the helper gains private metadata later.
                result.append({"start": interval["start"], "end": interval["end"], "allDay": interval["allDay"]})
        return result

    def _launch(self, command: list[str]) -> int:
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                return process.wait(timeout=self.timeout_seconds)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        pass
                raise CalendarBridgeError("The Calendar helper timed out. No availability was inferred.") from None
        except OSError:
            raise CalendarBridgeError("Could not launch the Calendar helper through macOS LaunchServices.") from None

    def _request(self, request: dict[str, Any]) -> dict[str, Any]:
        if sys.platform != "darwin":
            raise CalendarBridgeError("Calendar access requires macOS 13 or later.")
        executable = self.helper / "Contents" / "MacOS" / "tutoring-calendar"
        if not executable.is_file():
            raise CalendarBridgeError("Calendar helper is missing. Run server/build-calendar-helper.sh first.")
        try:
            with tempfile.TemporaryDirectory(prefix="tutoring-calendar-") as temporary_path:
                directory = Path(temporary_path)
                directory.chmod(0o700)
                input_file, output_file, errors_file = (
                    directory / "request.json", directory / "response.json", directory / "errors.txt"
                )
                for path in (input_file, output_file, errors_file):
                    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    os.close(descriptor)
                input_file.write_text(json.dumps(request), encoding="utf-8")
                # Direct execution inherits the caller's privacy identity; LaunchServices
                # gives this app its stable, separately approved Calendar identity.
                status = self._launch([
                    "/usr/bin/open", "-n", "-g", "-W", "--stdin", str(input_file),
                    "--stdout", str(output_file), "--stderr", str(errors_file), str(self.helper),
                ])
                if output_file.stat().st_size > 16 * 1024 * 1024:
                    raise CalendarBridgeError("The Calendar helper response is too large.")
                try:
                    response = json.loads(output_file.read_text(encoding="utf-8"))
                except (UnicodeError, json.JSONDecodeError):
                    raise CalendarBridgeError("The Calendar helper returned an invalid response.") from None
                if not isinstance(response, dict):
                    raise CalendarBridgeError("The Calendar helper returned an invalid response.")
                if "error" in response:
                    # Return only known messages; never expose arbitrary native error text.
                    code = response["error"]
                    message = "The Calendar helper could not read the calendar."
                    if isinstance(code, str):
                        message = _ERRORS.get(code, message)
                    raise CalendarBridgeError(message)
                if status != 0:
                    raise CalendarBridgeError("The Calendar helper did not complete successfully.")
                return response
        except OSError:
            raise CalendarBridgeError("Could not exchange data with the Calendar helper.") from None

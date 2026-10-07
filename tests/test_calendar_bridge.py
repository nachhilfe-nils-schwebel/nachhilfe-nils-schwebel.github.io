import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from server.calendar_bridge import CalendarBridge, CalendarBridgeError


class CalendarBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.bridge = CalendarBridge(self.temporary.name)
        executable = self.bridge.helper / "Contents" / "MacOS" / "tutoring-calendar"
        executable.parent.mkdir(parents=True)
        executable.touch()
        self.start = datetime(2026, 10, 6, 0, tzinfo=timezone.utc)
        self.end = datetime(2026, 10, 7, 0, tzinfo=timezone.utc)
        self.platform = patch("server.calendar_bridge.sys.platform", "darwin")
        self.platform.start()
        self.addCleanup(self.platform.stop)

    def respond(self, response, *, status=0):
        self.last_request = None
        self.last_directory = None

        def launch(command):
            self.assertEqual(command[:4], ["/usr/bin/open", "-n", "-g", "-W"])
            input_file = Path(command[command.index("--stdin") + 1])
            output_file = Path(command[command.index("--stdout") + 1])
            errors_file = Path(command[command.index("--stderr") + 1])
            self.last_directory = input_file.parent
            self.assertEqual(stat.S_IMODE(input_file.parent.stat().st_mode), 0o700)
            for path in (input_file, output_file, errors_file):
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.last_request = json.loads(input_file.read_text())
            output_file.write_text(json.dumps(response) if not isinstance(response, bytes) else response.decode())
            return status

        self.bridge._launch = launch

    def test_default_reads_all_calendars_in_icloud_only(self):
        self.respond({"intervals": []})
        self.assertEqual(self.bridge.busy_intervals(self.start, self.end), [])
        self.assertEqual(self.last_request["sourceNames"], ["iCloud"])
        self.assertEqual(self.last_request["calendarIds"], [])
        self.assertEqual(self.last_request["sourceIds"], [])
        self.assertFalse(self.last_directory.exists())

    def test_selected_identifiers_are_forwarded_without_event_titles(self):
        self.respond({"intervals": []})
        self.bridge.busy_intervals(self.start, self.end, ["calendar-a"], ["source-a"], ["iCloud"])
        self.assertEqual(self.last_request["calendarIds"], ["calendar-a"])
        self.assertEqual(self.last_request["sourceIds"], ["source-a"])
        self.assertNotIn("title", self.last_request)

    def test_listing_is_explicit_account_metadata(self):
        calendar = {"id": "c", "title": "Work", "sourceId": "s", "sourceTitle": "iCloud"}
        self.respond({"calendars": [calendar]})
        self.assertEqual(self.bridge.list_calendars(), [calendar])
        self.assertEqual(self.last_request, {"action": "list"})

    def test_calendar_names_resolve_all_matching_icloud_calendars_only(self):
        calendars = [
            {"id": "work-a", "title": "Work", "sourceId": "icloud-a", "sourceTitle": "iCloud"},
            {"id": "work-b", "title": "WORK", "sourceId": "icloud-b", "sourceTitle": "ICLOUD"},
            {"id": "private", "title": "Private", "sourceId": "icloud-a", "sourceTitle": "iCloud"},
            {"id": "other", "title": "Work", "sourceId": "google", "sourceTitle": "Google"},
        ]
        self.bridge._request = Mock(side_effect=[{"calendars": calendars}, {"intervals": []}])
        self.assertEqual(self.bridge.busy_intervals(self.start, self.end, calendar_names=["work"]), [])
        listing, busy = [call.args[0] for call in self.bridge._request.call_args_list]
        self.assertEqual(listing, {"action": "list"})
        self.assertEqual(busy["calendarIds"], ["work-a", "work-b"])
        self.assertNotIn("calendarNames", busy)

    def test_calendar_names_respect_source_identifiers_before_source_titles(self):
        calendars = [
            {"id": "selected", "title": "Work", "sourceId": "chosen", "sourceTitle": "Renamed account"},
            {"id": "excluded", "title": "Work", "sourceId": "other", "sourceTitle": "iCloud"},
        ]
        self.bridge._request = Mock(side_effect=[{"calendars": calendars}, {"intervals": []}])
        self.bridge.busy_intervals(self.start, self.end, source_ids=["chosen"], calendar_names=["Work"])
        self.assertEqual(self.bridge._request.call_args.args[0]["calendarIds"], ["selected"])

    def test_missing_or_renamed_calendar_name_never_queries_availability(self):
        calendars = [{"id": "work", "title": "Work", "sourceId": "s", "sourceTitle": "iCloud"}]
        self.bridge._request = Mock(return_value={"calendars": calendars})
        with self.assertRaises(CalendarBridgeError) as error:
            self.bridge.busy_intervals(self.start, self.end, calendar_names=["Work", "Synthetic private name"])
        self.assertNotIn("Synthetic private name", str(error.exception))
        self.bridge._request.assert_called_once_with({"action": "list"})

    def test_invalid_or_mixed_calendar_name_selection_does_not_launch(self):
        self.bridge._request = Mock(side_effect=AssertionError("Must not launch"))
        for selection in (
            {"calendar_names": "Work"}, {"calendar_names": [""]},
            {"calendar_names": [False]}, {"calendar_ids": ["id"], "calendar_names": ["Work"]},
        ):
            with self.subTest(selection=selection), self.assertRaises(CalendarBridgeError):
                self.bridge.busy_intervals(self.start, self.end, **selection)
        self.bridge._request.assert_not_called()

    def test_overnight_and_all_day_events_are_preserved_but_metadata_is_removed(self):
        overnight = {"start": "2026-10-05T23:00:00Z", "end": "2026-10-06T01:00:00Z", "allDay": False, "title": "Private"}
        all_day = {"start": "2026-10-05T22:00:00Z", "end": "2026-10-06T22:00:00Z", "allDay": True}
        irrelevant = {"start": "2026-10-07T00:00:00Z", "end": "2026-10-07T01:00:00Z", "allDay": False}
        self.respond({"intervals": [overnight, all_day, irrelevant]})
        result = self.bridge.busy_intervals(self.start, self.end)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["start"], overnight["start"])
        self.assertEqual(set(result[0]), {"start", "end", "allDay"})
        self.assertTrue(result[1]["allDay"])

    def test_invalid_native_intervals_fail_closed(self):
        for interval in (
            {"start": "2026-10-06T15:30:00", "end": "2026-10-06T16:15:00", "allDay": False},
            {"start": "bad", "end": "2026-10-06T16:15:00Z", "allDay": False},
            {"start": "2026-10-06T16:15:00Z", "end": "2026-10-06T15:30:00Z", "allDay": False},
            {"start": "2026-10-06T15:30:00Z", "end": "2026-10-06T16:15:00Z", "allDay": "false"},
        ):
            with self.subTest(interval=interval):
                self.respond({"intervals": [interval]})
                with self.assertRaises(CalendarBridgeError):
                    self.bridge.busy_intervals(self.start, self.end)

    def test_invalid_input_does_not_launch(self):
        self.bridge._request = Mock(side_effect=AssertionError("Must not launch"))
        for arguments in (
            (self.start.replace(tzinfo=None), self.end, [], [], ["iCloud"]),
            (self.end, self.start, [], [], ["iCloud"]),
            (self.start, self.end, [""], [], ["iCloud"]),
            (self.start, self.end, [], [], []),
            (self.start, self.end, [], [], "iCloud"),
        ):
            with self.subTest(arguments=arguments), self.assertRaises(CalendarBridgeError):
                self.bridge.busy_intervals(*arguments)
        self.bridge._request.assert_not_called()

    def test_missing_helper_has_an_actionable_error(self):
        (self.bridge.helper / "Contents" / "MacOS" / "tutoring-calendar").unlink()
        with self.assertRaisesRegex(CalendarBridgeError, "build-calendar-helper"):
            self.bridge.list_calendars()

    def test_malformed_responses_and_nonzero_launch_fail_closed(self):
        for response, status in ((b"not JSON", 0), ([], 0), ({"intervals": []}, 1), ({}, 0)):
            with self.subTest(response=response, status=status):
                self.respond(response, status=status)
                with self.assertRaises(CalendarBridgeError):
                    self.bridge.busy_intervals(self.start, self.end)
                self.assertFalse(self.last_directory.exists())

    def test_missing_sources_and_calendars_are_not_assumed_free(self):
        for code in ("calendar_source_missing", "calendar_missing", "calendars_unavailable"):
            with self.subTest(code=code):
                self.respond({"error": code})
                with self.assertRaises(CalendarBridgeError):
                    self.bridge.busy_intervals(self.start, self.end)

    def test_source_error_wins_over_an_empty_interval_list(self):
        self.respond({"error": "calendar_source_missing", "intervals": []})
        with self.assertRaisesRegex(CalendarBridgeError, "selected iCloud source is missing"):
            self.bridge.busy_intervals(self.start, self.end)
        self.assertEqual(self.last_request["sourceNames"], ["iCloud"])

    def test_every_expanded_recurrence_is_retained(self):
        occurrences = [
            {"start": f"2026-10-{day:02}T15:30:00+02:00", "end": f"2026-10-{day:02}T16:15:00+02:00", "allDay": False}
            for day in (6, 13, 20)
        ]
        self.respond({"intervals": occurrences})
        end = datetime(2026, 10, 27, 0, tzinfo=timezone.utc)
        self.assertEqual(self.bridge.busy_intervals(self.start, end), occurrences)

    def test_nonfinite_and_boolean_timeouts_are_rejected(self):
        for timeout in (float("nan"), float("inf"), -1, 0, True, "120"):
            with self.subTest(timeout=timeout), self.assertRaises(CalendarBridgeError):
                CalendarBridge(self.temporary.name, timeout_seconds=timeout)

    def test_native_exception_details_are_not_exposed(self):
        self.respond({"error": "Some private event title"})
        with self.assertRaises(CalendarBridgeError) as error:
            self.bridge.list_calendars()
        self.assertNotIn("private", str(error.exception))

    def test_timeout_terminates_then_kills_launcher(self):
        process = Mock()
        process.wait.side_effect = [subprocess.TimeoutExpired("open", 120), subprocess.TimeoutExpired("open", 5), 0]
        with patch("server.calendar_bridge.subprocess.Popen", return_value=process):
            with self.assertRaisesRegex(CalendarBridgeError, "timed out"):
                CalendarBridge(self.temporary.name)._launch(["/usr/bin/open"])
        process.terminate.assert_called_once()
        process.kill.assert_called_once()

    def test_timeout_remains_controlled_if_launcher_does_not_reap(self):
        process = Mock()
        process.wait.side_effect = subprocess.TimeoutExpired("open", 5)
        with patch("server.calendar_bridge.subprocess.Popen", return_value=process):
            with self.assertRaisesRegex(CalendarBridgeError, "timed out"):
                self.bridge._launch(["/usr/bin/open"])
        process.terminate.assert_called_once()
        process.kill.assert_called_once()


if __name__ == "__main__":
    unittest.main()

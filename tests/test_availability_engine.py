"""Deterministic availability tests; no calendar or network access required."""

from datetime import datetime, timedelta, timezone
import json
import random
import unittest
from zoneinfo import ZoneInfo

from server.availability_engine import AvailabilitySettings, generate_availability


BERLIN = ZoneInfo("Europe/Berlin")


class AvailabilityEngineTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.fromisoformat("2026-10-05T10:00:00+02:00")
        self.settings = AvailabilitySettings.from_dict({})

    def availability(self, events=None, config=None, now=None):
        return generate_availability(
            events if events is not None else [],
            AvailabilitySettings.from_dict(config or {}),
            now or self.now,
        )

    @staticmethod
    def times(data, day="2026-10-05"):
        return [slot["time"] for slot in data["slots"] if slot["date"] == day]

    def test_defaults_and_public_schema(self):
        self.assertEqual(self.settings.buffer_before_minutes, 30)
        self.assertEqual(self.settings.buffer_after_minutes, 30)
        data = self.availability()
        self.assertEqual(set(data), {
            "schemaVersion", "status", "isDemo", "timeZone", "durationMinutes",
            "stepMinutes", "generatedAt", "validUntil", "windowStart", "windowEnd", "slots",
        })
        self.assertEqual(data["status"], "ready")
        self.assertFalse(data["isDemo"])
        self.assertEqual(data["timeZone"], "Europe/Berlin")
        self.assertEqual(data["generatedAt"], "2026-10-05T08:00:00Z")
        self.assertEqual(data["validUntil"], "2026-10-07T08:00:00Z")
        self.assertEqual(data["windowStart"], "2026-10-05")
        self.assertEqual(data["windowEnd"], "2026-11-02")
        self.assertEqual(len(data["slots"]), 4 * 6 * 4)

    def test_empty_calendar_packs_trials_without_extra_buffers(self):
        self.assertEqual(self.times(self.availability()), ["15:30", "16:15", "17:00", "17:45"])

    def test_user_example_event_ends_at_1545(self):
        events = [{"start": "2026-10-05T15:30:00+02:00", "end": "2026-10-05T15:45:00+02:00"}]
        self.assertEqual(self.times(self.availability(events)), ["16:15", "17:00", "17:45"])

    def test_midday_event_is_buffered_before_and_after(self):
        events = [{"start": "2026-10-05T16:30:00+02:00", "end": "2026-10-05T17:00:00+02:00"}]
        self.assertEqual(self.times(self.availability(events)), ["17:30", "18:15"])

    def test_last_trial_can_end_exactly_at_1900(self):
        events = [{"start": "2026-10-05T15:00:00+02:00", "end": "2026-10-05T15:45:00+02:00"}]
        data = self.availability(events, {"bufferAfterMinutes": 45})
        self.assertEqual(self.times(data), ["16:30", "17:15", "18:00"])
        data = self.availability(events, {"bufferAfterMinutes": 60})
        self.assertEqual(self.times(data), ["16:45", "17:30", "18:15"])

    def test_overlapping_and_adjacent_expanded_intervals_merge(self):
        events = [
            {"start": "2026-10-05T16:00:00+02:00", "end": "2026-10-05T16:15:00+02:00"},
            {"start": "2026-10-05T17:15:00+02:00", "end": "2026-10-05T17:30:00+02:00"},
            {"start": "2026-10-05T16:10:00+02:00", "end": "2026-10-05T16:30:00+02:00"},
        ]
        self.assertEqual(self.times(self.availability(events)), ["18:00"])
        self.assertEqual(self.availability(events), self.availability(list(reversed(events))))

    def test_seconds_and_microseconds_round_forward(self):
        for ending, expected in (
            ("15:45:00", ["16:15", "17:00", "17:45"]),
            ("15:45:01", ["16:30", "17:15", "18:00"]),
            ("15:45:00.000001", ["16:30", "17:15", "18:00"]),
        ):
            with self.subTest(ending=ending):
                event = {"start": "2026-10-05T15:30:00+02:00", "end": f"2026-10-05T{ending}+02:00"}
                self.assertEqual(self.times(self.availability([event])), expected)

    def test_custom_buffers_are_applied_independently(self):
        event = {"start": "2026-10-05T16:30:00+02:00", "end": "2026-10-05T17:00:00+02:00"}
        data = self.availability([event], {"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0})
        self.assertEqual(self.times(data), ["15:30", "17:00", "17:45"])
        data = self.availability([event], {"bufferBeforeMinutes": 0, "bufferAfterMinutes": 30})
        self.assertEqual(self.times(data), ["15:30", "17:30", "18:15"])
        data = self.availability([event], {"bufferBeforeMinutes": 30, "bufferAfterMinutes": 0})
        self.assertEqual(self.times(data), ["17:00", "17:45"])

    def test_sunday_is_excluded_and_saturday_included(self):
        days = {slot["date"] for slot in self.availability()["slots"]}
        self.assertIn("2026-10-10", days)
        self.assertNotIn("2026-10-11", days)
        custom = self.availability(config={"weekdays": [6]})
        self.assertEqual(self.times(custom, "2026-10-11"), ["15:30", "16:15", "17:00", "17:45"])

    def test_past_dates_and_minimum_notice_are_excluded(self):
        now = datetime.fromisoformat("2026-10-06T16:10:00+02:00")
        data = self.availability(now=now)
        self.assertEqual(self.times(data), [])
        self.assertEqual(self.times(data, "2026-10-06"), ["16:15", "17:00", "17:45"])
        data = self.availability(config={"minNoticeMinutes": 40}, now=now)
        self.assertEqual(self.times(data, "2026-10-06"), ["17:00", "17:45"])

    def test_exact_minute_cutoff_and_fractional_cutoff(self):
        exact = datetime.fromisoformat("2026-10-05T15:30:00+02:00")
        self.assertEqual(self.times(self.availability(now=exact)), ["15:30", "16:15", "17:00", "17:45"])
        fractional = exact + timedelta(microseconds=1)
        self.assertEqual(self.times(self.availability(now=fractional)), ["15:45", "16:30", "17:15", "18:00"])

    def test_clock_grid_is_local_and_not_relative_to_window_start(self):
        data = self.availability(config={"startTime": "15:32"})
        self.assertEqual(self.times(data), ["15:45", "16:30", "17:15", "18:00"])

    def test_overnight_and_multiday_events(self):
        events = [{"start": "2026-10-04T21:00:00+02:00", "end": "2026-10-06T16:00:00+02:00"}]
        data = self.availability(events)
        self.assertEqual(self.times(data), [])
        self.assertEqual(self.times(data, "2026-10-06"), ["16:30", "17:15", "18:00"])

    def test_all_day_occurrences_block_the_entire_day(self):
        events = [{"start": "2026-10-05T00:00:00+02:00", "end": "2026-10-06T00:00:00+02:00", "allDay": True}]
        self.assertEqual(self.times(self.availability(events)), [])

    def test_all_calendar_details_are_omitted_from_output(self):
        events = [{
            "start": "2026-10-05T15:30:00+02:00", "end": "2026-10-05T15:45:00+02:00",
            "title": "Confidential personal appointment", "calendarId": "Private", "attendees": ["person@example.com"],
        }]
        output = json.dumps(self.availability(events))
        for value in ("Confidential", "calendarId", "person@example.com", "Private"):
            self.assertNotIn(value, output)

    def test_calendar_occurrences_work_across_the_autumn_dst_change(self):
        events = [
            {"start": "2026-10-19T13:30:00Z", "end": "2026-10-19T13:45:00Z"},
            {"start": "2026-10-26T14:30:00Z", "end": "2026-10-26T14:45:00Z"},
        ]
        data = self.availability(events, now=datetime.fromisoformat("2026-10-19T10:00:00+02:00"))
        self.assertEqual(self.times(data, "2026-10-19"), ["16:15", "17:00", "17:45"])
        self.assertEqual(self.times(data, "2026-10-26"), ["16:15", "17:00", "17:45"])

    def test_overnight_event_crossing_spring_dst_uses_elapsed_utc_time(self):
        event = {"start": "2026-03-28T18:00:00+01:00", "end": "2026-03-30T15:45:00+02:00"}
        data = self.availability([event], now=datetime.fromisoformat("2026-03-30T08:00:00+02:00"))
        self.assertEqual(self.times(data, "2026-03-30"), ["16:15", "17:00", "17:45"])

    def test_schedule_day_comes_from_berlin_instead_of_host_timezone(self):
        data = self.availability(now=datetime.fromisoformat("2026-10-04T22:05:00+00:00"))
        self.assertEqual(data["windowStart"], "2026-10-05")
        self.assertEqual(self.times(data), ["15:30", "16:15", "17:00", "17:45"])

    def test_dst_gap_has_no_nonexistent_local_slot(self):
        data = self.availability(
            config={"weekdays": [6], "startTime": "01:30", "endTime": "04:00", "weeks": 1},
            now=datetime.fromisoformat("2026-03-23T12:00:00+01:00"),
        )
        self.assertEqual(self.times(data, "2026-03-29"), ["01:30", "03:15"])

    def test_dst_repeated_hour_is_omitted_because_public_times_have_no_offset(self):
        data = self.availability(
            config={"weekdays": [6], "startTime": "01:30", "endTime": "04:00", "weeks": 1},
            now=datetime.fromisoformat("2026-10-19T12:00:00+02:00"),
        )
        times = self.times(data, "2026-10-25")
        self.assertEqual(times, ["01:30", "03:00"])
        self.assertEqual(len(times), len(set(times)))

    def test_nonexistent_spring_window_boundary_never_extends_opening_hours(self):
        data = self.availability(
            config={"weekdays": [6], "startTime": "01:00", "endTime": "02:30", "weeks": 1},
            now=datetime.fromisoformat("2026-03-23T12:00:00+01:00"),
        )
        self.assertEqual(self.times(data, "2026-03-29"), ["01:00"])

    def test_buffer_from_an_event_outside_daily_window_still_blocks(self):
        event = {"start": "2026-10-05T19:10:00+02:00", "end": "2026-10-05T20:00:00+02:00"}
        data = self.availability([event], {"startTime": "16:45"})
        self.assertEqual(self.times(data), ["16:45", "17:30"])

    def test_malformed_calendar_data_fails_closed(self):
        invalid = (
            {}, {"start": "2026-10-05T15:30:00+02:00"},
            {"start": "bad", "end": "2026-10-05T15:45:00+02:00"},
            {"start": "2026-10-05T15:30:00", "end": "2026-10-05T15:45:00"},
            {"start": "2026-10-05", "end": "2026-10-06"},
            {"start": "2026-10-05T15:45:00+02:00", "end": "2026-10-05T15:30:00+02:00"},
            {"start": "2026-10-05T15:30:00+02:00", "end": "2026-10-05T15:30:00+02:00"},
            {"start": None, "end": "2026-10-05T15:45:00+02:00"},
            "not an event",
        )
        for event in invalid:
            with self.subTest(event=event), self.assertRaises(ValueError):
                self.availability([event])
        for data in (None, {}, "[]", ()):
            with self.subTest(data=data), self.assertRaises(ValueError):
                generate_availability(data, self.settings, self.now)
        with self.assertRaises(ValueError):
            self.availability(now=datetime(2026, 10, 5, 10))

    def test_invalid_configuration_is_rejected(self):
        invalid = (
            {"timeZone": "Not/AZone"}, {"timeZone": ""}, {"weekdays": []},
            {"weekdays": [0, 7]}, {"weekdays": [0, 0]}, {"weekdays": [True]},
            {"startTime": "3:30"}, {"startTime": "15:60"}, {"endTime": "15:30"},
            {"startTime": "19:00", "endTime": "15:30"}, {"durationMinutes": 0},
            {"durationMinutes": 44}, {"durationMinutes": 240}, {"stepMinutes": 7},
            {"stepMinutes": 0}, {"stepMinutes": True}, {"bufferBeforeMinutes": -1},
            {"bufferAfterMinutes": 1.5}, {"weeks": 0}, {"validityHours": 0},
            {"minNoticeMinutes": -1}, {"misspelledSetting": 30},
        )
        for config in invalid:
            with self.subTest(config=config), self.assertRaises(ValueError):
                AvailabilitySettings.from_dict(config)
        for value in (None, [], "settings"):
            with self.subTest(config=value), self.assertRaises(ValueError):
                AvailabilitySettings.from_dict(value)

    def test_random_intervals_pack_the_maximum_number_without_conflicts(self):
        # An independent dynamic-programming oracle finds the optimal count on
        # the 15-minute grid, rather than reproducing the engine's greedy loop.
        generator = random.Random(42)
        day_start = datetime(2026, 10, 5, 15, 30, tzinfo=BERLIN)
        for case in range(80):
            events = []
            blocks = []
            for _ in range(generator.randint(0, 5)):
                start = day_start + timedelta(minutes=generator.randint(-45, 195))
                end = start + timedelta(minutes=generator.randint(1, 65))
                events.append({"start": start.isoformat(), "end": end.isoformat()})
                blocks.append((start - timedelta(minutes=30), end + timedelta(minutes=30)))
            candidates = []
            for index in range(12):
                start = day_start + timedelta(minutes=15 * index)
                end = start + timedelta(minutes=45)
                if not any(start < block_end and end > block_start for block_start, block_end in blocks):
                    candidates.append(index)
            optimal = [0] * 15
            for index in range(11, -1, -1):
                skip = optimal[index + 1]
                take = 1 + optimal[index + 3] if index in candidates else 0
                optimal[index] = max(skip, take)
            times = self.times(self.availability(events))
            with self.subTest(case=case):
                self.assertEqual(len(times), optimal[0])
                previous_end = None
                for value in times:
                    start = datetime.fromisoformat(f"2026-10-05T{value}:00+02:00")
                    end = start + timedelta(minutes=45)
                    self.assertFalse(any(start < block_end and end > block_start for block_start, block_end in blocks))
                    if previous_end is not None:
                        self.assertGreaterEqual(start, previous_end)
                    previous_end = end


if __name__ == "__main__":
    unittest.main()

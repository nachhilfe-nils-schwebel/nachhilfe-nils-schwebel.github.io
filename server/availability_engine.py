"""Create public lesson slots from private calendar busy intervals.

This module performs no calendar, network, or filesystem operations. Calendar
providers must supply expanded occurrences and omit events marked free or
cancelled. Only each occurrence's ``start`` and ``end`` are inspected; private
event details never appear in the returned public data.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


UTC = timezone.utc
_CLOCK = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _clock(value: object, name: str) -> time:
    if not isinstance(value, str) or not _CLOCK.fullmatch(value):
        raise ValueError(f"{name} must use HH:mm in the 24-hour clock")
    hour, minute = map(int, value.split(":"))
    return time(hour, minute)


def _integer(value: object, name: str, minimum: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


@dataclass(frozen=True)
class AvailabilitySettings:
    """Validated schedule configuration, independent of the machine timezone."""

    time_zone: str = "Europe/Berlin"
    weekdays: tuple[int, ...] = (0, 1, 2, 3, 4, 5)
    start_time: str = "15:30"
    end_time: str = "19:00"
    duration_minutes: int = 45
    step_minutes: int = 15
    buffer_before_minutes: int = 30
    buffer_after_minutes: int = 30
    weeks: int = 4
    min_notice_minutes: int = 0
    validity_hours: int = 48

    def __post_init__(self) -> None:
        if not isinstance(self.time_zone, str) or not self.time_zone:
            raise ValueError("timeZone must be an IANA timezone name")
        try:
            ZoneInfo(self.time_zone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timeZone must be a known IANA timezone name") from exc
        if not isinstance(self.weekdays, (tuple, list)) or not self.weekdays:
            raise ValueError("weekdays must contain at least one day (Monday=0)")
        for weekday in self.weekdays:
            _integer(weekday, "weekdays entry", 0)
            if weekday > 6:
                raise ValueError("weekdays entries must be between 0 and 6")
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays must not contain duplicates")
        object.__setattr__(self, "weekdays", tuple(sorted(self.weekdays)))
        start, end = _clock(self.start_time, "startTime"), _clock(self.end_time, "endTime")
        if start >= end:
            raise ValueError("endTime must be later than startTime on the same day")
        for field, public_name, minimum in (
            (self.duration_minutes, "durationMinutes", 1),
            (self.step_minutes, "stepMinutes", 1),
            (self.buffer_before_minutes, "bufferBeforeMinutes", 0),
            (self.buffer_after_minutes, "bufferAfterMinutes", 0),
            (self.weeks, "weeks", 1),
            (self.min_notice_minutes, "minNoticeMinutes", 0),
            (self.validity_hours, "validityHours", 1),
        ):
            _integer(field, public_name, minimum)
        if self.step_minutes > 60 or 60 % self.step_minutes:
            raise ValueError("stepMinutes must divide 60 evenly")
        if self.duration_minutes % self.step_minutes:
            raise ValueError("durationMinutes must be a multiple of stepMinutes")
        window_minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
        if self.duration_minutes > window_minutes:
            raise ValueError("durationMinutes must fit within the daily time window")

    @classmethod
    def from_dict(cls, values: Mapping[str, object]) -> "AvailabilitySettings":
        if not isinstance(values, Mapping):
            raise ValueError("availability settings must be an object")
        names = {
            "timeZone": "time_zone",
            "weekdays": "weekdays",
            "startTime": "start_time",
            "endTime": "end_time",
            "durationMinutes": "duration_minutes",
            "stepMinutes": "step_minutes",
            "bufferBeforeMinutes": "buffer_before_minutes",
            "bufferAfterMinutes": "buffer_after_minutes",
            "weeks": "weeks",
            "minNoticeMinutes": "min_notice_minutes",
            "validityHours": "validity_hours",
        }
        unknown = set(values).difference(names)
        if unknown:
            raise ValueError(f"Unknown availability setting: {', '.join(sorted(map(str, unknown)))}")
        return cls(**{names[name]: value for name, value in values.items()})


def _aware(value: object, name: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be a timezone-aware datetime")
    return value.astimezone(UTC)


def _parse_timestamp(value: object, name: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be an ISO timestamp with a timezone offset")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{name} must be an ISO timestamp with a timezone offset") from exc
    return _aware(parsed, name)


def _merged_busy(busy_intervals: list[dict], settings: AvailabilitySettings) -> list[tuple[datetime, datetime]]:
    if not isinstance(busy_intervals, list):
        raise ValueError("busy_intervals must be a list")
    before = timedelta(minutes=settings.buffer_before_minutes)
    after = timedelta(minutes=settings.buffer_after_minutes)
    expanded: list[tuple[datetime, datetime]] = []
    for index, interval in enumerate(busy_intervals):
        if not isinstance(interval, dict) or "start" not in interval or "end" not in interval:
            raise ValueError(f"Busy interval {index} must contain start and end timestamps")
        start = _parse_timestamp(interval["start"], f"Busy interval {index} start")
        end = _parse_timestamp(interval["end"], f"Busy interval {index} end")
        if end <= start:
            raise ValueError(f"Busy interval {index} must end after it starts")
        expanded.append((start - before, end + after))
    merged: list[tuple[datetime, datetime]] = []
    for start, end in sorted(expanded):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def _free_gaps(start: datetime, end: datetime, busy: list[tuple[datetime, datetime]]):
    cursor = start
    for busy_start, busy_end in busy:
        if busy_end <= cursor:
            continue
        if busy_start >= end:
            break
        if busy_start > cursor:
            yield cursor, min(busy_start, end)
        cursor = max(cursor, busy_end)
        if cursor >= end:
            return
    if cursor < end:
        yield cursor, end


def _ceil_grid(instant: datetime, zone: ZoneInfo, step: int) -> datetime:
    """Round forward on the local minute grid, adding elapsed time in UTC."""
    local = instant.astimezone(zone)
    fraction = timedelta(seconds=local.second, microseconds=local.microsecond)
    candidate = instant if fraction == timedelta(0) else instant + timedelta(minutes=1) - fraction
    while candidate.astimezone(zone).minute % step:
        candidate += timedelta(minutes=1)
    return candidate


def _ambiguous_wall_time(instant: datetime, zone: ZoneInfo) -> bool:
    """The public date/time schema cannot represent repeated autumn hours."""
    local = instant.astimezone(zone)
    return local.replace(fold=0).utcoffset() != local.replace(fold=1).utcoffset()


def _iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def generate_availability(
    busy_intervals: list[dict], settings: AvailabilitySettings, now: datetime
) -> dict:
    """Subtract buffered calendar events, then greedily pack equal-length trials.

    Slots start on the configured local minute grid. Equal lesson durations make
    earliest-fit packing optimal within each free gap. Buffers apply to calendar
    events, not between alternative trial slots. Malformed calendar data raises
    ``ValueError`` so a caller can publish a closed/unavailable state.
    """
    if not isinstance(settings, AvailabilitySettings):
        raise ValueError("settings must be AvailabilitySettings")
    now_utc = _aware(now, "now")
    zone = ZoneInfo(settings.time_zone)
    local_today = now_utc.astimezone(zone).date()
    window_start = local_today - timedelta(days=local_today.weekday())
    window_end = window_start + timedelta(weeks=settings.weeks)
    cutoff = now_utc + timedelta(minutes=settings.min_notice_minutes)
    busy = _merged_busy(busy_intervals, settings)
    duration = timedelta(minutes=settings.duration_minutes)
    start_clock, end_clock = _clock(settings.start_time, "startTime"), _clock(settings.end_time, "endTime")
    slots: list[dict[str, str]] = []
    day = window_start
    while day < window_end:
        if day.weekday() in settings.weekdays:
            day_start = datetime.combine(day, start_clock, zone).astimezone(UTC)
            day_end = datetime.combine(day, end_clock, zone).astimezone(UTC)
            for gap_start, gap_end in _free_gaps(max(day_start, cutoff), day_end, busy):
                candidate = _ceil_grid(gap_start, zone, settings.step_minutes)
                while candidate + duration <= gap_end:
                    local = candidate.astimezone(zone)
                    local_end = (candidate + duration).astimezone(zone)
                    # Ambiguous wall times cannot be booked unambiguously with
                    # the public date/time-only schema; omit them conservatively.
                    # Wall-clock bounds also prevent a nonexistent spring end
                    # time from being normalized beyond the configured window.
                    if (
                        _ambiguous_wall_time(candidate, zone)
                        or local.date() != day
                        or local.time() < start_clock
                        or local.time() >= end_clock
                        or local_end.date() != day
                        or local_end.time() > end_clock
                    ):
                        candidate += timedelta(minutes=settings.step_minutes)
                        continue
                    slots.append({"date": local.date().isoformat(), "time": local.strftime("%H:%M")})
                    candidate = _ceil_grid(candidate + duration, zone, settings.step_minutes)
        day += timedelta(days=1)
    return {
        "schemaVersion": 1,
        "status": "ready",
        "isDemo": False,
        "timeZone": settings.time_zone,
        "durationMinutes": settings.duration_minutes,
        "stepMinutes": settings.step_minutes,
        "generatedAt": _iso_utc(now_utc),
        "validUntil": _iso_utc(now_utc + timedelta(hours=settings.validity_hours)),
        "windowStart": window_start.isoformat(),
        "windowEnd": window_end.isoformat(),
        "slots": slots,
    }

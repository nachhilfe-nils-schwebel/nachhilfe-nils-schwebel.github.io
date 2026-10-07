# Calendar availability updater

The local updater reads synced iCloud calendars through macOS Calendar and publishes available trial times in `availability.json`. The website stays static; no incoming server connection is required.

## Schedule

Default availability is Monday–Saturday, 15:30–19:00 in Europe/Berlin, across four calendar weeks. Trials last 45 minutes and start on a 15-minute grid.

Busy events receive a 30-minute buffer before and after. Overlapping blocked intervals are merged, then removed from the teaching window. Each remaining gap is packed with consecutive 45-minute trials, starting at the next 15-minute boundary. For example, an event ending at 15:45 allows trials from 16:15 after its buffer.

Recurring, all-day and overnight events are included. Cancelled events and events marked Free do not block availability. Past start times are removed.

Polling runs every 60 seconds. Changed availability is published immediately after a successful calendar read; unchanged availability is refreshed hourly. Published data expires after two hours. Publication also requires a GitHub Pages deployment, so the public page may update after a delay.

## Setup

Requires macOS 13+, Python 3.10+, Git and Xcode Command Line Tools. The Python scripts use only the standard library. Use one dedicated repository checkout and run the updater on one Mac.

1. Clone the repository, use its `main` branch, and configure GitHub Pages to publish with GitHub Actions.
2. Enable iCloud Calendar syncing and wait for events to appear in Calendar. The updater reads the local database and cannot verify whether network syncing is complete.
3. Configure unattended Git push authentication for this checkout. Its account must have permission to push to the publishing branch.
4. Build the Calendar helper and allow Calendar access:

   ```sh
   ./server/build-calendar-helper.sh
   python3 server/calendar_sync.py --list-calendars
   ```

   If the Apple development tools are missing, install them with `xcode-select --install`. Calendar permission can be managed in **System Settings → Privacy & Security → Calendars**. The helper requires Full Access to read existing events; it does not modify them.

5. Copy the example configuration for local customization:

   ```sh
   cp server/calendar-config.example.json server/calendar-config.local.json
   ```

   The default selects all calendars in sources named iCloud. For a renamed source, set `calendar.sourceIds` using the source identifiers from `--list-calendars`. Identifiers take precedence over names. The local configuration is ignored by Git.

6. Check once locally, then publish once:

   ```sh
   python3 server/calendar_sync.py
   python3 server/calendar_sync.py --publish
   ```

7. Start the updater at login:

   ```sh
   python3 server/calendar_sync.py --install-launch-agent
   ```

   Reinstall if the checkout or Python executable moves. To stop and remove the background job:

   ```sh
   python3 server/calendar_sync.py --uninstall-launch-agent
   ```

For a foreground run, use `python3 server/calendar_sync.py --watch --publish` and stop with Ctrl+C. Background polling requires the Mac to be awake and the user logged in.

## Configuration and operation

Defaults are in `calendar-config.example.json`; `calendar-config.local.json` takes precedence. An alternative file can be selected with `--config`.

- `calendar.sourceNames` and `calendar.sourceIds`: select iCloud sources. All calendars in the selected sources are read. Missing sources cause an error.
- `calendar.calendarNames`: optionally select individual calendars by their names in Calendar, for example `["Work", "Private"]`. Names are matched without case sensitivity within the selected sources; duplicate names include all matches. An empty list reads all calendars in those sources. A missing or renamed calendar stops the update rather than assuming free time. Keep this list in the ignored local configuration.
- `availability.weekdays`: Monday is 0, Saturday is 5. `startTime` and `endTime` use the 24-hour clock.
- `bufferBeforeMinutes` and `bufferAfterMinutes`: event buffers, defaulting to 30 minutes each.
- `minNoticeMinutes`: minimum notice before a trial can be requested.
- `weeks`: 1–4. `validityHours`: 1–48. The refresh interval plus one poll must be shorter than the validity period.
- `git.remote` and `git.branch`: publishing destination, defaulting to `origin` and `main`.
- The website expects Europe/Berlin, 45-minute trials and a 15-minute start grid.

Only `availability.json` is pushed. The publisher preserves other checkout changes, retries concurrent remote updates and never force-pushes. Calendar read failures retain the previous snapshot without renewing it; publishing failures retry on the next poll.

Local build files and logs are stored in ignored `.calendar-sync/`. Check `updater.log` and `updater-errors.log` there. For publishing failures, check network access, Git authentication and branch protection.

An enquiry does not reserve a lesson. Add confirmed lessons to Calendar so subsequent successful updates remove their buffered times from availability. The booking and contact pages recheck published availability before proceeding.

## Checks

Run from the repository root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
npm ci
npm test
```

Tests use synthetic events, temporary Git repositories and simulated form responses. They do not read calendars, publish changes or send enquiries.

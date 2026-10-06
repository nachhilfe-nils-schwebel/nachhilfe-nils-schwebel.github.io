# Calendar availability updater

This background updater belongs in the website folder on the Mac that will monitor the calendars. It reads **all calendars in the iCloud account(s)** through macOS Calendar, calculates free trials, and publishes **only `availability.json`**. The website remains a static GitHub Pages site; this Mac does not need to serve a web page or accept incoming connections.

## How times are calculated

The default schedule is Monday–Saturday, 15:30–19:00 in **Europe/Berlin**, over the four calendar weeks shown by the booking page. Each trial lasts 45 minutes.

1. Read all overlapping calendar occurrences, including recurring, all-day and overnight events. Cancelled events and events explicitly marked Free do not block time.
2. Expand each busy interval by **30 minutes before and 30 minutes after**, then merge overlapping intervals.
3. Subtract these intervals from the daily teaching window.
4. Round each remaining gap's start forward to the next 15-minute boundary, then pack 45-minute trials from that point until the gap is full. Past start times are removed.

For an event from **15:30 to 15:45**, the blocked interval becomes **15:00–16:15**. That day offers **16:15–17:00, 17:00–17:45 and 17:45–18:30**. There is no extra buffer between the alternative times offered to visitors; the buffer applies to events already in your calendar. Earliest-fit packing produces the maximum number of equal-length trials in each free gap.

The default poll is every **60 seconds**. Changed slots are published after a successful read. When nothing changes, the timestamp is renewed **once an hour**, avoiding a commit every minute. A snapshot expires after **two hours**; if the updater stops, the booking page stops offering stale times while direct contact remains available. GitHub Pages still has to deploy a pushed update, so changes are not instantaneous on the public site.

The website deploys through its custom Pages Actions workflow after changes reach `main`. The [branch-based ten-build-per-hour soft limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) does not apply to this workflow. Routine polling produces no commit or deployment when the slots are unchanged.

Private event titles, descriptions, attendees and calendar identifiers are never included in the public file. Calendar access failures preserve the last verified snapshot without renewing its timestamp. Git push failures retry on the next poll. Source changes, recurring events, time-zone changes and overlapping events are accounted for on every successful read.

## One-time setup on the other Mac

Requires macOS 13 or later, **Python 3.10+**, Git, and Apple's Xcode Command Line Tools. Building the native helper works on both Apple Silicon and Intel. Python uses its standard library; no Python packages are required. Node is only needed for website development tests.

1. Use the production website from `main`, with GitHub Pages set to **GitHub Actions**. The updater refuses to publish to a branch that does not contain the website yet.
2. Clone the repository into a local folder on the other Mac. Use a separate clone for this updater and run it on **one Mac only**. For example:

   ```sh
   git clone https://github.com/nachhilfe-nils-schwebel/nachhilfe-nils-schwebel.github.io.git "$HOME/Sites/nachhilfe"
   cd "$HOME/Sites/nachhilfe"
   ```

3. Sign in to iCloud and enable Calendar syncing on that Mac. Open Calendar and wait for the events to appear. The updater reads the locally synced Calendar database; it cannot verify whether iCloud's network sync has caught up.
4. Configure Git push authentication once for the **nachhilfe-nils-schwebel work account**. A credential helper or SSH key must work without an interactive prompt. The publisher inherits the checkout's push URL and local credential/HTTP/SSH settings, alongside normal global Git and SSH configuration. Keep tokens and passwords out of the calendar configuration and tracked files. The automatic Git author uses the work account's GitHub noreply address.
5. Build the helper. If Apple tools are missing, run `xcode-select --install` first.

   ```sh
   ./server/build-calendar-helper.sh
   python3 server/calendar_sync.py --list-calendars
   ```

   macOS will request Calendar access for **Tutoring Calendar**. Allow Full Access: EventKit requires this permission for reading existing events, although the helper only reads. Permission is managed in **System Settings → Privacy & Security → Calendars**. The listing shows local calendar/account names and IDs for setup only; do not commit its output.

6. The included configuration already selects every calendar in sources named iCloud. If the iCloud account has been renamed, copy the example to the ignored local configuration and set `calendar.sourceIds` to the corresponding source ID(s) from the listing:

   ```sh
   cp server/calendar-config.example.json server/calendar-config.local.json
   ```

   Source IDs take precedence over names. An empty calendar selection is deliberately not configurable: every calendar in the selected iCloud sources blocks availability. Missing sources cause an error instead of being treated as an empty calendar.

7. Check once locally, then check and publish once:

   ```sh
   python3 server/calendar_sync.py
   python3 server/calendar_sync.py --publish
   ```

   The first command updates the local `availability.json`; the second pushes a commit changing that file only. It leaves the checkout's branch, staged files and other work untouched. Publication uses the latest remote `main` as its parent and a normal fast-forward push. If the remote changes during publication, it retries from the newer version and preserves those changes. It never force-pushes.

8. After the one-time checks succeed, start it automatically in your logged-in user session:

   ```sh
   python3 server/calendar_sync.py --install-launch-agent
   ```

   This installs and starts `~/Library/LaunchAgents/local.nils.tutoring.calendar-sync.plist`, using this folder's absolute path and Python executable. It starts again at login. If you move the folder or replace Python, rerun the installation command. To stop and remove it:

   ```sh
   python3 server/calendar_sync.py --uninstall-launch-agent
   ```

For a foreground run instead, use `python3 server/calendar_sync.py --watch --publish` and stop with Ctrl+C. The job cannot poll while the Mac sleeps or the user is logged out. Keep the Mac awake when availability should stay current, and keep iCloud Calendar syncing enabled.

## Configuration and troubleshooting

`server/calendar-config.example.json` documents the defaults. `server/calendar-config.local.json` is ignored by Git and takes precedence. You can also pass `--config /absolute/path/to/config.json`.

- `availability.weekdays`: Monday is 0; Saturday is 5. `startTime` and `endTime` use the 24-hour clock.
- `bufferBeforeMinutes` and `bufferAfterMinutes`: currently 30 each.
- `minNoticeMinutes`: currently 0; increase it if you want advance notice before a visitor can request a trial (maximum 28 days). Each event buffer can be at most seven days.
- `weeks`: 1–4; `validityHours`: 1–48. `refreshMinutes` plus one poll must be shorter than the validity period.
- `git.branch`: defaults to `main`, the intended Pages publishing branch. GitHub branch protection must permit this account to push availability updates.
- The website contract fixes the time zone to Europe/Berlin, trial duration to 45 minutes and start grid to 15 minutes.

Local build files, publisher repository, lock and logs are under ignored `.calendar-sync/`. Background output is in `updater.log` and `updater-errors.log` there; it reports counts and controlled errors, not events. Git stderr is intentionally omitted because remote URLs can contain credentials. If publishing fails, check the account's write access, network and branch protection manually.

Calendar queries are read-only. **Sending a form is an enquiry, not a reservation.** Once you confirm a trial, add it to your calendar; the next successful sync removes its buffered time from the public availability. Several visitors can enquire about the same time before you confirm it.

The checked-in `availability.json` is empty and marked `unconfigured` until the first successful calendar read. No invented times are shown. The booking page refreshes when opened, when a visible tab returns, and every visible minute. Both continuing to contact and sending a selected-lesson enquiry recheck the newest published file.

## Verification

From the website root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
npm ci
npm test
```

The Python tests use synthetic busy intervals and temporary local Git repositories. The browser tests simulate calendar fetches and Web3Forms; they send no messages. These checks do not grant Calendar permission, read personal events or push to GitHub. Native helper compilation verifies the macOS code separately.

The native app/LaunchServices access pattern is adapted from the invoice project's Calendar integration. Relevant platform documentation: [EventKit read permission](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents(completion:)), [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Git commit-tree](https://git-scm.com/docs/git-commit-tree).

# Nachhilfe Nils Schwebel

A bilingual German / English website for private maths and physics tutoring for pupils in grades 5–12, in Leipzig and online. Built with plain HTML, CSS and JavaScript for GitHub Pages, with no build step.

## Preview

Run `python3 -m http.server 4173 --bind 127.0.0.1` from this folder, then open `http://127.0.0.1:4173/`. The trial selection is at `/booking.html` and the contact form at `/contact.html?direct=1`. `?lang=de` and `?lang=en` choose a language; the visible language switch carries it between pages.

## Content and prices

- Maths and physics tutoring, grades 5–12, in person or online.
- In person: €25 for 60 minutes, €32 for 90 minutes.
- Online: €22 for 60 minutes, €28 for 90 minutes.
- The first trial lesson is free and lasts 45 minutes.
- The introduction uses Nils’s supplied background: age 21, mathematics student, tutoring since 2022, small-group teaching at Sprachschule Nachhilfe Firstclass and Schülerhilfe, and private one-to-one tutoring for several years.
- The homepage uses `assets/portrait.jpg` and `assets/about.jpg`, compressed copies of the supplied portraits. Private image metadata is removed; orientation and colour profiles are preserved.

## Booking and contact

The booking page reads `availability.json`, the public result of a local iCloud Calendar updater. It shows free 45-minute trials within Monday–Saturday, 15:30–19:00 in Leipzig local time, accounting for 30-minute buffers before and after events. Calendar integration is implemented but must be activated on the other Mac; until then, the public file is empty and marked `unconfigured`.

Format, day and time selections enable **Continue to contact**. The selected lesson appears at the top of the contact page and accompanies the enquiry. Availability is rechecked before continuing and before submitting. An enquiry does not reserve a lesson: Nils confirms it personally and adds confirmed lessons to Calendar. Setup, polling, publishing and configuration are described in [server/README.md](server/README.md).

The contact page also accepts direct enquiries. Email or phone is required, together with a nonempty message. The form uses Web3Forms, configured in `contact-config.js` with the supplied access key. These keys are designed for public browser forms ([Web3Forms FAQ](https://docs.web3forms.com/getting-started/faq)).

Submissions use the [Web3Forms endpoint](https://docs.web3forms.com/getting-started/api-reference) and display success only after a successful HTTP response and `success: true`. Failed or unconfirmed requests retain the entered details. A hidden honeypot is included. No enquiry is sent automatically and no contact details are saved in browser storage. Language and selected lessons are carried in the navigation URL. The privacy page explains hosting and form processing.

## Files

- `index.html`: homepage, both portraits, introduction and pricing.
- `styles.css`, `site.js`: shared responsive layout, translations and language navigation.
- `booking.html`, `booking.css`, `booking.js`: trial selection from published availability, with loading/error states and direct contact.
- `availability.json`: the only public file changed by the Calendar updater; contains available dates/times, never event details.
- `availability.js`: shared schema validation, freshness checks and periodic fetching for booking and contact.
- `server/`: native read-only Calendar helper, scheduling algorithm and background Git publisher, with setup instructions.
- `lesson-selection.js`: validates and carries a selected trial to contact; direct contact clears a previous selection.
- `contact.html`, `contact.css`, `contact.js`: enquiry form, lesson card, validation and Web3Forms submission.
- `contact-config.js`: public Web3Forms access key.
- `imprint.html`, `privacy.html`, `legal.js`: bilingual provider details and privacy information, linked from every footer and the form.
- `scripts/build_site.py`: validates and packages an explicit public-file allowlist into `dist/`; local state, server code, tests and original photos are excluded.
- `.github/workflows/pages.yml`: verifies and deploys the public artifact after each push to `main`, including calendar availability updates.
- `assets/fonts/`: locally hosted DM Serif Display for main headings and DM Sans for text and controls, with their Open Font Licenses and source information.

## GitHub Pages

Production address: https://nachhilfe-nils-schwebel.github.io/.

Pages uses **GitHub Actions** as the publishing source. The workflow validates calendar and form behavior, prepares only public website files, and deploys after each push to `main`. It also runs checks on pull requests without publishing them. The website itself remains buildless static HTML/CSS/JavaScript; the packaging step controls which files become public.

## Calendar activation

Activate the Calendar updater on the other Mac using [server/README.md](server/README.md). Until its first successful publish, trial availability is empty and visitors are directed to contact. Calendar identifiers, private event details, local build files and credentials remain outside the public static repository. The updater pushes only `availability.json` to `main`; the workflow deploys the change automatically.

## Tests

Run `python3 -m unittest discover -s tests -p 'test_*.py'` for scheduling, Calendar bridge and isolated Git publishing checks. Run `npm ci` then `npm test` for browser logic tests (requires the Node version specified in `package.json`). The live website has no npm dependency or build step. Tests simulate form responses and do not send enquiries.

Run `python3 scripts/build_site.py` to validate and prepare the same public artifact used for deployment. Both portraits retain their displayed appearance after metadata removal. Earlier draft history may still contain original images; the production artifact excludes them.

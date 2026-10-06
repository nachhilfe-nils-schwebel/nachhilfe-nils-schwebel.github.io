# Nachhilfe Nils Schwebel

A lightweight bilingual (German / English) tutoring website for pupils in grades 5–12, in Leipzig and online. Built with plain HTML, CSS and JavaScript, ready for GitHub Pages without a build step.

## Preview

Run `python3 -m http.server 4173 --bind 127.0.0.1` from this folder, then open `http://127.0.0.1:4173/`. The separate booking page is at `/booking.html`. `?lang=de` and `?lang=en` select a language; the visible language switch preserves it between pages.

## Draft content

- €25/hour is an explicitly labelled example, awaiting the final pricing.
- The introduction and teaching approach are draft copy. No qualifications, subjects, testimonials or experience claims have been invented.
- The trial duration of 30 minutes is illustrative. The booking page uses generated sample slots and makes no real reservations. It collects no personal information and never reads the tutor’s calendar.
- `assets/avatar1.png` and `assets/avatar2.jpeg` are the supplied original images. The homepage uses `assets/portrait.jpg`, a compressed copy of avatar1.

## Files

- `index.html`: landing page, introduction, teaching approach and pricing.
- `styles.css`: shared responsive layout and visual style.
- `site.js`: common translations, language selection and navigation.
- `booking.html`, `booking.css`, `booking.js`: free trial booking preview. The sample availability provider is isolated for a future calendar integration.

## GitHub Pages

Intended address: https://nachhilfe-nils-schwebel.github.io/.

Once the draft is approved, merge the pull request, then choose **Settings → Pages → Deploy from a branch → main → / (root)** in this repository. `.nojekyll` makes the static files available directly. No hosting or deployment has been enabled as part of this draft.

## Before launch

Replace the illustrative rate and finalize lesson duration, subjects and biography. Add final contact details and the appropriate imprint/privacy pages. Connect an availability source and booking service before accepting actual trial lesson bookings. Publish only public availability; calendar access credentials and private event details must remain outside this static repository.

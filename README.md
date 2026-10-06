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
- `assets/avatar1.png` and `assets/avatar2.jpeg` are the supplied originals. The homepage uses compressed copies, `assets/portrait.jpg` and `assets/about.jpg`.

## Booking and contact

The booking page shows sample availability for four weeks, in Leipzig local time. Format, day and time selections enable **Continue to contact**. The selected lesson appears at the top of the contact page and accompanies the enquiry. Calendar integration is still pending, so these are sample times and sending an enquiry does not reserve a lesson.

The contact page also accepts direct enquiries. Email or phone is required, together with a nonempty message. The form uses Web3Forms, configured in `contact-config.js` with the supplied access key. These keys are designed for public browser forms ([Web3Forms FAQ](https://docs.web3forms.com/getting-started/faq)).

Submissions use the [Web3Forms endpoint](https://docs.web3forms.com/getting-started/api-reference) and display success only after a successful HTTP response and `success: true`. Failed or unconfirmed requests retain the entered details. A hidden honeypot is included. No enquiry is sent automatically and no contact details are saved in browser storage. Only the selected sample lesson is temporarily kept in the URL and session storage.

## Files

- `index.html`: homepage, both portraits, introduction and pricing.
- `styles.css`, `site.js`: shared responsive layout, translations and language navigation.
- `booking.html`, `booking.css`, `booking.js`: trial selection with an isolated sample availability provider for future calendar integration.
- `lesson-selection.js`: validates and carries a selected trial to contact; direct contact clears a previous selection.
- `contact.html`, `contact.css`, `contact.js`: enquiry form, lesson card, validation and Web3Forms submission.
- `contact-config.js`: public Web3Forms access key.
- `assets/fonts/`: locally hosted DM Serif Display for main headings and DM Sans for text and controls, with their Open Font Licenses and source information.

## GitHub Pages

Intended address: https://nachhilfe-nils-schwebel.github.io/.

After approving the draft, merge the pull request and select **Settings → Pages → Deploy from a branch → main → / (root)**. `.nojekyll` serves the static files directly. Hosting has not been enabled as part of this draft.

## Before launch

Finalize the biography, add the imprint/privacy pages, and replace the sample availability with the planned calendar integration. Calendar credentials and private event details must remain outside the public static repository.

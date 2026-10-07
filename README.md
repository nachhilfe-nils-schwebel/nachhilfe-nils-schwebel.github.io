# Tutoring website

Bilingual static website built with HTML, CSS and JavaScript. It includes a homepage, trial lesson selection, a contact form and legal pages.

## Local preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/`. Use `?lang=de` or `?lang=en` to select the language. Trial selection is at `booking.html`; direct contact is at `contact.html?direct=1`.

## Configuration

- Edit page content and translations in the HTML files and their corresponding JavaScript files.
- Set the public Web3Forms access key in `contact-config.js` to connect the contact form.
- The booking page reads `availability.json`. The [calendar updater](server/README.md) generates this file from calendar availability.
- Trial enquiries require personal confirmation; submitting the form does not reserve a time.

## Checks and deployment

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
npm ci
npm test
python3 scripts/build_site.py
```

Node requirements are listed in `package.json`. Tests use synthetic calendar data and simulated form responses.

The packaging script validates and copies the public website files into `dist/`. Set GitHub Pages to use **GitHub Actions**. The workflow checks and deploys changes pushed to `main`; pull requests run checks without deploying. The published website has no npm runtime dependency.

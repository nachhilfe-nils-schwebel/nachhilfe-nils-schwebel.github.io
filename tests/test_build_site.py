"""Production packaging tests with synthetic public pages and private files."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from scripts.build_site import BuildError, build_site


HTML_FILES = ("index.html", "booking.html", "contact.html", "imprint.html", "privacy.html")
SCRIPT_FILES = (
    "site.js", "booking.js", "contact.js", "availability.js", "lesson-selection.js", "contact-config.js", "legal.js",
)
STYLE_FILES = ("styles.css", "booking.css", "contact.css")
FONT_FILES = (
    "dm-sans-latin.woff2", "dm-serif-display-latin.woff2", "DM-Sans-OFL.txt", "DM-Serif-Display-OFL.txt", "README.md",
)


def unconfigured():
    return {
        "schemaVersion": 1, "status": "unconfigured", "isDemo": False,
        "timeZone": "Europe/Berlin", "durationMinutes": 45, "stepMinutes": 15,
        "generatedAt": None, "validUntil": None,
        "windowStart": "2026-10-05", "windowEnd": "2026-11-02", "slots": [],
    }


class BuildSiteTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="site-build-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "website"
        self.root.mkdir()
        for filename in HTML_FILES:
            self.write(filename, """<!doctype html><html lang="de"><head>
              <link rel="stylesheet" href="styles.css">
              <script src="site.js" defer></script>
              <link rel="icon" href="/assets/favicon.svg">
            </head><body><main id="main">
              <a href="./?lang=en#about">About</a><a href="contact.html?direct=1&amp;lang=de#form">Contact</a>
              <a href="imprint.html">Imprint</a><a href="privacy.html">Privacy</a>
              <img src="assets/portrait.jpg" alt="Portrait"><section id="about">Nils</section>
              <form id="form"><input placeholder="Your email address"></form>
            </main></body></html>""")
        for filename in SCRIPT_FILES:
            self.write(filename, "'use strict';\n")
        self.write("styles.css", """@font-face { font-family: Sans; src: url('assets/fonts/dm-sans-latin.woff2'); }
            @font-face { font-family: Serif; src: url(\"assets/fonts/dm-serif-display-latin.woff2\"); }
            body { background-image: url(/assets/about.jpg); }""")
        self.write("booking.css", "/* A discarded example: url(private-draft.jpg) */\nmain { color: navy; }\n")
        self.write("contact.css", "main { color: navy; }\n")
        self.write("availability.json", json.dumps(unconfigured()))
        self.write("robots.txt", "User-agent: *\nAllow: /\nSitemap: https://nachhilfe-nils-schwebel.github.io/sitemap.xml\n")
        self.write("sitemap.xml", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://nachhilfe-nils-schwebel.github.io/</loc></url></urlset>')
        self.write(".nojekyll", "")
        self.write("assets/portrait.jpg", b"public portrait")
        self.write("assets/about.jpg", b"public about portrait")
        self.write("assets/favicon.svg", '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        for filename in FONT_FILES:
            self.write(f"assets/fonts/{filename}", b"public font or license")

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")
        return path

    def public_files(self, output):
        return {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()}

    def source_hashes(self):
        return {
            path.relative_to(self.root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in self.root.rglob("*") if path.is_file() and "dist" not in path.relative_to(self.root).parts
        }

    def test_build_contains_only_deliberate_public_files_and_does_not_change_sources(self):
        private = (
            "assets/avatar1.png", "assets/avatar2.jpeg", "server/calendar-config.local.json",
            "server/calendar_sync.py", ".calendar-sync/private-calendar.json", ".git/config",
            ".env", "secrets.js", "package.json", "package-lock.json", "node_modules/library.js",
            "tests/personal-calendar-fixture.json", "README.md", "assets/fonts/secret-token.txt",
        )
        for name in private:
            self.write(name, "DO-NOT-PUBLISH-SENSITIVE-CONTENT")
        before = self.source_hashes()
        output = build_site(self.root)
        expected = set(HTML_FILES + SCRIPT_FILES + STYLE_FILES) | {
            "availability.json", "robots.txt", "sitemap.xml", ".nojekyll",
            "assets/portrait.jpg", "assets/about.jpg", "assets/favicon.svg",
        } | {f"assets/fonts/{name}" for name in FONT_FILES}
        self.assertEqual(self.public_files(output), expected)
        for file in output.rglob("*"):
            if file.is_file():
                self.assertNotIn(b"DO-NOT-PUBLISH", file.read_bytes())
        self.assertEqual(self.source_hashes(), before)

    def test_all_five_pages_and_required_assets_must_exist(self):
        for filename in ("privacy.html", "legal.js", "assets/about.jpg", "assets/fonts/dm-sans-latin.woff2", "robots.txt"):
            path = self.root / filename
            original = path.read_bytes()
            path.unlink()
            with self.subTest(filename=filename), self.assertRaisesRegex(BuildError, "Required public file"):
                build_site(self.root)
            path.write_bytes(original)

    def test_links_resolve_query_language_anchors_absolute_and_relative_paths(self):
        output = build_site(self.root)
        self.assertTrue((output / "contact.html").is_file())
        self.assertIn("?direct=1&amp;lang=de#form", (output / "booking.html").read_text())
        self.assertEqual(json.loads((output / "availability.json").read_text())["status"], "unconfigured")

    def test_missing_linked_resource_fails_instead_of_copying_unlisted_private_file(self):
        self.write("private.txt", "secret")
        self.write("index.html", '<html><body><a href="private.txt">Private link</a></body></html>')
        with self.assertRaisesRegex(BuildError, "Missing local resource"):
            build_site(self.root)
        self.assertFalse((self.root / "dist").exists())

    def test_missing_cross_page_anchor_fails(self):
        self.write("index.html", '<html><body><a href="contact.html?lang=de#missing">Contact</a></body></html>')
        with self.assertRaisesRegex(BuildError, "Missing local anchor"):
            build_site(self.root)

    def test_url_cannot_escape_the_public_package(self):
        self.write("index.html", '<html><body><a href="../outside.txt">Outside</a></body></html>')
        with self.assertRaisesRegex(BuildError, "leaves the public site"):
            build_site(self.root)

    def test_external_urls_data_images_and_form_placeholders_are_allowed(self):
        self.write("privacy.html", """<html><body>
          <a href="https://example.invalid/missing">External policy</a><a href="mailto:nils@example.invalid">Email</a>
          <img src="data:image/svg+xml;base64,PHN2Zz4=" alt="Inline">
          <input placeholder="Your email address"><p>Ordinary finished copy.</p>
        </body></html>""")
        self.assertTrue(build_site(self.root).is_dir())

    def test_css_urls_and_imports_must_resolve_but_comments_are_ignored(self):
        self.write("contact.css", "@import 'booking.css'; main { background: url(assets/missing.jpg); }")
        with self.assertRaisesRegex(BuildError, "Missing local resource"):
            build_site(self.root)
        self.write("contact.css", "@import 'booking.css'; /* url(assets/missing.jpg) */")
        self.assertTrue(build_site(self.root).is_dir())

    def test_draft_footer_and_unfinished_copy_fail(self):
        for content in (
            '<footer data-i18n="footer.draft">Website</footer>',
            "<footer>Website-Entwurf</footer>", "<footer>Website draft</footer>",
            "<p>[YOUR ADDRESS]</p>", "<p>TODO: write the policy</p>",
            "<p>YOUR_EMAIL</p>", "<p>INSERT_ADDRESS</p>", "<p>REPLACE_ACCESS_KEY</p>",
        ):
            with self.subTest(content=content):
                self.write("imprint.html", f"<html><body>{content}</body></html>")
                with self.assertRaisesRegex(BuildError, "Draft|placeholder"):
                    build_site(self.root)

    def test_finished_privacy_copy_about_your_email_is_not_a_template_marker(self):
        self.write("privacy.html", """<!doctype html><html lang="en"><body>
          <p>I process your email address and/or phone number, message and any selected
             lesson time and format to answer your enquiry.</p>
          <p>Your email address is used to reply. You can replace email contact with a
             phone number if you prefer.</p>
        </body></html>""")
        output = build_site(self.root)
        self.assertIn("your email address", (output / "privacy.html").read_text())

    def test_source_file_and_font_symlinks_are_rejected(self):
        external = Path(self.temporary.name) / "outside-private.jpg"
        external.write_bytes(b"private linked content")
        for filename in ("assets/portrait.jpg", "assets/fonts/dm-sans-latin.woff2"):
            path = self.root / filename
            original = path.read_bytes()
            path.unlink()
            path.symlink_to(external)
            with self.subTest(filename=filename), self.assertRaisesRegex(BuildError, "Symlinks"):
                build_site(self.root)
            path.unlink()
            path.write_bytes(original)

    def test_output_symlink_cannot_overwrite_another_directory(self):
        external = Path(self.temporary.name) / "outside-output"
        external.mkdir()
        protected = external / "private.txt"
        protected.write_text("keep this")
        (self.root / "dist").symlink_to(external, target_is_directory=True)
        with self.assertRaisesRegex(BuildError, "dist output"):
            build_site(self.root)
        self.assertEqual(protected.read_text(), "keep this")

    def test_clean_rebuild_removes_stale_files_and_failed_rebuild_preserves_previous_artifact(self):
        output = build_site(self.root)
        (output / "old-file.js").write_text("stale")
        (output / "old-private-folder").mkdir()
        (output / "old-private-folder/private.txt").write_text("stale")
        self.write("contact.js", "'use strict'; // Current public version\n")
        build_site(self.root)
        self.assertFalse((output / "old-file.js").exists())
        self.assertFalse((output / "old-private-folder").exists())
        self.assertIn("Current public version", (output / "contact.js").read_text())
        previous = (output / "imprint.html").read_bytes()
        self.write("imprint.html", "<html><body>[YOUR ADDRESS]</body></html>")
        with self.assertRaises(BuildError):
            build_site(self.root)
        self.assertEqual((output / "imprint.html").read_bytes(), previous)
        self.assertEqual(list(self.root.glob(".site-build-*")), [])

    def test_unconfigured_calendar_is_valid_but_cannot_contain_made_up_or_private_slots(self):
        self.assertTrue(build_site(self.root).is_dir())
        for mutation in (
            {"slots": [{"date": "2026-10-05", "time": "15:30"}]},
            {"generatedAt": "2026-10-05T08:00:00Z"}, {"eventTitle": "Private calendar appointment"},
            {"isDemo": True}, {"durationMinutes": 30},
        ):
            self.write("availability.json", json.dumps({**unconfigured(), **mutation}))
            with self.subTest(mutation=mutation), self.assertRaisesRegex(BuildError, "Invalid public availability"):
                build_site(self.root)

    def test_ready_calendar_schema_is_allowed_and_private_slot_fields_are_rejected(self):
        ready = {
            **unconfigured(), "status": "ready", "generatedAt": "2026-10-05T08:00:00Z",
            "validUntil": "2026-10-05T10:00:00Z", "slots": [{"date": "2026-10-05", "time": "15:30"}],
        }
        self.write("availability.json", json.dumps(ready))
        self.assertTrue(build_site(self.root).is_dir())
        ready["slots"][0]["privateEvent"] = "Confidential"
        self.write("availability.json", json.dumps(ready))
        with self.assertRaisesRegex(BuildError, "Only public slot fields"):
            build_site(self.root)

    def test_ready_calendar_requires_real_dates_unique_grid_times_and_valid_expiry(self):
        base = {
            **unconfigured(), "status": "ready", "generatedAt": "2026-10-05T08:00:00Z",
            "validUntil": "2026-10-05T10:00:00Z", "slots": [],
        }
        for mutation in (
            {"windowStart": "2026-02-30"}, {"validUntil": "2026-10-05T08:00:00Z"},
            {"slots": [{"date": "2026-11-02", "time": "15:30"}]},
            {"slots": [{"date": "2026-10-05", "time": "15:31"}]},
            {"slots": [{"date": "2026-10-05", "time": "15:30"}] * 2},
        ):
            self.write("availability.json", json.dumps({**base, **mutation}))
            with self.subTest(mutation=mutation), self.assertRaisesRegex(BuildError, "Invalid public availability"):
                build_site(self.root)


if __name__ == "__main__":
    unittest.main()

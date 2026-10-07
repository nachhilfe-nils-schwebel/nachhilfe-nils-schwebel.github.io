#!/usr/bin/env python3
"""Package and verify the public GitHub Pages files, using only the stdlib."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import struct
import sys
import tempfile
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_HTML = ("index.html", "booking.html", "contact.html", "imprint.html", "privacy.html")
PUBLIC_ROOT_FILES = PUBLIC_HTML + (
    "styles.css", "booking.css", "contact.css",
    "site.js", "booking.js", "contact.js", "availability.js", "lesson-selection.js",
    "contact-config.js", "legal.js",
    "availability.json", "robots.txt", "sitemap.xml", ".nojekyll",
)
PUBLIC_ASSETS = ("assets/portrait.jpg", "assets/about.jpg", "assets/lessons.jpg", "assets/favicon.svg")
REQUIRED_FONT_FILES = (
    "assets/fonts/dm-sans-latin.woff2", "assets/fonts/dm-serif-display-latin.woff2",
    "assets/fonts/DM-Sans-OFL.txt", "assets/fonts/DM-Serif-Display-OFL.txt", "assets/fonts/README.md",
)
_CSS_URL = re.compile(r"url\(\s*(?:'([^']*)'|\"([^\"]*)\"|([^)]*?))\s*\)", re.IGNORECASE)
_CSS_IMPORT = re.compile(r"@import\s+['\"]([^'\"]+)['\"]", re.IGNORECASE)
_DRAFT_TEXT = re.compile(
    r"Website[\s-]*Entwurf|Website\s+draft|\bTODO\b|\bTBD\b|"
    r"\[(?:[^\]]*\b(?:placeholder|einfügen|insert|your|deine?|adresse|address|e-mail|email)\b[^\]]*)\]|"
    # Unbracketed template markers use literal capitals; ordinary privacy prose
    # such as "your email address" is complete copy, not a placeholder.
    r"(?-i:\b(?:YOUR|INSERT|REPLACE)[_ -]+(?:NAME|EMAIL|ADDRESS|ACCESS[_ -]?KEY)\b)",
    re.IGNORECASE,
)


class BuildError(RuntimeError):
    """A public artifact cannot be built safely from the current source files."""


def _regular_file(root: Path, relative: str) -> Path:
    path = root / relative
    cursor = root
    for part in Path(relative).parts:
        cursor /= part
        if cursor.is_symlink():
            raise BuildError(f"Symlinks are not allowed in public files: {relative}")
    if not path.is_file():
        raise BuildError(f"Required public file is missing: {relative}")
    return path


def _manifest(root: Path) -> list[str]:
    # Extensions do not prove a file is public. Include only reviewed assets,
    # including the exact font files and accompanying license/source documents.
    files = set(PUBLIC_ROOT_FILES + PUBLIC_ASSETS + REQUIRED_FONT_FILES)
    for relative in files:
        _regular_file(root, relative)
    return sorted(files)


def _css_references(css: str) -> list[str]:
    clean = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    references = [next(value for value in match.groups() if value is not None).strip() for match in _CSS_URL.finditer(clean)]
    references.extend(_CSS_IMPORT.findall(clean))
    return references


class _Document(HTMLParser):
    def __init__(self, content: str, filename: str):
        super().__init__(convert_charrefs=True)
        self.filename = filename
        self.references: list[str] = []
        self.ids: set[str] = set()
        self.visible: list[str] = []
        self._hidden_depth = 0
        self._in_style = False
        self.feed(content)
        self.close()
        if _DRAFT_TEXT.search(" ".join(self.visible)):
            raise BuildError(f"Draft text or unfinished placeholder in {filename}")

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag in {"script", "style"}:
            self._hidden_depth += 1
        if tag == "style":
            self._in_style = True
        if tag == "base":
            raise BuildError(f"HTML base URLs are not supported in {self.filename}")
        for name, value in attrs:
            if value is None:
                continue
            if name in {"href", "src", "poster", "action"} and value.strip():
                self.references.append(value.strip())
            elif name == "srcset" and not value.lstrip().startswith("data:"):
                self.references.extend(candidate.strip().split()[0] for candidate in value.split(",") if candidate.strip())
            elif name == "style":
                self.references.extend(_css_references(value))
            if name.startswith("data-") and "i18n" in name and value == "footer.draft":
                raise BuildError(f"Draft footer in {self.filename}")
        identifier = attributes.get("id") or (attributes.get("name") if tag == "a" else None)
        if identifier:
            if identifier in self.ids:
                raise BuildError(f"Duplicate HTML anchor {identifier!r} in {self.filename}")
            self.ids.add(identifier)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self._hidden_depth = max(0, self._hidden_depth - 1)
        if tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.references.extend(_css_references(data))
        if not self._hidden_depth:
            self.visible.append(data)


def _validate_reference(root: Path, document: Path, reference: str, documents: dict[Path, _Document]):
    try:
        parsed = urlsplit(reference)
    except ValueError as error:
        raise BuildError(f"Invalid URL in {document.relative_to(root)}: {reference}") from error
    if parsed.scheme or parsed.netloc:
        return  # External links, data images, mailto and tel need no local file.
    path = unquote(parsed.path)
    if not path:
        target = document
    elif path.startswith("/"):
        target = root / path.lstrip("/")
    else:
        target = document.parent / path
    target = target.resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise BuildError(f"Local URL leaves the public site in {document.relative_to(root)}: {reference}") from None
    if target.is_dir():
        target /= "index.html"
    if not target.is_file():
        raise BuildError(f"Missing local resource in {document.relative_to(root)}: {reference}")
    if parsed.fragment and target.suffix.lower() == ".html":
        if target not in documents or unquote(parsed.fragment) not in documents[target].ids:
            raise BuildError(f"Missing local anchor in {document.relative_to(root)}: {reference}")


def _civil_date(value) -> date:
    if not isinstance(value, str):
        raise ValueError("Expected a calendar date")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Expected a canonical calendar date")
    return parsed


def _utc_instant(value) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z", value
    ):
        raise ValueError("Expected a UTC timestamp")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _validate_availability(path: Path):
    public_keys = {
        "schemaVersion", "status", "isDemo", "timeZone", "durationMinutes", "stepMinutes",
        "generatedAt", "validUntil", "windowStart", "windowEnd", "slots",
    }
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or set(value) != public_keys:
            raise ValueError("Only public availability fields are allowed")
        if (
            type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1
            or value["status"] not in {"ready", "unconfigured"}
            or value["isDemo"] is not False or value["timeZone"] != "Europe/Berlin"
            or type(value["durationMinutes"]) is not int or value["durationMinutes"] != 45
            or type(value["stepMinutes"]) is not int or value["stepMinutes"] != 15
            or not isinstance(value["slots"], list) or len(value["slots"]) > 1000
        ):
            raise ValueError("Incompatible availability schema")
        start, end = _civil_date(value["windowStart"]), _civil_date(value["windowEnd"])
        if not 0 < (end - start).days <= 28:
            raise ValueError("Invalid availability window")
        if value["status"] == "unconfigured":
            if value["generatedAt"] is not None or value["validUntil"] is not None or value["slots"]:
                raise ValueError("Unconfigured availability must not offer slots")
        else:
            generated, expiry = _utc_instant(value["generatedAt"]), _utc_instant(value["validUntil"])
            if not timedelta(0) < expiry - generated <= timedelta(hours=48):
                raise ValueError("Invalid availability freshness")
        seen = set()
        for slot in value["slots"]:
            if not isinstance(slot, dict) or set(slot) != {"date", "time"}:
                raise ValueError("Only public slot fields are allowed")
            day = _civil_date(slot["date"])
            if not start <= day < end or not isinstance(slot["time"], str) or not re.fullmatch(
                r"(?:[01]\d|2[0-3]):(?:00|15|30|45)", slot["time"]
            ):
                raise ValueError("Invalid slot")
            key = (slot["date"], slot["time"])
            if key in seen:
                raise ValueError("Duplicate slot")
            seen.add(key)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError):
        # Parser exceptions can quote a bad date/value or local filesystem path.
        # Keep invalid calendar content out of public CI/build error messages.
        raise BuildError("Invalid public availability.json; check its public schema, dates and timestamps.") from None


def _validate_exif(payload: bytes):
    """Allow the reviewed display tags, never camera/descriptive EXIF data."""
    tiff = payload[6:]
    if len(tiff) < 8 or tiff[:2] not in {b"II", b"MM"}:
        raise ValueError("Invalid EXIF header")
    endian = "<" if tiff[:2] == b"II" else ">"
    if struct.unpack_from(endian + "H", tiff, 2)[0] != 42:
        raise ValueError("Invalid EXIF header")
    # Public photos were reviewed: about.jpg requires Orientation (0x0112)
    # and YCbCrPositioning (0x0213); the other photos need no EXIF. ICC color profiles
    # are separate JPEG chunks. All other EXIF requires an explicit new review.
    offset = struct.unpack_from(endian + "I", tiff, 4)[0]
    if offset != 8 or offset + 2 > len(tiff):
        raise ValueError("Unreviewed EXIF directory")
    count = struct.unpack_from(endian + "H", tiff, offset)[0]
    limit = offset + 2 + count * 12
    if limit + 4 != len(tiff):
        raise ValueError("Unreviewed EXIF content")
    seen = set()
    for index in range(count):
        entry = offset + 2 + index * 12
        tag, kind, amount = struct.unpack_from(endian + "HHI", tiff, entry)
        if tag not in {0x0112, 0x0213} or kind != 3 or amount != 1 or tag in seen:
            raise ValueError("Descriptive or unreviewed EXIF tag")
        seen.add(tag)
        value = struct.unpack_from(endian + "H", tiff, entry + 8)[0]
        if tiff[entry + 10:entry + 12] != b"\0\0":
            raise ValueError("Unreviewed EXIF content")
        if tag == 0x0112 and not 1 <= value <= 8:
            raise ValueError("Invalid orientation")
        if tag == 0x0213 and value not in (1, 2):
            raise ValueError("Invalid color structure")
    # Extra/thumbnail directories can retain an uncropped original image or
    # stale metadata. They are unnecessary for the public display assets.
    if struct.unpack_from(endian + "I", tiff, limit)[0] != 0:
        raise ValueError("Unreviewed EXIF directory")


def _validate_photo(path: Path, relative: str):
    """Check JPEG metadata without recompressing pixels or dropping orientation."""
    try:
        data = path.read_bytes()
        if not data.startswith(b"\xff\xd8"):
            raise ValueError("Invalid JPEG")
        cursor, scan = 2, False
        while cursor < len(data):
            if scan:
                cursor = data.find(b"\xff", cursor)
                if cursor < 0:
                    raise ValueError("Invalid JPEG")
            elif data[cursor] != 0xFF:
                raise ValueError("Invalid JPEG marker")
            while cursor < len(data) and data[cursor] == 0xFF:
                cursor += 1
            if cursor >= len(data):
                raise ValueError("Invalid JPEG marker")
            marker = data[cursor]
            cursor += 1
            if scan and (marker == 0 or 0xD0 <= marker <= 0xD7):
                continue
            if marker == 0xD9:
                if cursor != len(data):
                    raise ValueError("Unreviewed trailing data")
                return
            if marker in {0xD8, 0} or cursor + 2 > len(data):
                raise ValueError("Invalid JPEG marker")
            if marker == 1:
                continue
            length = int.from_bytes(data[cursor:cursor + 2], "big")
            if length < 2 or cursor + length > len(data):
                raise ValueError("Invalid JPEG segment")
            payload = data[cursor + 2:cursor + length]
            if marker == 0xE1:
                if not payload.startswith(b"Exif\0\0"):
                    raise ValueError("Unreviewed EXIF/XMP metadata")
                _validate_exif(payload)
            elif marker == 0xED or marker == 0xFE:
                raise ValueError("IPTC or comment metadata")
            elif 0xE0 <= marker <= 0xEF:
                if not (
                    (marker == 0xE0 and payload.startswith(b"JFIF\0") and len(payload) == 14 and payload[-2:] == b"\0\0")
                    or (marker == 0xE2 and payload.startswith(b"ICC_PROFILE\0"))
                    or (marker == 0xEE and payload.startswith(b"Adobe") and len(payload) == 12)
                ):
                    raise ValueError("Unreviewed photo metadata")
            cursor += length
            scan = marker == 0xDA
        raise ValueError("Invalid JPEG end")
    except (OSError, ValueError, struct.error):
        raise BuildError(f"Invalid or sensitive photo metadata in {relative}; retain only orientation and color structure.") from None


def _verify_public_files(root: Path, files: list[str]):
    documents: dict[Path, _Document] = {}
    for relative in PUBLIC_HTML:
        path = root / relative
        try:
            documents[path] = _Document(path.read_text(encoding="utf-8"), relative)
        except (OSError, UnicodeError) as error:
            raise BuildError(f"Cannot read public HTML: {relative}") from error
    for path, parsed in documents.items():
        for reference in parsed.references:
            _validate_reference(root, path, reference, documents)
    for relative in files:
        if relative.endswith(".css"):
            path = root / relative
            try:
                css = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as error:
                raise BuildError(f"Cannot read public CSS: {relative}") from error
            for reference in _css_references(css):
                _validate_reference(root, path, reference, documents)
    _validate_availability(root / "availability.json")
    for relative in PUBLIC_ASSETS:
        if relative.endswith(".jpg"):
            _validate_photo(root / relative, relative)


def build_site(source_root: Path = ROOT) -> Path:
    source = Path(source_root)
    if source.is_symlink():
        raise BuildError("The source website directory must not be a symlink")
    source = source.resolve()
    if not source.is_dir():
        raise BuildError("The source website directory does not exist")
    destination = source / "dist"
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise BuildError("The dist output must be a regular directory, not a symlink or file")
    files = _manifest(source)
    # Verify a temporary package before replacing dist, so failed builds leave
    # the previous artifact and all website source files unchanged.
    with tempfile.TemporaryDirectory(prefix=".site-build-", dir=source) as temporary:
        staging = Path(temporary)
        for relative in files:
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(_regular_file(source, relative), target)
        _verify_public_files(staging, files)
        if destination.exists():
            shutil.rmtree(destination)
        staging.rename(destination)
    return destination


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT, help="Website source folder (defaults to this repository).")
    args = parser.parse_args(argv)
    try:
        output = build_site(args.source)
    except BuildError as error:
        print(f"Site build failed: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("Site build failed: cannot access the website files or output folder.", file=sys.stderr)
        return 1
    count = sum(path.is_file() for path in output.rglob("*"))
    print(f"Built {count} public files in dist/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

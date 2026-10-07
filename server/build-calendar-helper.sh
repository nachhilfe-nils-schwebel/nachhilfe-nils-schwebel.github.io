#!/bin/zsh
set -euo pipefail
calendar_server_dir="${0:A:h}"
calendar_repo_root="${calendar_server_dir:h}"
calendar_output_dir="$calendar_repo_root/.calendar-sync"
mkdir -p "$calendar_output_dir"
chmod 700 "$calendar_output_dir"
calendar_build_dir=$(mktemp -d "$calendar_output_dir/.build.XXXXXX")
trap 'rm -rf "$calendar_build_dir"' EXIT
calendar_helper_app="$calendar_build_dir/Tutoring Calendar.app"
mkdir -p "$calendar_helper_app/Contents/MacOS"
cp "$calendar_server_dir/CalendarHelper-Info.plist" "$calendar_helper_app/Contents/Info.plist"
# The other Mac can be Apple Silicon or Intel; neither needs a Swift runtime install.
for calendar_architecture in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -O -parse-as-library \
    -target "$calendar_architecture-apple-macosx13.0" -framework EventKit -framework AppKit \
    "$calendar_server_dir/CalendarHelper.swift" -o "$calendar_build_dir/calendar-$calendar_architecture"
done
xcrun lipo -create "$calendar_build_dir/calendar-arm64" "$calendar_build_dir/calendar-x86_64" \
  -output "$calendar_helper_app/Contents/MacOS/tutoring-calendar"
# iCloud/Finder may attach resource metadata to generated files; codesign rejects it.
/usr/bin/xattr -cr "$calendar_helper_app"
# Keep a stable app identity for Calendar privacy settings across local rebuilds.
codesign --force --sign - --identifier local.nils.tutoring.calendar \
  --requirements '=designated => identifier "local.nils.tutoring.calendar"' "$calendar_helper_app"
codesign --verify --strict "$calendar_helper_app"
rm -rf "$calendar_output_dir/Tutoring Calendar.app"
mv "$calendar_helper_app" "$calendar_output_dir/Tutoring Calendar.app"
print "Built Tutoring Calendar for macOS 13+ (Apple Silicon and Intel)."

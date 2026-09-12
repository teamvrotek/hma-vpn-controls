#!/bin/bash
set -euo pipefail

native_dir="$(cd "$(dirname "$0")" && pwd)"
output="${1:-$native_dir/../com.teamvrotek.hmacontrols.sdPlugin/bin/hma-bridge}"
mkdir -p "$(dirname "$output")"
build_temp="$(mktemp -d)"
trap 'rm -rf "$build_temp"' EXIT

for architecture in arm64 x86_64; do
    xcrun swiftc -O -target "$architecture-apple-macos13.0" \
        "$native_dir/StatusModel.swift" "$native_dir/HMAAccessibility.swift" "$native_dir/main.swift" \
        -o "$build_temp/hma-bridge-$architecture"
done
xcrun lipo -create "$build_temp/hma-bridge-arm64" "$build_temp/hma-bridge-x86_64" -output "$output"
/usr/bin/codesign --force --sign - --identifier com.vrotek.hma-controls.bridge "$output"
printf 'Built %s\n' "$output"

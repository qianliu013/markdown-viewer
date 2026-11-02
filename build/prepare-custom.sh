#!/bin/sh
# Fast local setup: reuse upstream's pinned, prebuilt dependencies, not its code.
set -eu
cd "$(dirname "$0")/.."
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
archive="$tmpdir/upstream.zip"
if [ "$#" -gt 0 ]; then
  cp "$1" "$archive"
else
  curl --fail --location --retry 3 \
    https://github.com/simov/markdown-viewer/releases/download/5.3/markdown-viewer-v5.3.zip \
    --output "$archive"
fi
echo "dd44263640b7dd83314dd1bbc50b3e150a53424bacc3f29b1df7cbda43ecc593  $archive" | shasum -a 256 -c -
unzip -q "$archive" 'markdown-viewer/vendor/*' 'markdown-viewer/themes/*' -d "$tmpdir"
mkdir -p vendor themes
cp -R "$tmpdir/markdown-viewer/vendor/." vendor/
cp -R "$tmpdir/markdown-viewer/themes/." themes/
sh build/custom-themes.sh
cp manifest.chrome.json manifest.json
echo 'Ready: load this repository directory as an unpacked Chrome extension.'

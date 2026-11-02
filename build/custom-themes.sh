#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p themes
# Source CSS (including attribution) is tracked; generated themes/ is disposable.
cp custom-themes/*.css themes/

#!/usr/bin/env sh
# Minimum pre-release check: unit/smoke tests + production build.
set -eu
cd "$(dirname "$0")/.."
npm test
npm run build
echo "check ok"

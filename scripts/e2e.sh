#!/bin/sh
# Builds the app and checks the main flows in a Pixel 7-sized Chromium, inside
# the official Playwright Docker image with networking turned off. The app is
# served inside the container only. Screenshots and report.txt go to
# test-results/. Needs Docker.
set -eu
cd "$(dirname "$0")/.."

version=$(node -p "require('playwright-core/package.json').version")
BASE_PATH=/sanso/ npm run build
mkdir -p test-results
rm -f test-results/*.png test-results/report.txt

status=0
docker run --rm --network none --init --shm-size=1g \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:/work:ro" -v "$PWD/dist:/dist:ro" -v "$PWD/test-results:/out" \
  -w /work "mcr.microsoft.com/playwright:v$version-noble" node e2e/run.cjs || status=$?

cat test-results/report.txt
exit "$status"

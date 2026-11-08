#!/usr/bin/env bash
# Runs every build step via `bash` explicitly so it works even if the executable bit was lost (e.g. web upload to GitHub).
set -euo pipefail
cd "$(dirname "$0")"
bash ./fetch-upstream.sh
bash ./build-qemu-wasm.sh
bash ./build-linux-guest.sh
bash ./package-engine.sh
bash ./vendor-xterm.sh
echo "Done. Serve with: python3 scripts/serve.py   then open /diagnostics.html and /lab.html"

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
./fetch-upstream.sh && ./build-qemu-wasm.sh && ./build-linux-guest.sh && ./package-engine.sh && ./vendor-xterm.sh
echo "Done. Serve with: python3 scripts/serve.py   then open /diagnostics.html and /lab.html"

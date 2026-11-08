#!/usr/bin/env bash
# Vendor xterm.js and xterm-pty into ./vendor/ so every asset is same-origin (COEP require-corp blocks unpkg unless it sends CORP).
set -euo pipefail
cd "$(dirname "$0")/.."; . scripts/versions.env
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
( cd "$T" && npm init -y >/dev/null && npm i --ignore-scripts "xterm@$XTERM_VERSION" "xterm-pty@$XTERM_PTY_VERSION" >/dev/null )
mkdir -p vendor
cp "$T/node_modules/xterm/lib/xterm.js" vendor/xterm.js
cp "$T/node_modules/xterm/css/xterm.css" vendor/xterm.css
cp "$T/node_modules/xterm-pty/index.js" vendor/xterm-pty.js
cp "$T/node_modules/xterm/LICENSE" vendor/LICENSE.xterm
cp "$T/node_modules/xterm-pty/LICENSE" vendor/LICENSE.xterm-pty 2>/dev/null || true
ls -l vendor

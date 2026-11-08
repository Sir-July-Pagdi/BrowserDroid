#!/usr/bin/env bash
# Package guest files into the emscripten data file and copy all engine artifacts into ./engine/. Needs build-qemu-wasm.sh + build-linux-guest.sh done.
set -euo pipefail
cd "$(dirname "$0")/.."; . scripts/versions.env
docker ps --format '{{.Names}}' | grep -qx "$BUILDER_CONTAINER" || { echo "Builder container not running; rerun build-qemu-wasm.sh" >&2; exit 1; }
[ -f build/pack/kernel8.img ] || { echo "Run build-linux-guest.sh first" >&2; exit 1; }
docker exec "$BUILDER_CONTAINER" rm -rf /pack
docker cp build/pack "$BUILDER_CONTAINER":/pack
docker exec "$BUILDER_CONTAINER" /bin/sh -c "cd /build && /emsdk/upstream/emscripten/tools/file_packager.py qemu-system-aarch64.data --preload /pack > load.js"
mkdir -p engine
docker cp "$BUILDER_CONTAINER":/build/qemu-system-aarch64 engine/out.js
for f in qemu-system-aarch64.wasm qemu-system-aarch64.worker.js qemu-system-aarch64.data load.js; do docker cp "$BUILDER_CONTAINER":/build/$f engine/$f; done
( cd engine && sha256sum out.js qemu-system-aarch64.wasm qemu-system-aarch64.worker.js qemu-system-aarch64.data load.js > MANIFEST.sha256 )
{ echo "qemu-wasm commit: $QEMU_WASM_COMMIT"; echo "emsdk: $EMSDK_VERSION"; echo "built: $(date -u +%FT%TZ)"; } > engine/BUILD_INFO.txt
ls -l engine
echo "Largest file sizes matter for hosting limits (see docs/BUILD.md)."

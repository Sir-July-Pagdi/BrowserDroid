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
# Hosting limit workaround: split any file over 20 MiB into parts (Cloudflare static assets are limited to ~25 MiB per file; verify current limit).
# The lab page downloads the parts and reassembles them in the browser. The unsplit originals are moved to build/engine-full/ (never deployed).
mkdir -p build/engine-full
python3 - <<'PY'
import os, json, hashlib, shutil
CH = 20 * 1024 * 1024
parts = {}
for name in sorted(os.listdir("engine")):
    path = os.path.join("engine", name)
    if not os.path.isfile(path) or os.path.getsize(path) <= CH or ".part" in name: continue
    size = os.path.getsize(path); names = []
    with open(path, "rb") as f:
        i = 0
        while True:
            b = f.read(CH)
            if not b: break
            pn = f"{name}.part{i:03d}"
            open(os.path.join("engine", pn), "wb").write(b); names.append(pn); i += 1
    parts[name] = {"size": size, "parts": names}
    shutil.move(path, os.path.join("build/engine-full", name))
json.dump(parts, open("engine/parts.json", "w"), indent=1)
print("split:", {k: len(v["parts"]) for k, v in parts.items()})
PY
ls -l engine
echo "Largest file sizes matter for hosting limits (see docs/BUILD.md)."

#!/usr/bin/env bash
# Clone ktock/qemu-wasm and check out the pinned commit into build/qemu-wasm.
set -euo pipefail
cd "$(dirname "$0")/.."; . scripts/versions.env
mkdir -p build
if [ ! -d build/qemu-wasm/.git ]; then git clone "$QEMU_WASM_REPO" build/qemu-wasm; fi
git -C build/qemu-wasm fetch --all --tags
git -C build/qemu-wasm checkout --detach "$QEMU_WASM_COMMIT"
HEAD_NOW="$(git -C build/qemu-wasm rev-parse HEAD)"
[ "$HEAD_NOW" = "$QEMU_WASM_COMMIT" ] || { echo "Pin mismatch: $HEAD_NOW != $QEMU_WASM_COMMIT" >&2; exit 1; }
git -C build/qemu-wasm submodule update --init --recursive 2>/dev/null || true
echo "qemu-wasm at $HEAD_NOW (QEMU base $(cat build/qemu-wasm/VERSION))"

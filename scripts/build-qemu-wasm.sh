#!/usr/bin/env bash
# Build qemu-system-aarch64 to WebAssembly inside the upstream emscripten toolchain container.
# Flags are copied verbatim from the pinned upstream README ("Building" -> aarch64). Expect a long build (tens of minutes+) and several GB of disk.
set -euo pipefail
cd "$(dirname "$0")/.."; . scripts/versions.env
SRC="$PWD/build/qemu-wasm"; [ -d "$SRC/.git" ] || { echo "Run scripts/fetch-upstream.sh first" >&2; exit 1; }
docker build -t "$BUILDER_IMAGE" - < "$SRC/Dockerfile"
docker rm -f "$BUILDER_CONTAINER" >/dev/null 2>&1 || true
docker run --rm -d --name "$BUILDER_CONTAINER" -v "$SRC":/qemu/:ro "$BUILDER_IMAGE"
EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"
docker exec "$BUILDER_CONTAINER" emconfigure /qemu/configure --static --target-list=aarch64-softmmu --cpu=wasm32 --cross-prefix= \
  --without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
  --extra-cflags="$EXTRA_CFLAGS" --extra-cxxflags="$EXTRA_CFLAGS" \
  --extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"
docker exec "$BUILDER_CONTAINER" emmake make -j "$(nproc)" qemu-system-aarch64
echo "Built. Container '$BUILDER_CONTAINER' is still running for package-engine.sh."

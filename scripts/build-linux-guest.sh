#!/usr/bin/env bash
# Build the minimal ARM64 guest (Raspberry Pi kernel + BusyBox rootfs) from upstream's raspi3ap example Dockerfile.
# Output: build/pack/{kernel8.img,bcm2710-rpi-3-b-plus.dtb,rootfs.bin}
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$PWD/build/qemu-wasm"; [ -d "$SRC/.git" ] || { echo "Run scripts/fetch-upstream.sh first" >&2; exit 1; }
rm -rf build/pack; mkdir -p build/pack
docker build --output=type=local,dest=build/pack "$SRC/examples/raspi3ap/image"
ls -l build/pack

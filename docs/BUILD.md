# Reproducible QEMU-WASM build (Milestone 2)

> **Status: scripted, not executed by the author of this update.** The build environment used to prepare this repository had no Docker and no network access, so these scripts have **not been run end to end**. Treat every step as unverified until you run it and keep the logs.

## What is built

| Output (in `engine/`) | Source |
|---|---|
| `out.js`, `qemu-system-aarch64.wasm`, `qemu-system-aarch64.worker.js` | `qemu-system-aarch64` from ktock/qemu-wasm, compiled with Emscripten (TCG-to-Wasm backend, pthreads, `-sPROXY_TO_PTHREAD`) |
| `qemu-system-aarch64.data`, `load.js` | Emscripten file packager over `build/pack/` (Raspberry Pi kernel `kernel8.img`, DTB, BusyBox `rootfs.bin`) |
| `vendor/xterm*.js/css` | xterm.js 5.3.0 and xterm-pty 0.10.1 from npm, vendored so all assets are same-origin |

The guest is upstream's **Raspberry Pi 3 (raspi3ap) ARM64 Linux, serial console only**. It is a generic Linux proof, not Android.

## Pins

`scripts/versions.env` pins: ktock/qemu-wasm commit `0ef7b4e2814b231705d8371dd7997f5b72e70baf`, emsdk 3.1.50 (from the upstream Dockerfile), xterm 5.3.0, xterm-pty 0.10.1.
The uploaded `qemu-wasm-master.zip` has no git metadata (it reports QEMU base version 8.2.0), so it could not be matched to that commit; the scripts always check out the pin from Git and fail if HEAD differs.

Residual non-determinism: the upstream guest Dockerfile uses unpinned Ubuntu base images and `apt` packages (BusyBox 1.36.1 and Raspberry Pi kernel tag `1.20230405` *are* pinned). `package-engine.sh` writes `engine/MANIFEST.sha256` and `BUILD_INFO.txt` so you can compare builds.

## Steps

Requirements: Docker, git, Node/npm (for vendoring), tens of GB free disk, and patience.

```bash
./scripts/build-all.sh        # or run the steps individually:
./scripts/fetch-upstream.sh   # clone + checkout pinned commit into build/qemu-wasm
./scripts/build-qemu-wasm.sh  # builder image + configure + make qemu-system-aarch64
./scripts/build-linux-guest.sh# kernel + BusyBox rootfs via upstream raspi3ap Dockerfile
./scripts/package-engine.sh   # data package + copy artifacts into ./engine
./scripts/vendor-xterm.sh     # xterm.js / xterm-pty into ./vendor
python3 scripts/serve.py      # local server WITH COOP/COEP headers
```

Open `http://localhost:8080/diagnostics.html`, then `/lab.html`.

## Hosting (Cloudflare Pages)

1. Keep GitHub as the source. Create a Cloudflare Pages project: framework preset *None*, build command empty, output directory `/` (or use `wrangler pages deploy .`).
2. `_headers` at the output root supplies COOP/COEP/CORP. **GitHub Pages cannot do this**; the diagnostics page will correctly report BLOCKED there.
3. Every subresource must be same-origin (or send CORP/CORS). Do not load scripts, fonts, wasm or workers from a CDN.
4. **Check file-size limits before deploying engine artifacts.** As far as I know Cloudflare Pages limits individual assets to 25 MiB; the `.wasm` and the `.data` package (Raspberry Pi kernel + rootfs) may exceed that. Verify against current Cloudflare docs. If they do, options are splitting/compressing the payloads and teaching the loader to reassemble them, or serving engine files from another same-site origin that sends `Cross-Origin-Resource-Policy: cross-origin`. Neither is implemented here.
5. After deploying, load `/diagnostics.html` on the iPad and confirm **Cross-origin isolation = PASS**. The page prints the COOP/COEP values it received.

## GPL / licence obligations when you ship binaries

QEMU (GPL-2.0+), the Linux kernel (GPL-2.0), BusyBox (GPL-2.0), glib (LGPL-2.1+) and others end up in `engine/`. Publishing those binaries means you must make the corresponding source available and keep notices. Commit `engine/BUILD_INFO.txt`, keep `build/qemu-wasm` source reachable at the pinned commit (link plus the exact kernel/BusyBox versions), and see `THIRD_PARTY_NOTICES.md`. This is not legal advice.

## Known gaps versus the Milestone 3 requirements

- **Framebuffer**: upstream example runs `-nographic`. QEMU is configured `--without-default-features`, so no display UI exists. Needs a display device (e.g. `ramfb`/virtio-gpu) plus a custom QEMU display backend or a remote-display protocol bridged to a canvas.
- **Keyboard/touch to a guest display**: depends on the above.
- **Pause/resume**: no control channel yet.
- **Persistent disk**: root filesystem lives in Emscripten's in-memory FS; writes vanish on reload. OPFS-backed block layer is future work.
- **MTTCG on 64-bit guests** is experimental upstream. The lab exposes it as a selectable option; expect problems.

## Patches applied to upstream (found by real CI runs)

1. **zlib URL** (first CI run, 2026-11-08): upstream's Dockerfile fetches `https://zlib.net/zlib-1.3.1.tar.xz`, which now returns an HTML page; the build failed at that step. `scripts/build-qemu-wasm.sh` patches a copy of the Dockerfile to use `https://zlib.net/fossils/zlib-1.3.1.tar.gz` (same version) and aborts if the patch does not apply. Further failures of this kind (moved download URLs) are expected in an old recipe; each one is logged here.

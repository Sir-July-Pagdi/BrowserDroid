# Third-party notices

No third-party emulator binaries or Android system images are bundled in this starter.

Potential future dependencies requiring separate review:

- QEMU and the `ktock/qemu-wasm` experimental fork: review the exact source revision, build configuration, and applicable QEMU license before distribution.
- NekoDroid: MIT-licensed, but its current implementation should be reused only where technically appropriate and with required notices.
- Android Open Source Project images and components: comply with their individual licenses and trademark requirements.
- Any proprietary Google Play components must not be assumed redistributable.


## Added with the M3 feasibility update

Nothing below is bundled in this repository. These are fetched/built by `scripts/` and become part of what you deploy if you publish `engine/` and `vendor/`; you then inherit their licence obligations.

| Component | Role | Licence (verify at the pinned revision) |
|---|---|---|
| ktock/qemu-wasm (QEMU 8.2.0 base, pinned in `scripts/versions.env`) | Engine source | GPL-2.0-or-later and other QEMU file-level licences (see `COPYING`, `COPYING.LIB` upstream) |
| Raspberry Pi Linux kernel tag 1.20230405 | Test guest kernel | GPL-2.0 |
| BusyBox 1.36.1 | Test guest userland | GPL-2.0 |
| Emscripten / emsdk 3.1.50, mimalloc | Toolchain / allocator | MIT / UIUC, MIT |
| glib 2.75, libffi, pixman, zlib | Static libraries linked into the engine | LGPL-2.1+, MIT, MIT, zlib |
| xterm.js 5.3.0, xterm-pty 0.10.1 | Terminal in the Linux lab | MIT |

Source-offer duty: if you distribute the compiled engine, provide the corresponding source (the pinned commit URL, kernel tag, BusyBox version and your build scripts) and retain upstream copyright/licence notices. `scripts/vendor-xterm.sh` copies the xterm licence files into `vendor/`. The diagnostics page and lab loader are original BrowserDroid code (MIT); the lab loader's boot arguments mirror upstream's `examples/raspi3ap` example.

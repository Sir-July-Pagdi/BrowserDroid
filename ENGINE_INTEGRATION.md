# Emulator engine integration contract

This document defines the future boundary. No engine implementation is included yet.

## Required browser-facing API

The UI should communicate with a dedicated Worker. Do not run a CPU emulator loop on the main thread.

Proposed messages from UI to worker:

```js
{ type: "ENGINE_INIT", config: { ramMiB: 512, machine: "..." } }
{ type: "ENGINE_START" }
{ type: "ENGINE_PAUSE" }
{ type: "ENGINE_RESET" }
{ type: "ENGINE_INPUT", input: { kind: "touch", x: 0, y: 0, phase: "down" } }
{ type: "ENGINE_IMPORT_APK", fileId: "..." }
{ type: "ENGINE_SHUTDOWN" }
```

Worker events to UI:

```js
{ type: "ENGINE_STATUS", state: "initializing|running|paused|stopped|error" }
{ type: "ENGINE_LOG", level: "info|warn|error", message: "..." }
{ type: "ENGINE_FRAME", width: 800, height: 600, buffer: ArrayBuffer }
{ type: "ENGINE_ERROR", code: "...", message: "..." }
```

## Integration requirements

1. Pin an exact QEMU source commit; do not build from a moving branch.
2. Verify the build target and Emscripten version.
3. Test on the actual target iPad in Safari.
4. Confirm ARM64 guest support and memory configuration; do not assume wasm64 support.
5. Build a minimal Linux guest before attempting Android.
6. Prove framebuffer, input, disk persistence, pause/resume and safe shutdown.
7. Only then select an Android kernel/system image designed for the emulated machine.
8. APK installation must happen inside Android's package manager, not through a custom APK-to-JavaScript shortcut.

## Non-goals for the first proof of concept

- Google Play certification or Play Integrity.
- Guaranteed banking/DRM app support.
- 3D gaming or GPU passthrough.
- Arbitrary device sensor emulation.
- Multi-instance execution.


## Update (M3 feasibility work)

- Browser feasibility is now checked by `diagnostics.html` (Milestone 1). Run it on the target iPad before any engine work.
- `lab.html` / `src/lab.js` load an engine from `./engine/` following the upstream raspi3ap example. It runs QEMU on the page's main thread plus Emscripten's own pthread workers (`-sPROXY_TO_PTHREAD`), **not** inside the dedicated `ENGINE_*` worker contract above. Moving to that contract is a later refactor, intentionally not done now ("avoid unnecessary rewrites").
- The `ENGINE_*` message API in this document remains the target for Milestone 3+ but is not implemented.

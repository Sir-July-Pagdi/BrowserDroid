# BrowserDroid — Local Android Lab

A deployable, local-first browser interface and feasibility scaffold for an Android emulator running entirely on iPadOS.

> **Honest status:** This repository is a working PWA shell, a local APK library, a browser-feasibility diagnostics page, and an *unverified* loader plus build scripts for a QEMU-WASM ARM64 Linux boot test. It does **not** boot Android or execute APKs, and **no engine binaries are included**. It is not yet an Android emulator. ARM64 Linux has **not** been demonstrated booting in Safari.

## M3 feasibility prototype — start here

| Piece | Where | State |
|---|---|---|
| Browser diagnostics (PASS / BLOCKED / NOT AVAILABLE) | `diagnostics.html`, `src/diagnostics.js`, `src/diag-worker.js` | Implemented; logic checked under Node shims only. **Not yet run in Safari on the iPad.** |
| COOP/COEP hosting | `_headers` (Cloudflare Pages), `scripts/serve.py` (local) | Configured; verify on the real deployment |
| Reproducible QEMU-WASM + guest build | `scripts/`, `docs/BUILD.md` | Written from the pinned upstream recipe; **never executed** |
| Linux boot lab (serial console, boot timing, CPU-loop benchmark) | `lab.html`, `src/lab.js` | Written, **untested against real artifacts** |
| Framebuffer, touch/keyboard to guest display, pause/resume, persistent disk | — | **Not implemented** |

Testing: `docs/TESTING.md`. Build: `docs/BUILD.md`. Local run with isolation: `python3 scripts/serve.py` (the plain `http.server` command below does not send the required headers).

## Hosting note

GitHub stays the source repository, but **GitHub Pages cannot send COOP/COEP headers**, so threaded WebAssembly will be BLOCKED there. Deploy via Cloudflare Pages (the `_headers` file is already included).

## What works now

- Responsive desktop and iPad/iPhone interface.
- PWA manifest and service worker shell caching.
- APK file import into the browser's Origin Private File System (OPFS).
- APK metadata stored in IndexedDB.
- APK export and deletion.
- Storage quota estimate and persistent-storage request.
- GitHub Pages deployment workflow.
- No backend; APK binaries are not uploaded.

## What does not work yet

- No Android kernel or guest OS.
- No QEMU/WASM binary.
- No APK installation or execution.
- No Google Play services, hardware acceleration, or Android device certification.
- No Android virtual disk yet; OPFS currently stores imported APK files only.

## Deploy to GitHub Pages

1. Create a GitHub repository, e.g. `browserdroid`.
2. Upload the **contents** of this folder to the repository root (not the containing folder).
3. Ensure the default branch is named `main`.
4. Open **Settings → Pages** and select **GitHub Actions** as the build/deployment source.
5. Push to `main`, or run the workflow manually from **Actions**.
6. Open the Pages URL shown in the workflow deployment.

No Node build step is required. This is a static site.

## Run locally

Because ES modules, service workers, and OPFS require a local web origin, do not open `index.html` directly as a file.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## iPadOS notes

- Use a current Safari version and a normal (non-private) browsing session.
- OPFS and persistent storage behavior depend on browser version and available disk space.
- "Persistent storage" is a browser request, not a guarantee against the user clearing website data or the OS reclaiming storage.
- Export important APKs before clearing browser data.
- This prototype's APK library is local to the website origin and browser profile.

## Architecture

```text
Safari / PWA
  ├── TypeScript-free static UI (HTML/CSS/ES modules)
  ├── IndexedDB: APK metadata
  ├── OPFS: imported APK binaries
  └── Future integration boundary
        └── Dedicated Worker
              └── QEMU compiled to WebAssembly
                    └── ARM64 Android guest
                          └── Android Package Manager / ART / APKs
```

## Next milestone: QEMU/WASM feasibility

Do not label the product an Android emulator until a real Android guest boots locally in Safari.

Research starting points:

- [ktock/qemu-wasm](https://github.com/ktock/qemu-wasm) — experimental browser-oriented QEMU fork.
- [NekoDroid](https://github.com/nishal21/NekoDroid) — browser-native ARM/WASM project; current APK HLE support is constrained and is not general Android compatibility.
- [QEMU browser support discussion](https://lists.gnu.org/archive/html/qemu-arm/2025-04/msg00153.html).

The QEMU WASM fork is experimental. Validate its current build instructions, guest architecture, memory model, browser compatibility, and license before integrating it. In particular, do not assume a generic Android Emulator system image will boot under an arbitrary QEMU machine configuration.

## Security and privacy

- APKs are untrusted executable files. This prototype stores them but does not execute them.
- Imported files remain within this website's origin storage until exported or deleted.
- Do not add remote APK upload or analytics without an explicit privacy design.
- Any future emulator worker should be isolated from the UI and should validate all messages and file sizes.

## License

The original BrowserDroid scaffold is released under the MIT License. Third-party emulator code, Android system images, and other assets retain their own licenses and redistribution requirements. See `THIRD_PARTY_NOTICES.md`.


## App icon

The supplied BrowserDroid artwork is included as the launcher and installable PWA icon. The manifest uses 192×192 and 512×512 PNG variants; iPadOS home-screen installation uses `assets/apple-touch-icon.png`. The 1024×1024 source artwork is retained at `assets/icon-source.png`.

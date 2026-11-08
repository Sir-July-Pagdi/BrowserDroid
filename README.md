# BrowserDroid — Local Android Lab

A deployable, local-first browser interface and feasibility scaffold for an Android emulator running entirely on iPadOS.

> **Honest status:** This repository is a working PWA shell and local APK library. It does **not** currently boot Android or execute APKs. QEMU/WASM and a compatible Android ARM64 guest are not bundled or integrated.

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

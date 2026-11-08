# Testing instructions

## Milestone 1 — browser feasibility (do this first, on the iPad Air M3)

1. Deploy to an HTTPS origin that sends the headers in `_headers` (e.g. a Cloudflare Pages preview). Plain `http://<LAN-IP>` is **not** a secure context and will fail by design.
2. In **Safari** (a normal tab, not Private Browsing), open `https://<your-host>/diagnostics.html`.
3. Read the verdict banner. Milestone 1 requires every ★ critical check to be **PASS** *and* the environment panel to say iPad Safari.
4. Tap **Copy JSON report** (or Download) and keep it with the build commit hash. Repeat once as an installed PWA (Share → Add to Home Screen) and once after a cold start; isolation and storage behaviour can differ.
5. Negative control: open the same page on GitHub Pages (no headers). Expect **BLOCKED** for cross-origin isolation, SharedArrayBuffer and shared memory. If it does not, the page is lying and that is a bug.

Local desktop sanity check (development aid only): `python3 scripts/serve.py`, open `http://localhost:8080/diagnostics.html`.

What a PASS does **not** show: that 2.25 GiB can actually be committed, that Safari will not terminate the tab under memory pressure, or that QEMU-WASM is fast enough.

## Milestone 2 — engine loads

After `docs/BUILD.md`, open `/lab.html`. Preflight must show cross-origin isolation PASS and all files PASS. Tap **Boot guest**; the engine log panel shows Emscripten output and errors. Record failures verbatim (they are the deliverable if boot fails).

## Milestone 3 — Linux guest measurements

| Item | How | Automated here? |
|---|---|---|
| Serial boot | Kernel messages and a shell prompt appear in the terminal | yes (timings shown) |
| Boot time | “Time to first output / kernel banner / shell prompt (heuristic)” | yes |
| CPU responsiveness | **Run guest CPU loop ×10**; compare wall time per run; main-thread lag is sampled | yes |
| Thermal throttling | Run the loop repeatedly for 15–30 min; look for rising times. Safari exposes no thermal API | trend only |
| Memory | Engine linear memory size is shown; real process memory is not observable. Note any tab reloads/crashes | partial |
| Shutdown | “Send poweroff” then check whether the engine stops; else Hard stop | unverified |
| Framebuffer, keyboard/touch on a display | — | **not implemented** |
| Pause / resume | — | **not implemented** |
| Persistent disk | — | **not implemented** |

Do not mark Milestone 3 complete until the unimplemented rows are built and demonstrated on the iPad.

## Regression checks for the existing app

- `/` still loads; APK import, list, export, delete and storage views behave as before.
- Service worker: after updating, hard-reload once so cache `browserdroid-shell-v3` replaces v2.
- Icon: sidebar logo, favicon, apple-touch-icon and manifest icons all show the green Android-in-browser artwork.

## Troubleshooting: diagnostics/lab links will not open on Cloudflare but work on GitHub Pages

Cloudflare (Workers static assets and Pages) redirects `/x.html` to `/x`. Service worker v3 cached that redirect and served it to navigations, which browsers reject. Fixed in `sw.js` v4 (navigations go to the network; redirected responses are rebuilt before caching). After deploying: open `/diagnostics` directly, then in Safari/Chrome clear site data for the origin (or Settings → Safari → Advanced → Website Data → remove the site) so the old v3 worker is replaced. Optional: set `"html_handling": "none"` under `assets` in `wrangler.jsonc` to stop the redirect altogether.

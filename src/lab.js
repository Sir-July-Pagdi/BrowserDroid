/* BrowserDroid — ARM64 Linux boot lab loader (Milestones 2–3).
 * Mirrors ktock/qemu-wasm's examples/raspi3ap/src/htdocs/{index.html,module.js}, with all assets same-origin (required by COEP).
 * Expected files under ./engine/ (produced by scripts/package-engine.sh):
 *   out.js  qemu-system-aarch64.wasm  qemu-system-aarch64.worker.js  qemu-system-aarch64.data  load.js
 * and under ./vendor/ (scripts/vendor-xterm.sh): xterm.js  xterm.css  xterm-pty.js
 * STATUS: written against the upstream recipe; NOT yet exercised against real build artifacts. */
const $ = (id) => document.getElementById(id);
const ENGINE = "./engine/", VENDOR = "./vendor/";
const REQUIRED = [
  [ENGINE + "out.js", "QEMU JS glue (renamed qemu-system-aarch64)"],
  [ENGINE + "qemu-system-aarch64.worker.js", "pthread worker script"],
  [ENGINE + "parts.json", "Manifest of split files (wasm + data), each part under the host's per-file limit"],
  [ENGINE + "load.js", "Data-package loader"],
  [VENDOR + "xterm.js", "xterm.js terminal"],
  [VENDOR + "xterm-pty.js", "xterm-pty (PTY bridge)"],
];
const log = (m) => { const el = $("log"); el.textContent += m + "\n"; el.scrollTop = el.scrollHeight; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtMs = (n) => (n == null ? "—" : n < 1000 ? n.toFixed(0) + " ms" : (n / 1000).toFixed(1) + " s");
const row = (host, title, status, detail) => { const r = document.createElement("div"); r.className = "diag-row"; const b = document.createElement("span"); b.className = "badge s-" + status; b.textContent = status === "NA" ? "NOT AVAILABLE" : status; const d = document.createElement("div"); const t = document.createElement("strong"); t.textContent = title; const s = document.createElement("small"); s.textContent = detail; d.append(t, s); r.append(b, d); host.append(r); };

let preflightOk = false, term = null, master = null, bootT0 = 0, booted = false, metrics = {}, maxLag = 0;

async function preflight() {
  const host = $("preflight"); host.replaceChildren();
  const iso = self.crossOriginIsolated === true;
  row(host, "Cross-origin isolation", iso ? "PASS" : "BLOCKED", iso ? "Threaded WebAssembly is possible." : "Not isolated. Deploy with the _headers file (Cloudflare Pages) or scripts/serve.py. See diagnostics page.");
  let missing = 0;
  for (const [url, what] of REQUIRED) {
    try { const r = await fetch(url, { method: "HEAD", cache: "no-store" }); const ok = r.ok && !(r.headers.get("content-type") || "").includes("text/html"); if (!ok) missing++; row(host, url.slice(2), ok ? "PASS" : "BLOCKED", ok ? `${what} — ${r.headers.get("content-length") ? (r.headers.get("content-length") / 1048576).toFixed(1) + " MiB" : "size unknown"}` : `${what} — not found (HTTP ${r.status}). Build it with docs/BUILD.md.`); }
    catch (e) { missing++; row(host, url.slice(2), "BLOCKED", `${what} — fetch failed: ${e.message}`); }
  }
  try {
    const man = await (await fetch(ENGINE + "parts.json", { cache: "no-store" })).json();
    for (const [name, info] of Object.entries(man)) {
      let bad = 0; for (const p of info.parts) { const r = await fetch(ENGINE + p, { method: "HEAD", cache: "no-store" }); if (!r.ok) bad++; }
      if (bad) missing++;
      row(host, name, bad ? "BLOCKED" : "PASS", bad ? `${bad} of ${info.parts.length} parts missing` : `${info.parts.length} parts, ${(info.size / 1048576).toFixed(1)} MiB total`);.append(td); }); body.append(tr);
    if (!ok) break;
  }
  $("bench-btn").disabled = false;
}

$("boot-btn").addEventListener("click", boot);
$("poweroff-btn").addEventListener("click", () => { type("poweroff\n"); log("Sent 'poweroff' to guest (BusyBox). Whether QEMU exits on this machine is unverified; use Hard stop if not."); });
$("stop-btn").addEventListener("click", () => location.reload());
$("bench-btn").addEventListener("click", bench);
renderMetrics(); preflight();

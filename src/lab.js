/* BrowserDroid — ARM64 Linux boot lab loader (Milestones 2–3).
 * Mirrors ktock/qemu-wasm's examples/raspi3ap/src/htdocs/{index.html,module.js}, with all assets same-origin (required by COEP).
 * Expected files under ./engine/ (produced by scripts/package-engine.sh):
 *   out.js  qemu-system-aarch64.wasm  qemu-system-aarch64.worker.js  qemu-system-aarch64.data  load.js
 * and under ./vendor/ (scripts/vendor-xterm.sh): xterm.js  xterm.css  xterm-pty.js
 * STATUS: written against the upstream recipe; NOT yet exercised against real build artifacts. */
window.__labLoaded = true;
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
      row(host, name, bad ? "BLOCKED" : "PASS", bad ? `${bad} of ${info.parts.length} parts missing` : `${info.parts.length} parts, ${(info.size / 1048576).toFixed(1)} MiB total`);
    }
  } catch (e) { missing++; row(host, "engine/parts.json", "BLOCKED", "Cannot read parts manifest: " + e.message); }
  preflightOk = iso && missing === 0;
  $("boot-btn").disabled = !preflightOk;
  if (!preflightOk) row(host, "Result", "BLOCKED", "Cannot boot: " + (!iso ? "page is not cross-origin isolated. " : "") + (missing ? `${missing} required file(s) missing. This repository does not bundle engine binaries.` : ""));
}

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("failed to load " + src)); document.head.append(s); }); }

function bufferText() { if (!term) return ""; const b = term.buffer.active; let t = ""; for (let i = 0; i < b.length; i++) { const l = b.getLine(i); if (l) t += l.translateToString(true) + "\n"; } return t; }
function lines() { return bufferText().split("\n"); }

function startWatch() {
  let last = performance.now();
  setInterval(() => { const n = performance.now(); maxLag = Math.max(maxLag, n - last - 100); last = n; }, 100);
  setInterval(() => {
    if (!booted) return; const t = performance.now() - bootT0, text = bufferText();
    if (metrics.firstOutput == null && text.trim()) metrics.firstOutput = t;
    if (metrics.kernel == null && /Linux version \d/.test(text)) metrics.kernel = t;
    if (metrics.prompt == null && metrics.kernel != null) { const nz = lines().map((l) => l.trim()).filter(Boolean); const last = nz[nz.length - 1] || ""; if (/^[~\/\w.-]*\s?[#$]$/.test(last)) metrics.prompt = t; }
    renderMetrics();
  }, 300);
}
function renderMetrics() {
  const h = $("metrics"); h.replaceChildren();
  const Mod = window.Module; const heap = Mod && Mod.HEAPU8 ? (Mod.HEAPU8.length / 1048576).toFixed(0) + " MiB (WebAssembly linear memory size, not RSS)" : "not exposed";
  const rows = [["Time to first serial output", fmtMs(metrics.firstOutput)], ["Time to kernel banner", fmtMs(metrics.kernel)], ["Time to shell prompt (heuristic)", fmtMs(metrics.prompt)], ["Elapsed since boot click", booted ? fmtMs(performance.now() - bootT0) : "—"], ["Max main-thread lag seen", maxLag.toFixed(0) + " ms"], ["Engine linear memory", heap], ["Process memory / thermal state", "Not exposed by Safari — observe tab reloads and the benchmark trend"]];
  for (const [k, v] of rows) { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = k; const s = document.createElement("span"); s.textContent = v; d.append(b, s); h.append(d); }
}

async function boot() {
  $("boot-btn").disabled = true; $("boot-btn").textContent = "Booting…"; $("terminal").hidden = false; metrics = {}; maxLag = 0;
  try {
    await loadScript(VENDOR + "xterm.js"); await loadScript(VENDOR + "xterm-pty.js");
    term = new Terminal(); term.open($("terminal"));
    const { master: m, slave } = openpty(); master = m; term.loadAddon(master);
    const smp = $("opt-smp").value, ram = $("opt-ram").value, multi = $("opt-mttcg").value === "multi";
    const blobs = await assembleParts();
    window.Module = {
      locateFile: (p) => blobs[p] || ENGINE + p,
      mainScriptUrlOrBlob: new URL(ENGINE + "out.js", location.href).href,
      pty: slave,
      print: (t) => log("[out] " + t), printErr: (t) => log("[err] " + t),
      onAbort: (w) => { log("[ABORT] " + w); },
      arguments: ["-nic", "none", "-M", "raspi3ap", "-nographic", "-m", ram,
        "-accel", multi ? "tcg,tb-size=500,thread=multi" : "tcg,tb-size=500", "-smp", multi ? `${smp},sockets=${smp}` : smp,
        "-dtb", "/pack/bcm2710-rpi-3-b-plus.dtb", "-kernel", "/pack/kernel8.img", "-drive", "file=/pack/rootfs.bin,format=raw,if=sd",
        "-append", "earlycon=pl011,0x3f201000 console=ttyAMA0,115200 loglevel=8 initcall_blacklist=bcm2835_pm_driver_init root=/dev/mmcblk0 rootfstype=ext4 rootwait no_console_suspend"],
    };
    log(`Boot config: smp=${smp} ram=${ram} mttcg=${multi}`);
    await loadScript(ENGINE + "load.js");
    bootT0 = performance.now(); booted = true; startWatch();
    const { default: init } = await import(new URL(ENGINE + "out.js", location.href).href);
    const inst = await init(window.Module);
    // Same poll patch as the upstream example so reads from the PTY do not block.
    const old = window.Module.TTY.stream_ops.poll, pty = window.Module.pty;
    window.Module.TTY.stream_ops.poll = function (stream, timeout) { if (!pty.readable) return (pty.readable ? 1 : 0) | (pty.writable ? 4 : 0); return old.call(stream, timeout); };
    $("poweroff-btn").disabled = false; $("bench-btn").disabled = false; $("boot-btn").textContent = "Running";
    log("Engine initialised; guest is executing (check serial output above).");
  } catch (e) { log("[FAILED] " + (e.stack || e.message || e)); $("boot-btn").textContent = "Boot failed — see log"; }
}
// Download split files and reassemble them as same-origin blob URLs (wasm gets the application/wasm type for streaming compile).
async function assembleParts() {
  const man = await (await fetch(ENGINE + "parts.json", { cache: "no-store" })).json(), urls = {};
  for (const [name, info] of Object.entries(man)) {
    const bufs = []; let got = 0, t0 = performance.now();
    for (const p of info.parts) { const r = await fetch(ENGINE + p); if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`); const b = await r.arrayBuffer(); bufs.push(b); got += b.byteLength; log(`[load] ${p} (${(got / 1048576).toFixed(1)}/${(info.size / 1048576).toFixed(1)} MiB)`); }
    if (got !== info.size) throw new Error(`${name}: assembled ${got} bytes, expected ${info.size}`);
    urls[name] = URL.createObjectURL(new Blob(bufs, { type: name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" }));
    log(`[load] ${name} assembled in ${fmtMs(performance.now() - t0)}`);
  }
  return urls;
}
function type(text) { if (term) term.input(text, true); }

async function bench() {
  $("bench-btn").disabled = true; const tb = $("bench-table"); tb.hidden = false; const body = tb.querySelector("tbody");
  for (let n = 1; n <= 10; n++) {
    maxLag = 0; const t0 = performance.now(); const tag = "BDDONE" + n + "_" + Math.floor(t0) % 100000;
    type(`i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo ${tag}\n`);
    let ok = false; while (performance.now() - t0 < 300000) { await sleep(250); if (lines().some((l) => l.trim() === tag)) { ok = true; break; } }
    const tr = document.createElement("tr"); const cells = [n, ok ? fmtMs(performance.now() - t0) : "timeout (>300 s)", maxLag.toFixed(0) + " ms"]; cells.forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr.append(td); }); body.append(tr);
    if (!ok) break;
  }
  $("bench-btn").disabled = false;
}

$("boot-btn").addEventListener("click", boot);
$("poweroff-btn").addEventListener("click", () => { type("poweroff\n"); log("Sent 'poweroff' to guest (BusyBox). Whether QEMU exits on this machine is unverified; use Hard stop if not."); });
$("stop-btn").addEventListener("click", () => location.reload());
$("bench-btn").addEventListener("click", bench);
renderMetrics(); preflight();

/* BrowserDroid — Milestone 1 browser feasibility diagnostics (main thread).
 * PASS = works here. BLOCKED = API exists/likely exists but cannot be used (config, policy, failure). NOT AVAILABLE = browser lacks it.
 * Does not allocate large memory: shared-memory probing only reserves address space and is released immediately. */
const $ = (id) => document.getElementById(id);
const msg = (e) => (e && (e.name ? e.name + ": " : "") + (e.message || e)) || "unknown error";
const LABEL = { PASS: "PASS", BLOCKED: "BLOCKED", NA: "NOT AVAILABLE" };
const GROUPS = ["Isolation & hosting", "WebAssembly", "Workers & threads", "Storage", "Graphics", "Hardware & memory", "Worker context"];
const QEMU_PAGES = 36864; // 2.25 GiB: the upstream qemu-wasm aarch64 build asks for -sTOTAL_MEMORY=2300MB

let results = [], env = {}, lastReport = null;
const R = (id, group, label, status, detail, critical = false) => results.push({ id, group, label, status, detail, critical });

const BULK = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,3,1,0,1,10,14,1,12,0,65,0,65,0,65,0,252,10,0,0,11]);
const BIGINT = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,126,1,126,3,2,1,0,7,5,1,1,97,0,0,10,6,1,4,0,32,0,11]);
const EMPTY = new Uint8Array([0,97,115,109,1,0,0,0]);

function detectEnv() {
  const ua = navigator.userAgent;
  const iPadOS = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Android/.test(ua);
  const ver = (ua.match(/Version\/([\d.]+)/) || [])[1] || "unknown";
  env = {
    userAgent: ua, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints,
    isIPadSafari: iPadOS && safari, safariVersion: ver,
    standalone: !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches),
    secureContext: self.isSecureContext, origin: location.origin,
    serviceWorkerControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, time: new Date().toISOString(),
  };
}

async function isolationChecks() {
  const G = "Isolation & hosting";
  R("secure", G, "Secure context (HTTPS or localhost)", self.isSecureContext ? "PASS" : "BLOCKED",
    self.isSecureContext ? "Page is a secure context." : "Not a secure context: serve over HTTPS (or localhost). Required by OPFS, service workers and isolation.", true);

  let hdr = "";
  try {
    const r = await fetch(location.href.split("#")[0], { cache: "no-store" });
    const coop = r.headers.get("cross-origin-opener-policy"), coep = r.headers.get("cross-origin-embedder-policy");
    env.coop = coop; env.coep = coep;
    hdr = ` Headers seen on this page: COOP=${coop || "(none)"}, COEP=${coep || "(none)"}.`;
  } catch (e) { hdr = " (Could not re-fetch the page to read headers.)"; }

  const iso = self.crossOriginIsolated === true;
  R("isolated", G, "Cross-origin isolation", iso ? "PASS" : (typeof self.crossOriginIsolated === "undefined" ? "NA" : "BLOCKED"),
    iso ? "crossOriginIsolated is true." + hdr
        : typeof self.crossOriginIsolated === "undefined" ? "crossOriginIsolated is not implemented by this browser." + hdr
        : "crossOriginIsolated is false. Host must send Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp on the document (and CORP/CORS on subresources). GitHub Pages cannot do this; use the _headers file on Cloudflare Pages or run scripts/serve.py locally." + hdr, true);
}

function wasmChecks() {
  const G = "WebAssembly";
  if (typeof WebAssembly !== "object") { R("wasm", G, "WebAssembly", "NA", "WebAssembly is not defined.", true); return; }
  try { new WebAssembly.Instance(new WebAssembly.Module(EMPTY)); R("wasm", G, "WebAssembly", "PASS", "Empty module compiled and instantiated synchronously.", true); }
  catch (e) { R("wasm", G, "WebAssembly", "BLOCKED", msg(e), true); }
  try { R("wasm-bulk", G, "Bulk memory operations", WebAssembly.validate(BULK) ? "PASS" : "NA", "Needed by the -mbulk-memory QEMU build.", true); }
  catch (e) { R("wasm-bulk", G, "Bulk memory operations", "BLOCKED", msg(e), true); }
  try { const i = new WebAssembly.Instance(new WebAssembly.Module(BIGINT)); const ok = i.exports.a(5n) === 5n; R("wasm-bigint", G, "i64 ↔ BigInt integration", ok ? "PASS" : "BLOCKED", "Needed by -sWASM_BIGINT.", true); }
  catch (e) { R("wasm-bigint", G, "i64 ↔ BigInt integration", "NA", msg(e), true); }
}

function sharedChecks() {
  const G = "Workers & threads";
  const hasSAB = typeof SharedArrayBuffer === "function";
  let sabStatus = "PASS", sabDetail = "SharedArrayBuffer constructed.";
  if (!hasSAB) {
    const hasAtomics = typeof Atomics === "object";
    sabStatus = hasAtomics || !self.crossOriginIsolated ? "BLOCKED" : "NA";
    sabDetail = hasAtomics ? "Atomics exists but SharedArrayBuffer is hidden — almost certainly because the page is not cross-origin isolated." : "Neither SharedArrayBuffer nor Atomics is exposed.";
    if (!hasAtomics && typeof self.crossOriginIsolated === "undefined") sabStatus = "NA";
  } else { try { new SharedArrayBuffer(8); } catch (e) { sabStatus = "BLOCKED"; sabDetail = msg(e); } }
  R("sab", G, "SharedArrayBuffer", sabStatus, sabDetail, true);

  // Shared WebAssembly.Memory. Try the QEMU-sized reservation first; the memory is initial=1 page, so nothing large is committed.
  let mem = null;
  if (typeof WebAssembly !== "object") { R("shared-mem", G, "Shared WebAssembly.Memory", "NA", "No WebAssembly.", true); }
  else {
    const ladder = [QEMU_PAGES, 32768, 16384, 4096, 256]; let got = 0, err = "";
    for (const max of ladder) {
      try { const m = new WebAssembly.Memory({ initial: 1, maximum: max, shared: true }); if (!(m.buffer instanceof SharedArrayBuffer)) throw new Error("buffer is not a SharedArrayBuffer"); got = max; if (!mem) { mem = m; new Int32Array(m.buffer)[0] = 7; try { m.grow(1); mem = m; new Int32Array(m.buffer)[0] = 7; } catch (g) { err = " grow(1) failed: " + msg(g); } } break; }
      catch (e) { err = msg(e); }
    }
    const mib = (p) => (p * 64 / 1024).toFixed(2) + " GiB";
    if (got === QEMU_PAGES) R("shared-mem", G, "Shared WebAssembly.Memory", "PASS", `Constructed with 1-page initial and ${mib(got)} maximum (the size the upstream aarch64 build wants), then grow(1)${err ? " —" + err : " OK"}. This proves address-space reservation only, NOT that 2.25 GiB can be committed on this device.`, true);
    else if (got > 0) R("shared-mem", G, "Shared WebAssembly.Memory", "BLOCKED", `Only a ${mib(got)} maximum could be reserved; the upstream build wants ${mib(QEMU_PAGES)}. A smaller-RAM guest build would be needed.${err ? " Last error: " + err : ""}`, true);
    else R("shared-mem", G, "Shared WebAssembly.Memory", hasSAB ? "BLOCKED" : (typeof SharedArrayBuffer === "undefined" ? "BLOCKED" : "NA"), (hasSAB ? "Construction failed: " : "Requires SharedArrayBuffer (see above). ") + err, true);
  }
  return mem;
}

function runWorker(mem) {
  const G = "Workers & threads";
  return new Promise((resolve) => {
    if (typeof Worker === "undefined") { R("worker", G, "Web Worker creation", "NA", "Worker is not defined.", true); return resolve(); }
    let w, finished = false, ready = false;
    const finish = () => { if (finished) return; finished = true; try { w && w.terminate(); } catch (_) {} resolve(); };
    try { w = new Worker("./src/diag-worker.js"); }
    catch (e) { R("worker", G, "Web Worker creation", "BLOCKED", msg(e), true); return finish(); }
    const timer = setTimeout(() => { R("worker", G, ready ? "Web Worker creation" : "Web Worker creation", ready ? "BLOCKED" : "BLOCKED", ready ? "Worker started but did not finish its checks within 20 s." : "Worker did not start within 20 s.", true); finish(); }, 20000);
    w.onerror = (e) => { clearTimeout(timer); R("worker", G, "Web Worker creation", "BLOCKED", "Worker error: " + (e.message || "failed to load ./src/diag-worker.js") + " (with COEP, the worker script must be same-origin or carry CORP).", true); finish(); };
    w.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === "ready") {
        ready = true;
        let sent = true;
        try { w.postMessage({ type: "run", mem: mem || null }); }
        catch (e) { sent = false; R("shared-post", G, "Post shared memory to worker", "BLOCKED", msg(e), true); try { w.postMessage({ type: "run", mem: null }); } catch (_) {} }
        if (sent && mem) { const v = new Int32Array(mem.buffer); R("worker", G, "Web Worker creation", "PASS", "Worker started and received a shared WebAssembly.Memory by postMessage.", true); window.__mem = v; }
        else if (sent) R("worker", G, "Web Worker creation", "PASS", "Worker started (no shared memory was available to send).", true);
        else R("worker", G, "Web Worker creation", "PASS", "Worker started.", true);
      } else if (d.type === "done") {
        clearTimeout(timer);
        for (const r of d.results) results.push(r);
        env.workerHardwareConcurrency = d.hardwareConcurrency;
        if (mem) { try { const got = Atomics.load(new Int32Array(mem.buffer), 1); const ok = got === 9; R("shared-visible", "Workers & threads", "Main sees worker's writes in shared memory", ok ? "PASS" : "BLOCKED", ok ? "Worker wrote 9 into shared memory; main thread read 9." : `Expected 9, read ${got}.`, true); } catch (e) { R("shared-visible", "Workers & threads", "Main sees worker's writes in shared memory", "BLOCKED", msg(e), true); } }
        finish();
      }
    };
  });
}

async function storageChecks() {
  const G = "Storage";
  const hasDir = !!(navigator.storage && navigator.storage.getDirectory);
  if (!hasDir) R("opfs", G, "OPFS (main thread)", "NA", "navigator.storage.getDirectory is not available.", true);
  else {
    let name = "bd-diag-main-" + Math.random().toString(36).slice(2);
    try {
      const root = await navigator.storage.getDirectory(); const fh = await root.getFileHandle(name, { create: true });
      const writable = typeof fh.createWritable === "function";
      if (writable) { const w = await fh.createWritable(); await w.write(new Uint8Array([1, 2, 3])); await w.close(); const f = await fh.getFile(); if (f.size !== 3) throw new Error("size mismatch"); }
      await root.removeEntry(name);
      R("opfs", G, "OPFS (main thread)", "PASS", `Created and removed a file. Main-thread createWritable: ${writable ? "yes" : "no (use a worker with sync access handles)"}.`, true);
    } catch (e) { R("opfs", G, "OPFS (main thread)", "BLOCKED", msg(e), true); try { const root = await navigator.storage.getDirectory(); await root.removeEntry(name); } catch (_) {} }
  }
  if (!(navigator.storage && navigator.storage.estimate)) R("quota", G, "Storage quota API", "NA", "navigator.storage.estimate is not available.");
  else {
    try {
      const e = await navigator.storage.estimate(); const gib = (n) => (n / 1073741824).toFixed(2) + " GiB";
      let persisted = "unknown"; try { persisted = navigator.storage.persisted ? String(await navigator.storage.persisted()) : "API missing"; } catch (_) {}
      env.storageQuota = e.quota; env.storageUsage = e.usage; env.persisted = persisted;
      R("quota", G, "Storage quota API", e.quota ? "PASS" : "BLOCKED", e.quota ? `Quota ≈ ${gib(e.quota)}, used ≈ ${gib(e.usage || 0)}, persisted: ${persisted}. Safari's quota is an estimate and can change.` : "estimate() returned no quota.");
    } catch (e) { R("quota", G, "Storage quota API", "BLOCKED", msg(e)); }
  }
}

function graphicsChecks() {
  const G = "Graphics";
  if (typeof OffscreenCanvas === "undefined") R("offscreen", G, "OffscreenCanvas", "NA", "OffscreenCanvas is not defined.");
  else { try { const c = new OffscreenCanvas(16, 16); const ok = !!c.getContext("2d"); R("offscreen", G, "OffscreenCanvas", ok ? "PASS" : "BLOCKED", ok ? "2D context created. transferControlToOffscreen: " + (typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function" ? "yes" : "no") + "." : "getContext('2d') returned null."); } catch (e) { R("offscreen", G, "OffscreenCanvas", "BLOCKED", msg(e)); } }
  try {
    const c = document.createElement("canvas"); const gl = c.getContext("webgl2");
    if (!gl) R("webgl2", G, "WebGL2 (main thread)", typeof WebGL2RenderingContext === "undefined" ? "NA" : "BLOCKED", typeof WebGL2RenderingContext === "undefined" ? "WebGL2RenderingContext is not defined." : "Context creation returned null.");
    else { const ext = gl.getExtension("WEBGL_debug_renderer_info"); const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); R("webgl2", G, "WebGL2 (main thread)", "PASS", `Renderer: ${r}. Max texture size ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}.`); }
  } catch (e) { R("webgl2", G, "WebGL2 (main thread)", "BLOCKED", msg(e)); }
}

function hardwareChecks() {
  const G = "Hardware & memory";
  const hc = navigator.hardwareConcurrency;
  R("cores", G, "Reported hardware concurrency", hc ? "PASS" : "NA", hc ? `${hc} logical processors reported. Browsers may cap or round this value.` : "navigator.hardwareConcurrency is not reported.");
  const dm = navigator.deviceMemory;
  R("devmem", G, "navigator.deviceMemory", dm ? "PASS" : "NA", dm ? `Reported ≈ ${dm} GiB (browsers bucket and cap this value; it is not free memory).` : "Not exposed (Safari does not implement it). Total RAM cannot be read from the browser.");
  const pm = performance && performance.memory;
  R("jsheap", G, "performance.memory (JS heap)", pm ? "PASS" : "NA", pm ? `Heap limit ≈ ${(pm.jsHeapSizeLimit / 1048576).toFixed(0)} MiB.` : "Not exposed (Chromium-only). WebAssembly memory is not reported anyway.");
  R("uamem", G, "measureUserAgentSpecificMemory()", typeof performance.measureUserAgentSpecificMemory === "function" ? (self.crossOriginIsolated ? "PASS" : "BLOCKED") : "NA", typeof performance.measureUserAgentSpecificMemory === "function" ? "Present; requires cross-origin isolation." : "Not implemented. Real memory use must be judged from guest behaviour and Safari tab reloads (iPadOS can kill the tab silently).");
}

function render() {
  const host = $("groups"); host.replaceChildren();
  for (const g of GROUPS) {
    const rows = results.filter((r) => r.group === g); if (!rows.length) continue;
    const card = document.createElement("section"); card.className = "panel diag-group";
    const h = document.createElement("h2"); h.textContent = g; card.append(h);
    for (const r of rows) {
      const row = document.createElement("div"); row.className = "diag-row";
      const badge = document.createElement("span"); badge.className = "badge s-" + r.status; badge.textContent = LABEL[r.status];
      const body = document.createElement("div");
      const t = document.createElement("strong"); t.textContent = r.label + (r.critical ? " ★" : "");
      const d = document.createElement("small"); d.textContent = r.detail;
      body.append(t, d); row.append(badge, body); card.append(row);
    }
    host.append(card);
  }
  const crit = results.filter((r) => r.critical), bad = crit.filter((r) => r.status !== "PASS");
  const tally = { PASS: 0, BLOCKED: 0, NA: 0 }; results.forEach((r) => tally[r.status]++);
  const v = $("verdict"); v.className = "panel verdict " + (bad.length ? "v-bad" : (env.isIPadSafari ? "v-ok" : "v-warn"));
  const head = $("verdict-head"), body = $("verdict-body");
  if (bad.length) { head.textContent = `Milestone 1: NOT MET — ${bad.length} critical check${bad.length > 1 ? "s" : ""} not passing`; body.textContent = bad.map((r) => `${LABEL[r.status]}: ${r.label}`).join(" · "); }
  else if (!env.isIPadSafari) { head.textContent = "All critical checks pass — but this is not iPad Safari"; body.textContent = "Milestone 1 requires these results from Safari on the actual iPad Air M3. Results from desktop browsers are only a development aid."; }
  else { head.textContent = "Milestone 1 browser checks: all critical checks PASS on iPad Safari"; body.textContent = "This proves the browser exposes the required primitives. It does not prove QEMU-WASM will boot or perform acceptably (Milestones 2–3)."; }
  $("tally").textContent = `${tally.PASS} PASS · ${tally.BLOCKED} BLOCKED · ${tally.NA} NOT AVAILABLE   (★ = critical for threaded QEMU-WASM)`;
  const e = $("env"); e.replaceChildren();
  const lines = [["Browser", `${env.isIPadSafari ? "iPadOS Safari " + env.safariVersion : "Not iPad Safari"}`], ["Mode", env.standalone ? "Installed PWA (standalone)" : "Browser tab"], ["Service worker", env.serviceWorkerControlled ? "controlling this page" : "not controlling"], ["Origin", env.origin], ["Screen", env.screen], ["User agent", env.userAgent]];
  for (const [k, val] of lines) { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = k; const s = document.createElement("span"); s.textContent = val; d.append(b, s); e.append(d); }
}

function buildReport() { return { tool: "BrowserDroid diagnostics", schema: 1, env, results: results.map(({ id, group, label, status, detail, critical }) => ({ id, group, label, status, critical, detail })) }; }

async function run() {
  $("run-btn").disabled = true; $("run-btn").textContent = "Running…"; results = []; detectEnv(); window.__mem = null;
  try { await isolationChecks(); wasmChecks(); const mem = sharedChecks(); await runWorker(mem); await storageChecks(); graphicsChecks(); hardwareChecks(); }
  catch (e) { R("fatal", "Isolation & hosting", "Diagnostics runner", "BLOCKED", "Unexpected error: " + msg(e)); }
  const order = (r) => GROUPS.indexOf(r.group); results.sort((a, b) => order(a) - order(b));
  lastReport = buildReport(); render();
  $("run-btn").disabled = false; $("run-btn").textContent = "Run again"; $("report-actions").hidden = false;
}

$("run-btn").addEventListener("click", run);
$("copy-btn").addEventListener("click", async () => { const text = JSON.stringify(lastReport, null, 2); try { await navigator.clipboard.writeText(text); $("copy-btn").textContent = "Copied"; } catch (_) { $("report-text").hidden = false; $("report-text").value = text; $("report-text").select(); $("copy-btn").textContent = "Select & copy below"; } setTimeout(() => ($("copy-btn").textContent = "Copy JSON report"), 2500); });
$("dl-btn").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" })); a.download = "browserdroid-diagnostics.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
run();

/* BrowserDroid feasibility diagnostics — worker side (classic worker, no imports, for broad Safari support).
 * Runs the checks that only mean something INSIDE a worker, because that is where a QEMU-WASM engine would run.
 * Statuses: PASS | BLOCKED (API exists but cannot be used here) | NA (API not available in this browser).
 * Nothing here allocates large memory. */
"use strict";

const BIGINT_MODULE = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,126,1,126,3,2,1,0,7,5,1,1,97,0,0,10,6,1,4,0,32,0,11]);
// (module (memory 1 1 shared) (func (drop (i32.atomic.load (i32.const 0)))))
const THREADS_MODULE = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]);

const out = [];
const add = (id, label, status, detail, critical = false) => out.push({ id, group: "Worker context", label, status, detail, critical });
const msg = (e) => (e && (e.name ? e.name + ": " : "") + (e.message || e)) || "unknown error";

function envChecks() {
  add("w-isolated", "Worker sees cross-origin isolation", self.crossOriginIsolated ? "PASS" : "BLOCKED",
    self.crossOriginIsolated ? "crossOriginIsolated is true inside the worker." : "crossOriginIsolated is false inside the worker (COOP/COEP headers missing or stripped).", true);
  add("w-sab", "SharedArrayBuffer inside worker", typeof SharedArrayBuffer === "function" ? "PASS" : (self.crossOriginIsolated ? "NA" : "BLOCKED"),
    typeof SharedArrayBuffer === "function" ? "Constructor present." : "Constructor is not exposed in this worker.", true);
}

function sharedMemoryRoundTrip(mem) {
  if (!mem) { add("w-shared-mem", "Shared memory visible from worker", "BLOCKED", "Main thread could not send a shared WebAssembly.Memory.", true); return; }
  try {
    const i32 = new Int32Array(mem.buffer);
    const seen = Atomics.load(i32, 0);
    Atomics.store(i32, 1, 9);
    Atomics.notify(i32, 1);
    const ok = seen === 7;
    add("w-shared-mem", "Shared memory visible from worker", ok ? "PASS" : "BLOCKED",
      ok ? "Worker read the value written by the main thread (7) and wrote its own (9) into the same memory." : `Worker read ${seen} instead of 7: memory is not actually shared.`, true);
  } catch (e) { add("w-shared-mem", "Shared memory visible from worker", "BLOCKED", msg(e), true); }
}

function atomicsWait() {
  try {
    const sab = new SharedArrayBuffer(8);
    const r = Atomics.wait(new Int32Array(sab), 0, 0, 20);
    add("w-atomics-wait", "Atomics.wait in worker", r === "timed-out" ? "PASS" : "BLOCKED", `Atomics.wait returned "${r}" (expected "timed-out").`, true);
  } catch (e) { add("w-atomics-wait", "Atomics.wait in worker", typeof Atomics === "undefined" ? "NA" : "BLOCKED", msg(e), true); }
}

function wasmThreads() {
  try {
    if (!WebAssembly.validate(THREADS_MODULE)) { add("w-wasm-threads", "WebAssembly threads/atomics", "NA", "Engine rejects shared memory + atomic instructions.", true); return; }
    const inst = new WebAssembly.Instance(new WebAssembly.Module(THREADS_MODULE));
    add("w-wasm-threads", "WebAssembly threads/atomics", "PASS", "A module with shared memory and an atomic instruction compiled and instantiated.", true);
    return inst;
  } catch (e) { add("w-wasm-threads", "WebAssembly threads/atomics", "BLOCKED", msg(e), true); }
}

// QEMU-WASM turns hot translation blocks into many tiny WebAssembly modules at runtime.
// This measures synchronous compile+instantiate throughput. It does NOT predict emulation speed.
function compileThroughput() {
  try {
    const N = 300, t0 = performance.now();
    for (let i = 0; i < N; i++) { const m = new WebAssembly.Module(BIGINT_MODULE); new WebAssembly.Instance(m); }
    const ms = performance.now() - t0;
    add("w-tb-compile", "Runtime module compile (JIT-style)", "PASS",
      `${N} tiny modules compiled+instantiated in ${ms.toFixed(1)} ms (${(ms * 1000 / N).toFixed(0)} µs each). QEMU-WASM depends on this path; real TB modules are larger, so treat as a floor, not a prediction.`);
  } catch (e) { add("w-tb-compile", "Runtime module compile (JIT-style)", "BLOCKED", msg(e)); }
}

async function opfsSync() {
  const label = "OPFS sync access handle (virtual disk path)";
  if (!(navigator.storage && navigator.storage.getDirectory)) { add("w-opfs-sync", label, "NA", "navigator.storage.getDirectory is not available in workers.", true); return; }
  let handle, root, name = "bd-diag-" + Math.random().toString(36).slice(2) + ".bin";
  try {
    root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle(name, { create: true });
    if (typeof fh.createSyncAccessHandle !== "function") { add("w-opfs-sync", label, "NA", "FileSystemSyncAccessHandle is not implemented.", true); return; }
    handle = await fh.createSyncAccessHandle();
    const chunk = new Uint8Array(1 << 20); for (let i = 0; i < chunk.length; i++) chunk[i] = (i * 31 + 7) & 255;
    const CH = 8, t0 = performance.now();
    for (let i = 0; i < CH; i++) handle.write(chunk, { at: i * chunk.length });
    handle.flush();
    const tw = performance.now() - t0;
    const size = handle.getSize();
    const back = new Uint8Array(chunk.length), t1 = performance.now();
    handle.read(back, { at: 3 * chunk.length });
    const tr = performance.now() - t1;
    let same = size === CH * chunk.length; for (let i = 0; same && i < back.length; i += 4099) if (back[i] !== chunk[i]) same = false;
    handle.truncate(0); handle.close(); handle = null;
    await root.removeEntry(name);
    add("w-opfs-sync", label, same ? "PASS" : "BLOCKED",
      same ? `8 MiB written+flushed (${(8 / (tw / 1000)).toFixed(0)} MiB/s), 1 MiB read back verified (${(1 / (tr / 1000)).toFixed(0)} MiB/s), truncate/remove OK. Small-scale test only.` : `Read-back mismatch or wrong size (${size}).`, true);
  } catch (e) {
    add("w-opfs-sync", label, "BLOCKED", msg(e), true);
    try { handle && handle.close(); root && await root.removeEntry(name); } catch (_) {}
  }
}

function offscreen() {
  if (typeof OffscreenCanvas === "undefined") {
    add("w-offscreen", "OffscreenCanvas in worker", "NA", "OffscreenCanvas is not defined in workers.");
    add("w-webgl2", "WebGL2 in worker", "NA", "Needs OffscreenCanvas.");
    return;
  }
  try { const c = new OffscreenCanvas(16, 16); const g = c.getContext("2d"); add("w-offscreen", "OffscreenCanvas in worker", g ? "PASS" : "BLOCKED", g ? "2D context created." : "getContext('2d') returned null."); }
  catch (e) { add("w-offscreen", "OffscreenCanvas in worker", "BLOCKED", msg(e)); }
  try { const c = new OffscreenCanvas(16, 16); const g = c.getContext("webgl2"); add("w-webgl2", "WebGL2 in worker", g ? "PASS" : "BLOCKED", g ? "WebGL2 context created on an OffscreenCanvas." : "getContext('webgl2') returned null."); }
  catch (e) { add("w-webgl2", "WebGL2 in worker", "BLOCKED", msg(e)); }
}

function nestedWorker() {
  return new Promise((resolve) => {
    if (typeof Worker === "undefined") { add("w-nested", "Worker spawned from a worker", "NA", "Worker constructor not exposed in workers."); return resolve(); }
    let w, url, done = false;
    const fin = (s, d) => { if (done) return; done = true; try { w && w.terminate(); url && URL.revokeObjectURL(url); } catch (_) {} add("w-nested", "Worker spawned from a worker", s, d); resolve(); };
    try {
      url = URL.createObjectURL(new Blob(["postMessage('ok')"], { type: "text/javascript" }));
      w = new Worker(url);
      w.onmessage = () => fin("PASS", "A nested blob worker started and replied.");
      w.onerror = (e) => fin("BLOCKED", "Nested worker error: " + (e.message || "unknown"));
      setTimeout(() => fin("BLOCKED", "Nested worker did not reply within 3 s."), 3000);
    } catch (e) { fin("BLOCKED", msg(e)); }
  });
}

self.onmessage = async (ev) => {
  if (!ev.data || ev.data.type !== "run") return;
  out.length = 0;
  envChecks();
  sharedMemoryRoundTrip(ev.data.mem);
  atomicsWait();
  wasmThreads();
  compileThroughput();
  offscreen();
  await nestedWorker();
  await opfsSync();
  self.postMessage({ type: "done", results: out, hardwareConcurrency: navigator.hardwareConcurrency || null });
};
self.postMessage({ type: "ready" });

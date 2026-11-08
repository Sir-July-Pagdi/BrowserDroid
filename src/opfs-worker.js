/* Writes a File/Blob into OPFS using a sync access handle. Safari on iPad lacks (or fails) main-thread createWritable();
 * sync access handles in workers are the path the diagnostics page showed working. Data never leaves the device. */
self.onmessage = async (ev) => {
  const { dir, name, file } = ev.data;
  let handle;
  try {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle(dir, { create: true });
    const fh = await d.getFileHandle(name, { create: true });
    handle = await fh.createSyncAccessHandle();
    handle.truncate(0);
    const CH = 4 * 1024 * 1024; let at = 0;
    while (at < file.size) {
      const buf = new Uint8Array(await file.slice(at, at + CH).arrayBuffer());
      const n = handle.write(buf, { at }); if (n !== buf.byteLength) throw new Error(`short write (${n}/${buf.byteLength})`);
      at += buf.byteLength;
    }
    handle.flush(); handle.close(); handle = null;
    self.postMessage({ ok: true, size: at });
  } catch (e) {
    try { handle && handle.close(); } catch (_) {}
    self.postMessage({ ok: false, error: (e && (e.name ? e.name + ": " : "") + e.message) || String(e) });
  }
};

const DB_NAME = "browserdroid-local";
const DB_VERSION = 1;
const APK_STORE = "apks";
const FILE_DIR = "apk-files";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APK_STORE)) {
        const store = db.createObjectStore(APK_STORE, { keyPath: "id" });
        store.createIndex("importedAt", "importedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listApks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(APK_STORE, "readonly").objectStore(APK_STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.importedAt - a.importedAt));
    req.onerror = () => reject(req.error);
  });
}

async function writeViaWorker(name, file) {
  await new Promise((resolve, reject) => {
    const w = new Worker(new URL("./opfs-worker.js", import.meta.url));
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve() : reject(new Error("Storage write failed: " + e.data.error)); };
    w.onerror = (e) => { w.terminate(); reject(new Error("Storage worker failed to start: " + (e.message || "unknown"))); };
    w.postMessage({ dir: FILE_DIR, name, file });
  });
}

async function writeToOpfs(dir, name, file) {
  const handle = await dir.getFileHandle(name, { create: true });
  if (typeof handle.createWritable === "function") {
    try { const w = await handle.createWritable(); await w.write(file); await w.close(); return; }
    catch (_) { /* fall through to the worker path (Safari) */ }
  }
  await writeViaWorker(name, file);
}

export async function saveApk(file) {
  if (!file.name.toLowerCase().endsWith(".apk")) throw new Error(`"${file.name}" is not an .apk file (iOS may rename or unzip files; pick the original .apk).`);
  if (!("storage" in navigator) || !navigator.storage.getDirectory) {
    throw new Error("This browser does not support the required Origin Private File System API.");
  }
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(FILE_DIR, { create: true });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ()]/g, "_");
  const storedName = `${id}-${safeName}`;
  await writeToOpfs(dir, storedName, file);

  const record = { id, name: file.name, storedName, size: file.size, type: file.type || "application/vnd.android.package-archive", importedAt: Date.now() };
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const req = db.transaction(APK_STORE, "readwrite").objectStore(APK_STORE).put(record);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  return record;
}

export async function readApk(id) {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const req = db.transaction(APK_STORE, "readonly").objectStore(APK_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!record) throw new Error("APK record not found.");
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(FILE_DIR);
  const handle = await dir.getFileHandle(record.storedName);
  return { record, file: await handle.getFile() };
}

export async function removeApk(id) {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const req = db.transaction(APK_STORE, "readonly").objectStore(APK_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (record && navigator.storage.getDirectory) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(FILE_DIR);
      await dir.removeEntry(record.storedName);
    } catch (e) { console.warn("Could not remove APK file:", e); }
  }
  await new Promise((resolve, reject) => {
    const req = db.transaction(APK_STORE, "readwrite").objectStore(APK_STORE).delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

export async function storageInfo() {
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  return { usage: estimate.usage || 0, quota: estimate.quota || 0, persisted };
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function exportManifest() {
  const items = await listApks();
  const payload = { exportedAt: new Date().toISOString(), note: "Metadata only; APK binaries are not included.", apks: items.map(({id,name,size,type,importedAt}) => ({id,name,size,type,importedAt: new Date(importedAt).toISOString()})) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "browserdroid-library-manifest.json"; a.click();
  URL.revokeObjectURL(url);
}
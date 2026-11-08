import { listApks, saveApk, readApk, removeApk, storageInfo, requestPersistence, exportManifest } from "./db.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
const dateFmt = (n) => new Date(n).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
let toastTimer;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function navigate(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  $("page-title").textContent = ({device:"Virtual device",apps:"APK library",storage:"Storage",about:"Project status"})[view] || "Virtual device";
  $("sidebar").classList.remove("open");
  if (view === "apps") renderApks();
  if (view === "storage") refreshStorage();
}
document.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => navigate(el.dataset.view)));
$("menu-btn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("year").textContent = new Date().getFullYear();

// iOS/iPadOS greys out files whose type it does not know (.apk) when an accept filter is set, so drop the filter; saveApk validates the name.
document.querySelectorAll('input[type="file"]').forEach(i => i.removeAttribute("accept"));

async function importFiles(files) {
  for (const file of files) {
    try { await saveApk(file); toast(`Imported ${file.name}`); }
    catch (err) { toast(err.message || "Import failed"); }
  }
  await refreshAll();
}
$("apk-input").addEventListener("change", e => importFiles([...e.target.files]));
$("apk-input-2").addEventListener("change", e => importFiles([...e.target.files]));

function apkRow(item) {
  const row = document.createElement("div"); row.className = "apk-row";
  const name = document.createElement("div"); name.className = "apk-name";
  const icon = document.createElement("span"); icon.className = "file-icon"; icon.textContent = "APK";
  const title = document.createElement("strong"); title.textContent = item.name;
  name.append(icon,title);
  const size = document.createElement("small"); size.className = "size-cell"; size.textContent = fmt(item.size);
  const date = document.createElement("small"); date.className = "date-cell"; date.textContent = dateFmt(item.importedAt);
  const actions = document.createElement("div"); actions.className = "row-actions";
  const download = document.createElement("button"); download.className = "mini-btn"; download.textContent = "Export";
  download.addEventListener("click", async () => {
    try { const {file,record} = await readApk(item.id); const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href=url; a.download=record.name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
    catch(err) { toast(err.message); }
  });
  const del = document.createElement("button"); del.className = "mini-btn danger"; del.textContent = "Delete";
  del.addEventListener("click", async () => { if(confirm(`Delete ${item.name} from this browser?`)){await removeApk(item.id);await refreshAll();toast("APK removed");} });
  actions.append(download,del); row.append(name,size,date,actions); return row;
}
async function renderApks() {
  const items = await listApks().catch(() => []);
  $("apk-list").replaceChildren();
  if (!items.length) { const empty=document.createElement("div"); empty.className="empty-state"; empty.textContent="Your APK library is empty."; $("apk-list").append(empty); }
  else items.forEach(item => $("apk-list").append(apkRow(item)));
}
async function refreshRecent() {
  const items = await listApks().catch(() => []);
  $("app-count").textContent = items.length; $("apk-total").textContent = items.length; $("storage-files").textContent = items.length;
  const list = $("recent-apps"); list.replaceChildren();
  if (!items.length) { const empty=document.createElement("div");empty.className="empty-small";empty.textContent="No APKs imported yet.";list.append(empty);return; }
  items.slice(0,3).forEach(item => {
    const row=document.createElement("div");row.className="recent-item";
    const ico=document.createElement("span");ico.className="file-icon";ico.textContent="APK";
    const label=document.createElement("span");label.textContent=item.name;
    const size=document.createElement("small");size.textContent=fmt(item.size);
    row.append(ico,label,size);list.append(row);
  });
}
async function refreshStorage() {
  try {
    const s = await storageInfo();
    $("storage-used").textContent = fmt(s.usage);
    $("storage-quota").textContent = `Estimated quota: ${s.quota ? fmt(s.quota) : "not reported"}`;
    $("storage-meter").style.width = s.quota ? `${Math.min(100,(s.usage/s.quota)*100)}%` : "0%";
    $("persist-state").textContent = s.persisted ? "Granted" : "Not granted";
    $("disk-status").textContent = "OPFS available";
  } catch (e) {
    $("storage-used").textContent = "Unavailable"; $("storage-quota").textContent = e.message; $("disk-status").textContent = "Unavailable";
  }
}
async function refreshAll(){await Promise.all([refreshRecent(),renderApks(),refreshStorage()]);}
$("persist-btn").addEventListener("click", async () => { const ok=await requestPersistence(); await refreshStorage(); toast(ok ? "Persistent storage granted" : "Browser did not grant persistent storage"); });
$("export-index").addEventListener("click", exportManifest);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(console.warn);
refreshAll();
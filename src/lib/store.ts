import type { Project } from "./model";
const DB = "openreview-studio";
const VERSION = 1;
const STORE = "projects";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function loadProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result as Project[]);
    r.onerror = () => reject(r.error);
  });
}
export async function saveProjects(projects: Project[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const p of projects) store.put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

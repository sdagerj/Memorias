// Capa de almacenamiento local con IndexedDB.
// Guarda los recuerdos (incluyendo fotos como Blobs) y los ajustes del usuario.
// Todo vive en el dispositivo del usuario: no hay servidor.

const DB_NAME = 'memorias-db';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_SETTINGS = 'settings';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllEntries() {
  const store = await tx(STORE_ENTRIES, 'readonly');
  const entries = await reqToPromise(store.getAll());
  // Más recientes primero (por fecha, luego por creación).
  return entries.sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export async function getEntry(id) {
  const store = await tx(STORE_ENTRIES, 'readonly');
  return reqToPromise(store.get(id));
}

export async function saveEntry(entry) {
  const store = await tx(STORE_ENTRIES, 'readwrite');
  await reqToPromise(store.put(entry));
  return entry;
}

export async function deleteEntry(id) {
  const store = await tx(STORE_ENTRIES, 'readwrite');
  return reqToPromise(store.delete(id));
}

export async function clearAllEntries() {
  const store = await tx(STORE_ENTRIES, 'readwrite');
  return reqToPromise(store.clear());
}

export async function getSetting(key, fallback = null) {
  const store = await tx(STORE_SETTINGS, 'readonly');
  const row = await reqToPromise(store.get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const store = await tx(STORE_SETTINGS, 'readwrite');
  return reqToPromise(store.put({ key, value }));
}

// --- Copia de seguridad ---
// Convierte un Blob a dataURL para poder exportarlo como texto JSON.
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataURL) {
  const [meta, b64] = dataURL.split(',');
  const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function exportBackup() {
  const entries = await getAllEntries();
  const out = [];
  for (const e of entries) {
    const photos = [];
    for (const p of e.photos || []) {
      photos.push({ name: p.name, dataURL: await blobToDataURL(p.blob) });
    }
    out.push({ ...e, photos });
  }
  const settings = {
    authorName: await getSetting('authorName', ''),
    bookTitle: await getSetting('bookTitle', ''),
  };
  return { version: 1, exportedAt: new Date().toISOString(), settings, entries: out };
}

export async function importBackup(data) {
  if (!data || !Array.isArray(data.entries)) throw new Error('Archivo no válido');
  for (const e of data.entries) {
    const photos = (e.photos || []).map((p) => ({
      name: p.name,
      blob: dataURLToBlob(p.dataURL),
    }));
    await saveEntry({ ...e, photos });
  }
  if (data.settings) {
    if (data.settings.authorName) await setSetting('authorName', data.settings.authorName);
    if (data.settings.bookTitle) await setSetting('bookTitle', data.settings.bookTitle);
  }
}

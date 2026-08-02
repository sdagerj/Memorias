// Capa de almacenamiento local con IndexedDB.
// Guarda los recuerdos (incluyendo fotos como Blobs) y los ajustes del usuario.
// Todo vive en el dispositivo del usuario: no hay servidor.

const DB_NAME = 'memorias-db';
const DB_VERSION = 3;
const STORE_ENTRIES = 'entries';
const STORE_SETTINGS = 'settings';
const STORE_BOOKS = 'books';
const STORE_NUMBERS = 'numbers';

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
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NUMBERS)) {
        db.createObjectStore(STORE_NUMBERS, { keyPath: 'id' });
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

// Safari en iPhone (WebKit) puede fallar al guardar Blobs directamente en
// IndexedDB. Para evitarlo, las fotos se almacenan como ArrayBuffer (muy
// compatible) y se reconvierten a Blob al leerlas. El resto de la app sigue
// usando `photo.blob` con normalidad.
async function serializePhotos(photos) {
  const out = [];
  for (const p of photos || []) {
    if (p.data instanceof ArrayBuffer) {
      out.push({ name: p.name, type: p.type || 'image/jpeg', data: p.data });
    } else if (p.blob) {
      out.push({ name: p.name, type: p.blob.type || 'image/jpeg', data: await p.blob.arrayBuffer() });
    }
  }
  return out;
}

function deserializePhotos(photos) {
  return (photos || []).map((p) => {
    // Compatibilidad con datos antiguos guardados como Blob.
    if (p.blob) return { name: p.name, blob: p.blob };
    return { name: p.name, blob: new Blob([p.data], { type: p.type || 'image/jpeg' }) };
  });
}

export async function getAllEntries() {
  const store = await tx(STORE_ENTRIES, 'readonly');
  const entries = await reqToPromise(store.getAll());
  for (const e of entries) e.photos = deserializePhotos(e.photos);
  // Más recientes primero (por fecha, luego por creación).
  return entries.sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export async function getEntry(id) {
  const store = await tx(STORE_ENTRIES, 'readonly');
  const entry = await reqToPromise(store.get(id));
  if (entry) entry.photos = deserializePhotos(entry.photos);
  return entry;
}

export async function saveEntry(entry) {
  // Convertimos las fotos a ArrayBuffer ANTES de abrir la transacción.
  const record = { ...entry, photos: await serializePhotos(entry.photos) };
  const store = await tx(STORE_ENTRIES, 'readwrite');
  await reqToPromise(store.put(record));
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

// --- Libros ---
export async function getAllBooks() {
  const store = await tx(STORE_BOOKS, 'readonly');
  const books = await reqToPromise(store.getAll());
  return books.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getBook(id) {
  const store = await tx(STORE_BOOKS, 'readonly');
  return reqToPromise(store.get(id));
}

export async function saveBook(book) {
  const store = await tx(STORE_BOOKS, 'readwrite');
  await reqToPromise(store.put(book));
  return book;
}

export async function deleteBook(id) {
  const store = await tx(STORE_BOOKS, 'readwrite');
  return reqToPromise(store.delete(id));
}

// --- El Número ---
export async function getAllNumbers() {
  const store = await tx(STORE_NUMBERS, 'readonly');
  const items = await reqToPromise(store.getAll());
  return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getNumber(id) {
  const store = await tx(STORE_NUMBERS, 'readonly');
  return reqToPromise(store.get(id));
}

export async function saveNumber(item) {
  const store = await tx(STORE_NUMBERS, 'readwrite');
  await reqToPromise(store.put(item));
  return item;
}

export async function deleteNumber(id) {
  const store = await tx(STORE_NUMBERS, 'readwrite');
  return reqToPromise(store.delete(id));
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
  const books = await getAllBooks();
  const numbers = await getAllNumbers();
  return { version: 3, exportedAt: new Date().toISOString(), settings, entries: out, books, numbers };
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
  for (const b of data.books || []) {
    await saveBook(b);
  }
  for (const n of data.numbers || []) {
    await saveNumber(n);
  }
  if (data.settings) {
    if (data.settings.authorName) await setSetting('authorName', data.settings.authorName);
    if (data.settings.bookTitle) await setSetting('bookTitle', data.settings.bookTitle);
  }
}

// Fusiona una copia de seguridad sin sobreescribir los datos locales.
// Para entradas que ya existen: conserva el título y texto local, pero agrega
// las fotos nuevas que vengan en el archivo (compara por nombre).
// Para entradas nuevas: las importa completas.
export async function mergeBackup(data) {
  if (!data || !Array.isArray(data.entries)) throw new Error('Archivo no válido');
  let added = 0, merged = 0;
  for (const e of data.entries) {
    const incoming = (e.photos || []).map((p) => ({
      name: p.name,
      blob: dataURLToBlob(p.dataURL),
    }));
    const existing = await getEntry(e.id);
    if (existing) {
      // Agrega solo las fotos que no estén ya (por nombre).
      const existingNames = new Set((existing.photos || []).map((p) => p.name));
      const newPhotos = incoming.filter((p) => !existingNames.has(p.name));
      if (newPhotos.length) {
        existing.photos = [...(existing.photos || []), ...newPhotos];
        await saveEntry(existing);
        merged++;
      }
    } else {
      await saveEntry({ ...e, photos: incoming });
      added++;
    }
  }
  for (const n of data.numbers || []) {
    const existing = await getNumber(n.id);
    if (!existing) await saveNumber(n);
  }
  return { added, merged };
}

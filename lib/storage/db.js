// Persistence. IndexedDB implementation behind a tiny async interface so a backend
// (REST / SQL) can replace it later without touching the UI:
//   listFiles, getFile, putFile, deleteFile,
//   listDiagrams, getDiagram, putDiagram, putDiagrams, deleteDiagram, deleteDiagramsByFile, clearAll
//
// Stores
//   files:    { id, name, hash, size, text (ORIGINAL markdown, never modified), skipped[], summary, importedAt }
//   diagrams: { ...Diagram, fileId, createdAt, updatedAt, edited: boolean }

const DB_NAME = 'diagram-workbench';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this browser'));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('diagrams')) {
        const s = db.createObjectStore('diagrams', { keyPath: 'id' });
        s.createIndex('fileId', 'fileId', { unique: false });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
      resolve(req.result);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    const r = fn(t.objectStore(store), t);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  }));
}

const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export const storage = {
  listFiles: () => tx('files', 'readonly', (s) => s.getAll()),
  getFile: (id) => tx('files', 'readonly', (s) => s.get(id)),
  putFile: (f) => tx('files', 'readwrite', (s) => s.put(clone(f))),
  deleteFile: (id) => tx('files', 'readwrite', (s) => s.delete(id)),

  listDiagrams: () => tx('diagrams', 'readonly', (s) => s.getAll()),
  getDiagram: (id) => tx('diagrams', 'readonly', (s) => s.get(id)),
  putDiagram: (d) => tx('diagrams', 'readwrite', (s) => s.put(clone(d))),
  putDiagrams: (list) => tx('diagrams', 'readwrite', (s) => { list.forEach((d) => s.put(clone(d))); }),
  deleteDiagram: (id) => tx('diagrams', 'readwrite', (s) => s.delete(id)),
  deleteDiagramsByFile: (fileId) => tx('diagrams', 'readwrite', (s) => {
    const idx = s.index('fileId');
    const req = idx.openKeyCursor(IDBKeyRange.only(fileId));
    req.onsuccess = () => { const c = req.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
    return req;
  }),
  clearAll: async () => {
    await tx('diagrams', 'readwrite', (s) => s.clear());
    await tx('files', 'readwrite', (s) => s.clear());
  },
};

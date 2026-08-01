// Everything lives in the browser: IndexedDB holds the plants (photos included)
// and the settings. Nothing is uploaded except the photo you ask to identify.

const DB_NAME = 'garden-library';
const DB_VERSION = 1;
const PLANTS = 'plants';
const SETTINGS = 'settings';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PLANTS)) {
        const store = db.createObjectStore(PLANTS, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run(storeName, mode, work) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const result = work(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const plants = {
  all: () => run(PLANTS, 'readonly', (store) => store.getAll()),
  get: (id) => run(PLANTS, 'readonly', (store) => store.get(id)),
  put: (plant) => run(PLANTS, 'readwrite', (store) => store.put(plant)),
  remove: (id) => run(PLANTS, 'readwrite', (store) => store.delete(id)),
};

export const settings = {
  async all() {
    const rows = await run(SETTINGS, 'readonly', (store) => store.getAll());
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },
  set: (key, value) => run(SETTINGS, 'readwrite', (store) => store.put({ key, value })),
};

export async function exportAll() {
  const [allPlants, allSettings] = await Promise.all([plants.all(), settings.all()]);
  return {
    format: 'garden-library/v1',
    exportedAt: new Date().toISOString(),
    settings: allSettings,
    plants: allPlants,
  };
}

export async function importAll(data, { replace = false } = {}) {
  if (!data || data.format !== 'garden-library/v1' || !Array.isArray(data.plants)) {
    throw new Error('That file is not a Garden Library backup.');
  }
  if (replace) {
    const existing = await plants.all();
    await Promise.all(existing.map((plant) => plants.remove(plant.id)));
  }
  const existingIds = new Set((await plants.all()).map((plant) => plant.id));
  let added = 0;
  for (const plant of data.plants) {
    const record = existingIds.has(plant.id) ? { ...plant, id: newId() } : plant;
    await plants.put(record);
    added += 1;
  }
  return added;
}

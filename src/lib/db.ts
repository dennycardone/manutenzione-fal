// Archivio locale nel browser (IndexedDB). Nessun dato lascia il dispositivo.

const DB_NAME = 'manutenzione-fal';
const VERSION = 1;
export const STORES = ['kv', 'files'] as const;
type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const db = {
  get: <T = unknown>(store: StoreName, key: string) => tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>),
  set: (store: StoreName, key: string, value: unknown) => tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => tx<undefined>(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>),
  keys: (store: StoreName) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()),
  clear: (store: StoreName) => tx<undefined>(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>),
};

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function storageEstimate(): Promise<string> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return '';
    const mb = (n?: number) => ((n || 0) / 1048576).toFixed(0) + ' MB';
    return `${mb(e.usage)} usati di ${mb(e.quota)} disponibili`;
  } catch {
    return '';
  }
}

export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

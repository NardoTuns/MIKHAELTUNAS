// Penyimpanan lokal (IndexedDB). Semua data tetap di HP — termasuk yang sudah tersinkron —
// agar bisa dilihat & dipakai saat offline. Data tidak pernah dihapus otomatis.
//
// Store:
//   foods  : {id, user, date, time, meal, name, portion, kcal, protein, carbs, fat, note, updatedAt, deleted, synced}
//   water  : {key:"user|date", user, date, glasses, updatedAt, synced}
//   weight : {key:"user|date", user, date, kg, updatedAt, deleted, synced}
//   kv     : {k, v}  — pengaturan, daftar pengguna, menu favorit, cache, status sinkron
// "user" = id lokal pengguna (bukan ID sinkron). synced = 0/1 (boolean tidak bisa diindeks).

const DB_NAME = 'catatmakan-web';
const DB_VERSION = 1;
let dbp = null;

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      // Versi skema 1. Perubahan skema berikutnya WAJIB lewat blok if (oldVersion < N) agar data lama tetap ada.
      if (!db.objectStoreNames.contains('foods')) {
        const s = db.createObjectStore('foods', { keyPath: 'id' });
        s.createIndex('user', 'user');
        s.createIndex('user_synced', ['user', 'synced']);
      }
      for (const name of ['water', 'weight']) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: 'key' });
          s.createIndex('user', 'user');
          s.createIndex('user_synced', ['user', 'synced']);
        }
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Database sedang dipakai tab lain. Tutup tab Catat Makan yang lain.'));
  });
  return dbp;
}

async function tx(stores, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaksi dibatalkan'));
    Promise.resolve(fn(t)).then((v) => { out = v; }, (e) => { try { t.abort(); } catch { /* sudah selesai */ } reject(e); });
  });
}

// ------------------------------------------------------------------ kv
export async function kvGet(k, def = null) {
  const r = await tx(['kv'], 'readonly', (t) => req(t.objectStore('kv').get(k)));
  return r ? r.v : def;
}
export const kvSet = (k, v) => tx(['kv'], 'readwrite', (t) => req(t.objectStore('kv').put({ k, v })));
export const kvDel = (k) => tx(['kv'], 'readwrite', (t) => req(t.objectStore('kv').delete(k)));
export async function kvKeys(prefix) {
  const keys = await tx(['kv'], 'readonly', (t) => req(t.objectStore('kv').getAllKeys()));
  return keys.filter((k) => String(k).startsWith(prefix));
}
export async function kvDelPrefix(prefix) {
  const keys = await kvKeys(prefix);
  await tx(['kv'], 'readwrite', (t) => Promise.all(keys.map((k) => req(t.objectStore('kv').delete(k)))));
  return keys.length;
}

// ------------------------------------------------------------------ data pengguna
export const keyOf = (user, date) => `${user}|${date}`;

/** Semua baris milik pengguna (termasuk yang ditandai terhapus, untuk sinkron). */
export function loadUser(user) {
  return tx(['foods', 'water', 'weight'], 'readonly', async (t) => {
    const [foods, water, weight] = await Promise.all(['foods', 'water', 'weight'].map((s) => req(t.objectStore(s).index('user').getAll(user))));
    return { foods, water, weight };
  });
}

export const put = (store, rec) => tx([store], 'readwrite', (t) => req(t.objectStore(store).put(rec)));
export const putMany = (store, recs) => tx([store], 'readwrite', (t) => Promise.all(recs.map((r) => req(t.objectStore(store).put(r)))));
export const getOne = (store, key) => tx([store], 'readonly', (t) => req(t.objectStore(store).get(key)));

export const unsynced = (store, user) => tx([store], 'readonly', (t) => req(t.objectStore(store).index('user_synced').getAll([user, 0])));

/** Tandai tersinkron hanya bila belum diubah lagi sejak dikirim (sama seperti markSynced di Android). */
export function markSynced(store, items) {
  return tx([store], 'readwrite', async (t) => {
    const os = t.objectStore(store);
    for (const it of items) {
      const cur = await req(os.get(store === 'foods' ? it.id : it.key));
      if (cur && cur.updatedAt === it.updatedAt && cur.synced === 0) { cur.synced = 1; await req(os.put(cur)); }
    }
  });
}

/** Terapkan data dari server: hanya bila lebih baru dari data lokal. Mengembalikan jumlah yang diterapkan. */
export function applyRemote(store, recs) {
  return tx([store], 'readwrite', async (t) => {
    const os = t.objectStore(store);
    let n = 0;
    for (const r of recs) {
      const cur = await req(os.get(store === 'foods' ? r.id : r.key));
      if (!cur || r.updatedAt > cur.updatedAt) { await req(os.put({ ...r, synced: 1 })); n++; }
    }
    return n;
  });
}

/** Hapus seluruh data satu pengguna (hanya atas permintaan pengguna). */
export function deleteUserData(user) {
  return tx(['foods', 'water', 'weight'], 'readwrite', async (t) => {
    for (const s of ['foods', 'water', 'weight']) {
      const keys = await req(t.objectStore(s).index('user').getAllKeys(user));
      for (const k of keys) await req(t.objectStore(s).delete(k));
    }
  });
}

export async function countUnsynced(user) {
  const [a, b, c] = await Promise.all(['foods', 'water', 'weight'].map((s) => unsynced(s, user)));
  return a.length + b.length + c.length;
}

/** Minta browser tidak menghapus data saat ruang penyimpanan menipis. */
export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch { return false; }
}

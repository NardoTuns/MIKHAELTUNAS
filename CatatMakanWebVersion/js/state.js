// Status aplikasi: pengguna, data pengguna aktif (di memori + IndexedDB), pengaturan, sinkron.
import * as db from './core/db.js';
import { withDefaults } from './core/nutrition.js';
import { uuid, today, addDays } from './core/util.js';
import { syncUser, ping, deviceName } from './core/sync.js';
import { DEFAULT_SCRIPT_URL, AVATAR_EMOJIS, AVATAR_COLORS } from './config.js';

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(kind = 'data') { for (const fn of [...listeners]) { try { fn(kind); } catch (e) { console.error(e); } } }

export const S = {
  ready: false,
  app: { scriptUrl: DEFAULT_SCRIPT_URL, autoSync: true, theme: 'auto', currentUserId: null, deviceId: '' },
  users: [],
  user: null,
  settings: withDefaults({}),
  menus: [],
  foods: new Map(),
  water: new Map(),
  weight: new Map(),
  date: today(),
  servers: {}, // url → info ping
  sync: { running: false, lastAt: 0, lastMsg: '', error: null, pending: 0, lastPull: 0 },
  chat: [],
};

// ------------------------------------------------------------------ awal
export async function init() {
  await db.openDb();
  S.app = { ...S.app, ...(await db.kvGet('app', {})) };
  if (!S.app.deviceId) { S.app.deviceId = uuid(); await saveApp(); }
  S.users = await db.kvGet('users', []);
  S.servers = await db.kvGet('servers', {});
  if (S.users.length) {
    S.user = S.users.find((u) => u.id === S.app.currentUserId) || S.users[0];
    await loadUserData();
  }
  S.ready = true;
}

export const saveApp = () => db.kvSet('app', S.app);
const saveUsers = () => db.kvSet('users', S.users);
export const device = () => deviceName(S.app.deviceId);
export const scriptUrlFor = (u = S.user) => ((u && u.scriptUrl) || S.app.scriptUrl || '').trim();

async function loadUserData() {
  const uid = S.user.id;
  S.settings = withDefaults(await db.kvGet('settings:' + uid, {}));
  S.menus = await db.kvGet('menus:' + uid, []);
  const d = await db.loadUser(uid);
  S.foods = new Map(d.foods.map((r) => [r.id, r]));
  S.water = new Map(d.water.map((r) => [r.date, r]));
  S.weight = new Map(d.weight.map((r) => [r.date, r]));
  const st = await db.kvGet('sync:' + uid, {});
  S.sync = { ...S.sync, lastAt: st.lastAt || 0, lastMsg: st.lastMsg || '', lastPull: st.lastPull || 0, error: st.error || null };
  S.sync.pending = await db.countUnsynced(uid);
  S.chat = [];
}

// ------------------------------------------------------------------ baca data
export const settings = () => ({ ...S.settings, name: S.user ? S.user.name : '' });
const alive = (r) => !r.deleted;
export const allFoods = () => [...S.foods.values()].filter(alive);
export const foodsOn = (date) => allFoods().filter((e) => e.date === date).sort((a, b) => a.time.localeCompare(b.time));
export const foodsBetween = (from, to) => allFoods().filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
export const waterOn = (date) => S.water.get(date)?.glasses || 0;
export const watersBetween = (from, to) => [...S.water.values()].filter((w) => w.date >= from && w.date <= to).map((w) => ({ date: w.date, glasses: w.glasses }));
export const weights = () => [...S.weight.values()].filter(alive).sort((a, b) => a.date.localeCompare(b.date));

// ------------------------------------------------------------------ ubah data
let autoTimer = null;
function changed() {
  S.sync.pending++;
  emit('data');
  if (S.app.autoSync && scriptUrlFor()) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { if (navigator.onLine) syncNow({ silent: true }); }, 4000);
  }
}

export async function saveFood(e) {
  const rec = {
    id: e.id || uuid(), user: S.user.id, date: e.date, time: e.time, meal: e.meal, name: String(e.name).trim(),
    portion: Number(e.portion) || 1, kcal: Number(e.kcal) || 0, protein: Number(e.protein) || 0, carbs: Number(e.carbs) || 0, fat: Number(e.fat) || 0,
    note: String(e.note || '').trim(), updatedAt: Date.now(), deleted: false, synced: 0,
  };
  await db.put('foods', rec);
  S.foods.set(rec.id, rec);
  changed();
  return rec;
}

export async function saveFoods(list) {
  const out = [];
  for (const e of list) out.push(await saveFood(e));
  return out;
}

export async function deleteFood(e) {
  const rec = { ...S.foods.get(e.id), deleted: true, updatedAt: Date.now(), synced: 0 };
  await db.put('foods', rec);
  S.foods.set(rec.id, rec);
  changed();
}

export async function copyDay(from, to) {
  const list = foodsOn(from);
  for (const e of list) await saveFood({ ...e, id: uuid(), date: to });
  return list.length;
}

export async function addWater(date, delta) {
  const cur = waterOn(date);
  const n = Math.max(0, Math.min(30, cur + delta));
  if (n === cur) return n;
  const rec = { key: db.keyOf(S.user.id, date), user: S.user.id, date, glasses: n, updatedAt: Date.now(), synced: 0 };
  await db.put('water', rec);
  S.water.set(date, rec);
  changed();
  return n;
}

export async function saveWeight(date, kg) {
  const rec = { key: db.keyOf(S.user.id, date), user: S.user.id, date, kg: Number(kg), updatedAt: Date.now(), deleted: false, synced: 0 };
  await db.put('weight', rec);
  S.weight.set(date, rec);
  changed();
}

export async function deleteWeight(date) {
  const cur = S.weight.get(date);
  if (!cur) return;
  const rec = { ...cur, deleted: true, updatedAt: Date.now(), synced: 0 };
  await db.put('weight', rec);
  S.weight.set(date, rec);
  changed();
}

// ------------------------------------------------------------------ pengaturan & menu (ikut profil)
function touchProfile(u = S.user) {
  u.profileUpdatedAt = Date.now();
  u.profileDirty = true;
}

export async function saveSettings(patch) {
  S.settings = withDefaults({ ...S.settings, ...patch });
  delete S.settings.name;
  await db.kvSet('settings:' + S.user.id, S.settings);
  touchProfile();
  await saveUsers();
  changedProfile();
}

function changedProfile() {
  emit('settings');
  if (S.app.autoSync && scriptUrlFor() && serverInfo()?.multiUser) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { if (navigator.onLine) syncNow({ silent: true }); }, 6000);
  }
}

export async function saveMenu(name, items) {
  S.menus = [...S.menus, {
    id: uuid(), name: name.trim(),
    items: items.map((i) => ({ name: i.name, portion: i.portion, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat })),
  }];
  await db.kvSet('menus:' + S.user.id, S.menus);
  touchProfile(); await saveUsers(); changedProfile();
}

export async function deleteMenu(id) {
  S.menus = S.menus.filter((m) => m.id !== id);
  await db.kvSet('menus:' + S.user.id, S.menus);
  touchProfile(); await saveUsers(); changedProfile();
}

export const menuTotal = (m) => m.items.reduce((a, i) => a + i.kcal * i.portion, 0);

// ------------------------------------------------------------------ pengguna
export const SYNC_ID_RE = /^[a-z0-9][a-z0-9_.-]{1,39}$/;

export function suggestSyncId(name) {
  const slug = String(name || 'pengguna').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'pengguna';
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${slug}-${rnd}`;
}

export function validateSyncId(syncId, exceptId) {
  if (syncId !== '' && !SYNC_ID_RE.test(syncId)) return 'ID sinkron 2–40 karakter: huruf kecil, angka, titik, minus, garis bawah.';
  if (S.users.some((u) => u.id !== exceptId && (u.syncId || '') === syncId)) return 'ID sinkron sudah dipakai pengguna lain di HP ini.';
  return null;
}

export async function createUser({ name, emoji, color, syncId, settings: st }) {
  const u = {
    id: uuid(), name: String(name).trim().slice(0, 30), emoji: emoji || AVATAR_EMOJIS[S.users.length % AVATAR_EMOJIS.length],
    color: color || AVATAR_COLORS[S.users.length % AVATAR_COLORS.length], syncId: syncId ?? suggestSyncId(name),
    // profileUpdatedAt = 0: profil bawaan HP baru tidak boleh menimpa profil yang sudah ada di Spreadsheet
    // (ID sinkron sama di HP lain). Server memakai "updatedAt terbaru menang", jadi profil server yang ditarik.
    scriptUrl: '', syncEnabled: true, pinHash: null, pinSalt: null, createdAt: Date.now(), profileUpdatedAt: 0, profileDirty: true,
  };
  S.users.push(u);
  await saveUsers();
  if (st) await db.kvSet('settings:' + u.id, withDefaults(st));
  return u;
}

export async function updateUser(id, patch) {
  const u = S.users.find((x) => x.id === id);
  Object.assign(u, patch);
  if ('name' in patch || 'emoji' in patch || 'color' in patch) touchProfile(u);
  await saveUsers();
  emit('user');
}

export async function switchUser(id) {
  const u = S.users.find((x) => x.id === id);
  if (!u) return;
  S.user = u;
  S.app.currentUserId = id;
  await saveApp();
  await loadUserData();
  S.date = today();
  emit('user');
}

export async function removeUser(id, { deleteData }) {
  if (S.users.length <= 1) throw new Error('Minimal harus ada satu pengguna.');
  S.users = S.users.filter((u) => u.id !== id);
  await saveUsers();
  if (deleteData) {
    await db.deleteUserData(id);
    for (const p of ['settings:', 'menus:', 'sync:', 'ai:', 'fired:']) await db.kvDelPrefix(p + id);
  }
  if (S.user.id === id) await switchUser(S.users[0].id);
  else emit('user');
}

async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(id, pin) {
  const u = S.users.find((x) => x.id === id);
  if (!pin) { u.pinHash = null; u.pinSalt = null; } else {
    u.pinSalt = uuid();
    u.pinHash = await sha256Hex(u.pinSalt + ':' + pin);
  }
  await saveUsers();
}

export async function checkPin(u, pin) {
  if (!u.pinHash) return true;
  return (await sha256Hex(u.pinSalt + ':' + pin)) === u.pinHash;
}

// ------------------------------------------------------------------ AI cache (per pengguna)
export const getAi = (key) => db.kvGet(`ai:${S.user.id}:${key}`);
export async function putAi(key, val) {
  await db.kvSet(`ai:${S.user.id}:${key}`, val);
  const keys = await db.kvKeys(`ai:${S.user.id}:`);
  if (keys.length > 80) for (const k of keys.sort().slice(0, 30)) await db.kvDel(k);
}

// ------------------------------------------------------------------ sinkron
export const serverInfo = (u = S.user) => S.servers[scriptUrlFor(u)] || null;

export async function ensureServer(url, force = false) {
  const cur = S.servers[url];
  if (!force && cur && Date.now() - cur.checkedAt < 30 * 60000) return cur;
  const info = await ping(url);
  S.servers[url] = { version: info.version || '1.0', features: info.features, multiUser: info.multiUser, ai: !!info.ai, message: info.message, checkedAt: Date.now() };
  await db.kvSet('servers', S.servers);
  return S.servers[url];
}

async function profileFor(u) {
  const st = u.id === S.user.id ? S.settings : withDefaults(await db.kvGet('settings:' + u.id, {}));
  const menus = u.id === S.user.id ? S.menus : await db.kvGet('menus:' + u.id, []);
  return { data: { name: u.name, emoji: u.emoji, color: u.color, settings: st, menus }, updatedAt: u.profileUpdatedAt || 0, dirty: !!u.profileDirty };
}

async function applyProfile(u, p) {
  const d = p.data || {};
  if (d.settings) {
    const st = withDefaults(d.settings);
    delete st.name;
    await db.kvSet('settings:' + u.id, st);
    if (u.id === S.user.id) S.settings = st;
  }
  if (Array.isArray(d.menus)) {
    await db.kvSet('menus:' + u.id, d.menus);
    if (u.id === S.user.id) S.menus = d.menus;
  }
  if (d.name) u.name = String(d.name).slice(0, 30);
  if (d.emoji) u.emoji = d.emoji;
  if (d.color) u.color = d.color;
  u.profileUpdatedAt = p.updatedAt;
  u.profileDirty = false;
}

let syncPromise = null;
let queued = null;
let queuedOpts = null;

/**
 * Sinkron pengguna aktif (atau semua pengguna). Mengembalikan pesan status.
 * Bila sinkron sedang berjalan, permintaan baru diantrikan (digabung) dan dijalankan sesudahnya,
 * agar perubahan/pengguna yang baru ditambahkan tidak terlewat.
 */
export function syncNow(opts = {}) {
  if (syncPromise) {
    queuedOpts = queuedOpts
      ? { silent: queuedOpts.silent && !!opts.silent, fullReload: queuedOpts.fullReload || !!opts.fullReload, all: queuedOpts.all || !!opts.all }
      : { silent: !!opts.silent, fullReload: !!opts.fullReload, all: !!opts.all };
    queued ||= syncPromise.then(() => { const o = queuedOpts; queued = null; queuedOpts = null; return syncNow(o); });
    return queued;
  }
  const { fullReload = false, all = false } = opts;
  syncPromise = (async () => {
    const targets = all ? S.users.filter((u) => u.syncEnabled !== false) : [S.user];
    S.sync.running = true;
    emit('sync');
    const msgs = [];
    try {
      for (const u of targets) {
        const url = scriptUrlFor(u);
        if (!url) { if (u.id === S.user.id) msgs.push('URL Web App belum diisi.'); continue; }
        const st = await db.kvGet('sync:' + u.id, {});
        let msg;
        let error = null;
        try {
          const server = await ensureServer(url, fullReload);
          const prof = await profileFor(u);
          const startedProfile = u.profileUpdatedAt;
          const res = await syncUser({ url, user: u, server, device: device(), lastPull: fullReload ? 0 : st.lastPull || 0, profile: prof });
          if (res.profileSent && u.profileUpdatedAt === startedProfile) u.profileDirty = false;
          if (res.profile) await applyProfile(u, res.profile);
          await saveUsers();
          msg = `Berhasil (dikirim ${res.up}, diterima ${res.down})`;
          await db.kvSet('sync:' + u.id, { lastPull: res.serverTime, lastAt: Date.now(), lastMsg: msg, error: null });
        } catch (e) {
          error = e.message || String(e);
          msg = 'Gagal: ' + error;
          await db.kvSet('sync:' + u.id, { ...st, lastAt: Date.now(), lastMsg: msg, error });
        }
        if (u.id === S.user.id) { msgs.push(msg); S.sync.error = error; }
      }
      await loadUserData();
      return msgs.join('\n');
    } finally {
      S.sync.running = false;
      syncPromise = null;
      emit('sync');
      emit('data');
    }
  })();
  return syncPromise;
}

// ------------------------------------------------------------------ cadangan file (fitur web)
export async function exportBackup({ all = false } = {}) {
  const list = all ? S.users : [S.user];
  const users = [];
  for (const u of list) {
    const d = await db.loadUser(u.id);
    users.push({
      user: { ...u, pinHash: undefined, pinSalt: undefined },
      settings: await db.kvGet('settings:' + u.id, {}), menus: await db.kvGet('menus:' + u.id, []),
      foods: d.foods.map(({ synced, ...r }) => r), water: d.water.map(({ synced, ...r }) => r), weight: d.weight.map(({ synced, ...r }) => r),
    });
  }
  return { format: 'CATATMAKAN-BACKUP', formatVersion: 1, exportedAt: new Date().toISOString(), app: { scriptUrl: S.app.scriptUrl }, users };
}

/** Pulihkan cadangan: digabung dengan data yang ada (yang lebih baru menang). */
export async function importBackup(obj) {
  if (!obj || obj.format !== 'CATATMAKAN-BACKUP' || !Array.isArray(obj.users)) throw new Error('File bukan cadangan Catat Makan.');
  let added = 0; let records = 0;
  for (const b of obj.users) {
    const src = b.user || {};
    let u = S.users.find((x) => x.id === src.id) || S.users.find((x) => (x.syncId || '') === (src.syncId || '') && x.name === src.name);
    if (!u) {
      const clash = validateSyncId(src.syncId || '', null);
      u = await createUser({ name: src.name || 'Pengguna', emoji: src.emoji, color: src.color, syncId: clash ? suggestSyncId(src.name) : src.syncId || '' });
      if (b.settings) await db.kvSet('settings:' + u.id, withDefaults(b.settings));
      if (b.menus) await db.kvSet('menus:' + u.id, b.menus);
      added++;
    }
    const uid = u.id;
    const fix = (r, store) => {
      const out = { ...r, user: uid, synced: 0 };
      if (store !== 'foods') out.key = db.keyOf(uid, r.date);
      return out;
    };
    for (const store of ['foods', 'water', 'weight']) {
      const recs = (b[store] || []).filter((r) => r && r.date).map((r) => fix(r, store));
      const n = await db.applyRemote(store, recs);
      records += n;
    }
    // baris impor ditandai synced=1 oleh applyRemote; tandai ulang agar ikut terkirim ke Spreadsheet
    for (const store of ['foods', 'water', 'weight']) {
      const all = (await db.loadUser(uid))[store].filter((r) => (b[store] || []).some((x) => (store === 'foods' ? x.id === r.id : x.date === r.date) && x.updatedAt === r.updatedAt));
      await db.putMany(store, all.map((r) => ({ ...r, synced: 0 })));
    }
  }
  await loadUserData();
  emit('user');
  return { added, records };
}

export function rollDateIfNeeded(prevToday) {
  const t = today();
  if (prevToday !== t && S.date === prevToday) { S.date = t; emit('data'); }
  return t;
}

export const yesterday = () => addDays(today(), -1);

// Sinkron 2 arah dengan Google Spreadsheet lewat Apps Script (port SyncEngine.kt + multi pengguna).
// PUSH: kirim data lokal yang belum tersinkron. PULL: ambil yang berubah sejak tarikan terakhir.
// Konflik: perubahan terbaru (updatedAt) menang. Data lokal yang sudah tersinkron TIDAK dihapus.
import * as db from './db.js';

const TIMEOUT_MS = 45000;
const PUSH_CHUNK = 400;

export class SyncError extends Error {}

function withParams(url, params) {
  const q = new URLSearchParams(params).toString();
  return url.trim() + (url.includes('?') ? '&' : '?') + q;
}

async function parseJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    throw new SyncError("Balasan bukan JSON. Cek URL (harus berakhiran /exec) dan akses Web App = 'Siapa saja'.");
  }
}

function netError(e) {
  if (e.name === 'AbortError') return new SyncError('Server terlalu lama merespons. Coba lagi.');
  if (e instanceof SyncError) return e;
  return new SyncError(navigator.onLine === false ? 'Tidak ada koneksi internet.' : 'Gagal menghubungi server. Cek URL Web App & koneksi.');
}

export async function apiGet(url, params, timeout = TIMEOUT_MS) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(withParams(url, params), { signal: ctl.signal, cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new SyncError(`Server membalas HTTP ${res.status}`);
    return await parseJson(res);
  } catch (e) { throw netError(e); } finally { clearTimeout(tm); }
}

/** POST "simple request" (text/plain) agar tidak memicu preflight CORS di Apps Script. */
export async function apiPost(url, body, timeout = TIMEOUT_MS) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url.trim(), {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: ctl.signal, cache: 'no-store', redirect: 'follow',
    });
    if (!res.ok) throw new SyncError(`Server membalas HTTP ${res.status}`);
    return await parseJson(res);
  } catch (e) { throw netError(e); } finally { clearTimeout(tm); }
}

/** Info server: { ok, version, features[], ai, message } */
export async function ping(url) {
  const o = await apiGet(url, { action: 'ping' }, 20000);
  if (!o.ok) throw new SyncError(o.error || 'Gagal terhubung');
  return { ...o, features: o.features || [], multiUser: (o.features || []).includes('users') };
}

// ---- konversi lokal ⇄ server (format sama dengan aplikasi Android)
const foodOut = (e) => ({ id: e.id, date: e.date, time: e.time, meal: e.meal, name: e.name, portion: e.portion, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, note: e.note || '', updatedAt: e.updatedAt, deleted: !!e.deleted });
const waterOut = (w) => ({ date: w.date, glasses: w.glasses, updatedAt: w.updatedAt });
const weightOut = (w) => ({ date: w.date, kg: w.kg, updatedAt: w.updatedAt, deleted: !!w.deleted });
const bool = (v) => v === true || String(v).toLowerCase() === 'true';
const n = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

const foodIn = (o, uid) => ({
  id: String(o.id || ''), user: uid, date: String(o.date || ''), time: String(o.time || '12:00'), meal: String(o.meal || 'Camilan'),
  name: String(o.name || ''), portion: n(o.portion, 1), kcal: n(o.kcal), protein: n(o.protein), carbs: n(o.carbs), fat: n(o.fat),
  note: String(o.note || ''), updatedAt: n(o.updatedAt), deleted: bool(o.deleted),
});
const waterIn = (o, uid) => ({ key: db.keyOf(uid, String(o.date)), user: uid, date: String(o.date || ''), glasses: Math.round(n(o.glasses)), updatedAt: n(o.updatedAt) });
const weightIn = (o, uid) => ({ key: db.keyOf(uid, String(o.date)), user: uid, date: String(o.date || ''), kg: n(o.kg), updatedAt: n(o.updatedAt), deleted: bool(o.deleted) });

export function deviceName(deviceId) {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Perangkat';
  return `Web ${os} (${String(deviceId).slice(0, 6)})`;
}

/**
 * Sinkronkan satu pengguna.
 * user: {id, syncId, ...}; server: hasil ping(); state: {lastPull}; profile: {data, updatedAt, dirty}
 * Mengembalikan { up, down, serverTime, profile } — profile = profil dari server bila lebih baru.
 */
export async function syncUser({ url, user, server, device, lastPull = 0, profile = null }) {
  const syncId = user.syncId || '';
  if (!server.multiUser && syncId !== '') {
    throw new SyncError('Sinkron pengguna tambahan butuh Code.gs versi 2.0. Perbarui Apps Script (lihat README), pengguna utama tetap bisa sinkron.');
  }
  const uid = user.id;
  const [foods, waters, weights] = await Promise.all([db.unsynced('foods', uid), db.unsynced('water', uid), db.unsynced('weight', uid)]);
  let up = 0;
  const sendProfile = server.multiUser && profile && profile.dirty;
  // ---------- PUSH (bertahap agar permintaan tidak terlalu besar)
  const batches = [];
  for (let i = 0; i < Math.max(foods.length, waters.length, weights.length, sendProfile ? 1 : 0); i += PUSH_CHUNK) {
    batches.push({ food: foods.slice(i, i + PUSH_CHUNK), water: waters.slice(i, i + PUSH_CHUNK), weight: weights.slice(i, i + PUSH_CHUNK) });
  }
  for (const [bi, b] of batches.entries()) {
    const body = {
      action: 'push', device, user: syncId,
      food: b.food.map(foodOut), water: b.water.map(waterOut), weight: b.weight.map(weightOut),
    };
    if (sendProfile && bi === 0) body.profile = { data: profile.data, updatedAt: profile.updatedAt };
    const res = await apiPost(url, body);
    if (!res.ok) throw new SyncError(res.error || 'Gagal mengirim data');
    await db.markSynced('foods', b.food);
    await db.markSynced('water', b.water);
    await db.markSynced('weight', b.weight);
    up += b.food.length + b.water.length + b.weight.length;
  }
  // ---------- PULL
  const params = { action: 'pull', since: String(lastPull || 0) };
  if (server.multiUser) params.user = syncId;
  const res = await apiGet(url, params);
  if (!res.ok) throw new SyncError(res.error || 'Gagal mengambil data');
  const valid = (r) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
  let down = 0;
  down += await db.applyRemote('foods', (res.food || []).map((o) => foodIn(o, uid)).filter((r) => r.id && valid(r)));
  down += await db.applyRemote('water', (res.water || []).map((o) => waterIn(o, uid)).filter(valid));
  down += await db.applyRemote('weight', (res.weight || []).map((o) => weightIn(o, uid)).filter(valid));
  let remoteProfile = null;
  if (res.profile && res.profile.data && n(res.profile.updatedAt) > (profile?.updatedAt || 0)) {
    try { remoteProfile = { data: typeof res.profile.data === 'string' ? JSON.parse(res.profile.data) : res.profile.data, updatedAt: n(res.profile.updatedAt) }; } catch { /* abaikan profil rusak */ }
  }
  return { up, down, serverTime: n(res.serverTime, lastPull), profile: remoteProfile, profileSent: !!sendProfile };
}

// Saran kalori online (port NutritionLookup.kt + AiCoach.kt bagian jaringan).
// 1. AI (Gemini) lewat Apps Script milik pengguna. 2. Open Food Facts (produk kemasan & barcode).
// Hasil disimpan di HP (cache), jadi pencarian yang sama berikutnya instan & bisa offline.
import { apiGet, apiPost, SyncError } from './sync.js';
import { kvGet, kvSet, kvKeys, kvDel } from './db.js';
import { friendlyError } from './aicoach.js';

const OFF_GAP_MS = 7000; // batas Open Food Facts: ±10 pencarian/menit
let lastOff = 0;

const nz = (v) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function cacheGet(key) { return kvGet('cache:' + key); }
async function cachePut(key, value) {
  await kvSet('cache:' + key, value);
  if (Math.random() < 0.05) { // sesekali bersihkan bila terlalu banyak
    const keys = await kvKeys('cache:');
    if (keys.length > 300) await Promise.all(keys.slice(0, 100).map(kvDel));
  }
}
export async function clearCache() { const keys = await kvKeys('cache:'); await Promise.all(keys.map(kvDel)); return keys.length; }

function parseItems(arr, source) {
  return (Array.isArray(arr) ? arr : []).map((o) => {
    const name = String(o?.name || '').trim();
    const kcal = Number(o?.kcal);
    if (!name || !Number.isFinite(kcal) || kcal < 0) return null;
    return { name: cap(name), info: String(o.portion || '1 porsi'), kcal, protein: nz(o.protein), carbs: nz(o.carbs), fat: nz(o.fat), source };
  }).filter(Boolean).slice(0, 6);
}

function pickName(p) {
  for (const k of ['product_name_id', 'product_name', 'product_name_en']) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const s = v.id || v.en || Object.values(v)[0];
      if (s && String(s).trim()) return String(s).trim();
    }
  }
  return '';
}
const pickBrand = (p) => (Array.isArray(p.brands) ? p.brands[0] : typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : '') || '';

export function productToFood(p) {
  if (!p) return null;
  const name = pickName(p);
  const n = p.nutriments;
  if (!name || !n) return null;
  const kcalOf = (suf) => {
    const k = Number(n['energy-kcal' + suf]);
    if (Number.isFinite(k)) return k;
    const kj = Number(n['energy' + suf]);
    return Number.isFinite(kj) ? kj / 4.184 : NaN;
  };
  const brand = pickBrand(p);
  const source = brand ? `Kemasan · ${brand}` : 'Produk kemasan';
  const serving = kcalOf('_serving');
  if (Number.isFinite(serving) && serving > 0) {
    const size = String(p.serving_size || '').trim();
    return { name, info: size ? `1 sajian (${size})` : '1 sajian', kcal: serving, protein: nz(n.proteins_serving), carbs: nz(n.carbohydrates_serving), fat: nz(n.fat_serving), source };
  }
  const k100 = kcalOf('_100g');
  if (!Number.isFinite(k100) || k100 <= 0) return null;
  return { name, info: 'per 100 g/ml', kcal: k100, protein: nz(n.proteins_100g), carbs: nz(n.carbohydrates_100g), fat: nz(n.fat_100g), source };
}

const OFF_FIELDS = 'code,product_name,product_name_id,product_name_en,brands,nutriments,serving_size';

async function offSearch(q, scriptUrl, server) {
  const direct = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=8&langs=id,en&fields=${OFF_FIELDS}`;
  try {
    const r = await fetch(direct, { cache: 'no-store' });
    if (r.ok) return ((await r.json()).hits || []).map(productToFood).filter(Boolean).slice(0, 4);
  } catch { /* diblokir CORS di sebagian browser → lewat Apps Script */ }
  if (scriptUrl && server?.features?.includes('off')) {
    const o = await apiGet(scriptUrl, { action: 'off', q }, 20000);
    if (o.ok) return (o.hits || []).map(productToFood).filter(Boolean).slice(0, 4);
  }
  return [];
}

/** Saran saat mengetik nama makanan. */
export async function suggest(q, { scriptUrl, server }) {
  q = q.trim();
  const key = 'q:' + q.toLowerCase();
  const hit = await cacheGet(key);
  if (hit) return hit;
  const out = [];
  let aiOk = false;
  if (scriptUrl) {
    try {
      const o = await apiGet(scriptUrl, { action: 'estimate', q }, 25000);
      if (o.ok) { out.push(...parseItems(o.items, 'AI')); aiOk = true; }
    } catch { /* AI belum aktif / gagal */ }
  }
  const now = Date.now();
  if (now - lastOff > OFF_GAP_MS) {
    lastOff = now;
    try { out.push(...await offSearch(q, scriptUrl, server)); } catch { /* lewati */ }
  }
  if (out.length && (aiOk || !scriptUrl)) await cachePut(key, out);
  return out;
}

/** Produk kemasan dari barcode. null = belum ada di database. */
export async function barcode(code) {
  const key = 'b:' + code;
  const hit = await cacheGet(key);
  if (hit) return hit;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new SyncError(`Server produk membalas HTTP ${r.status}`);
  const o = await r.json();
  if (o.status !== 1) return null;
  const f = productToFood(o.product);
  if (f) await cachePut(key, f);
  return f;
}

/** Foto makanan → AI (lewat Apps Script). base64 tanpa prefiks data:. */
export async function photo(scriptUrl, base64, mime = 'image/jpeg') {
  if (!scriptUrl) throw new SyncError('Isi URL Web App dulu di Pengaturan');
  const o = await apiPost(scriptUrl, { action: 'photo', mime, image: base64 }, 90000);
  if (!o.ok) throw new SyncError(friendlyError(o.error));
  return parseItems(o.items, 'AI foto');
}

const OLD_SCRIPT = 'Code.gs di Apps Script masih versi lama. Ganti dengan Code.gs versi terbaru, lalu Terapkan › Kelola deployment › Edit › Versi baru.';

export async function analyze(scriptUrl, summary, device, user) {
  if (!scriptUrl) throw new SyncError('Isi URL Web App dulu di Pengaturan');
  const o = await apiPost(scriptUrl, { action: 'analyze', device, user, summary }, 120000);
  if (!o.ok) throw new SyncError(friendlyError(o.error));
  if (!o.analysis) throw new SyncError(OLD_SCRIPT);
  return o.analysis;
}

export async function ask(scriptUrl, question, summary, history) {
  if (!scriptUrl) throw new SyncError('Isi URL Web App dulu di Pengaturan');
  const o = await apiPost(scriptUrl, {
    action: 'ask', question: question.slice(0, 500), summary,
    history: history.slice(-6).map((h) => ({ role: h.fromUser ? 'pengguna' : 'asisten', text: h.text.slice(0, 800) })),
  }, 120000);
  if (!o.ok) throw new SyncError(friendlyError(o.error));
  if (!('answer' in o)) throw new SyncError(OLD_SCRIPT);
  return String(o.answer || '').replaceAll('**', '').replaceAll('__', '').replaceAll('##', '').trim();
}

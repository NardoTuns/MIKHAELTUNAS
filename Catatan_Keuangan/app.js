'use strict';
/* =====================================================================
   Catatan Keuangan Keluarga — app.js
   Data disimpan di HP (IndexedDB) lalu disinkron ke Google Spreadsheet
   lewat Google Apps Script (lihat Code.gs & PANDUAN.md).
   ===================================================================== */

const VER = self.APP_VERSION || { v: '0', d: '' };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* ------------------------------ Ikon ------------------------------ */
const IC = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  gear: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  out: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  in: '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ------------------------------ Util ------------------------------ */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => isoDate(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const fmtDate = (s) => { if (!s) return ''; const d = parseDate(s); return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDateLong = (s) => { const d = parseDate(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const fmtMonth = (k) => { const [y, m] = k.split('-').map(Number); return `${BULAN[m - 1]} ${y}`; };
const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const daysInMonth = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const num = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
const rp = (n) => (n < 0 ? '-' : '') + 'Rp ' + num(Math.abs(n));
const rpShort = (n) => {
  const a = Math.abs(n); let s;
  if (a >= 1e9) s = trimZero((a / 1e9).toFixed(1)) + ' M';
  else if (a >= 1e6) s = trimZero((a / 1e6).toFixed(1)) + ' jt';
  else if (a >= 1e3) s = Math.round(a / 1e3) + ' rb';
  else s = String(Math.round(a));
  return (n < 0 ? '-' : '') + s.replace('.', ',');
};
const trimZero = (s) => s.endsWith('.0') ? s.slice(0, -2) : s;
const parseAmount = (s) => Number(String(s).replace(/\D/g, '')) || 0;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sum = (arr, f = (r) => r.jumlah) => arr.reduce((a, r) => a + (Number(f(r)) || 0), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function toast(msg, type = '', ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + type; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

function ask(msg, { ok = 'Ya', cancel = 'Batal', danger = false } = {}) {
  return new Promise((res) => {
    $('#dlgMsg').textContent = msg;
    const yes = $('#dlgYes'), no = $('#dlgNo');
    yes.textContent = ok; no.textContent = cancel; no.hidden = !cancel;
    yes.classList.toggle('danger', danger);
    $('#dlgBg').hidden = false;
    const done = (v) => { $('#dlgBg').hidden = true; yes.onclick = no.onclick = null; res(v); };
    yes.onclick = () => done(true); no.onclick = () => done(false);
  });
}

function openSheet(title, html) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  $('#sheetBody').scrollTop = 0;
  $('#sheet').hidden = $('#sheetBg').hidden = false;
  return $('#sheetBody');
}
function closeSheet() { $('#sheet').hidden = $('#sheetBg').hidden = true; $('#sheetBody').innerHTML = ''; E = null; }

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* --------------------------- IndexedDB --------------------------- */
const DB = {
  db: null, all: [],
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('catatan-keuangan', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('trx')) r.result.createObjectStore('trx', { keyPath: 'id' }); };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  load() {
    return new Promise((res, rej) => {
      const q = this.db.transaction('trx', 'readonly').objectStore('trx').getAll();
      q.onsuccess = () => { this.all = q.result || []; AC = null; res(this.all); };
      q.onerror = () => rej(q.error);
    });
  },
  putMany(recs) {
    if (!recs.length) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = this.db.transaction('trx', 'readwrite');
      const st = t.objectStore('trx');
      recs.forEach((r) => st.put(r));
      t.oncomplete = () => {
        const idx = new Map(this.all.map((r, i) => [r.id, i]));
        recs.forEach((r) => { const i = idx.get(r.id); if (i !== undefined) this.all[i] = r; else { idx.set(r.id, this.all.length); this.all.push(r); } });
        AC = null; res();
      };
      t.onerror = () => rej(t.error);
    });
  },
  put(r) { return this.putMany([r]); },
  delMany(ids) {
    if (!ids.length) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = this.db.transaction('trx', 'readwrite');
      const st = t.objectStore('trx');
      ids.forEach((id) => st.delete(id));
      t.oncomplete = () => { const s = new Set(ids); this.all = this.all.filter((r) => !s.has(r.id)); AC = null; res(); };
      t.onerror = () => rej(t.error);
    });
  },
  clear() {
    return new Promise((res, rej) => {
      const t = this.db.transaction('trx', 'readwrite');
      t.objectStore('trx').clear();
      t.oncomplete = () => { this.all = []; AC = null; res(); };
      t.onerror = () => rej(t.error);
    });
  },
  get(id) { return this.all.find((r) => r.id === id); }
};
const active = () => DB.all.filter((r) => !r.deleted);

/* --------------------------- Pengaturan --------------------------- */
const DEFAULTS = {
  persons: ['Dodo', 'Geby'],
  sources: [{ name: 'Tunai', saldoAwal: 0 }, { name: 'Bank BRI', saldoAwal: 0 }, { name: 'Bank Sulut', saldoAwal: 0 }],
  categories: ['Makan & Minum', 'Belanja Dapur', 'Transportasi', 'Tagihan & Listrik', 'Pulsa & Internet', 'Pendidikan', 'Kesehatan', 'Anak', 'Rumah Tangga', 'Persembahan & Sosial', 'Hiburan', 'Gaji', 'Usaha', 'Lainnya'],
  budget: 0,
  updatedAt: '',
  // hanya lokal (tidak ikut sinkron)
  scriptUrl: '', token: '', theme: 'auto', lastPerson: '', lastSumber: '', lastSync: '', settingsDirty: false, device: ''
};
const SHARED_KEYS = ['persons', 'sources', 'categories', 'budget'];
let S = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ck_settings') || '{}'); } catch (e) { /* rusak → pakai bawaan */ }
  return Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), saved);
})();
if (!S.device) S.device = 'HP-' + uid().slice(0, 5).toUpperCase();
// koneksi Spreadsheet diambil langsung dari config.js
const CFG = self.APP_CONFIG || {};
if (CFG.SCRIPT_URL) S.scriptUrl = CFG.SCRIPT_URL;
if (CFG.TOKEN !== undefined) S.token = CFG.TOKEN;
function saveS(shared = false) {
  if (shared) { S.updatedAt = new Date().toISOString(); S.settingsDirty = true; }
  try { localStorage.setItem('ck_settings', JSON.stringify(S)); } catch (e) { toast('Gagal menyimpan pengaturan', 'err'); }
}
const sharedSettings = () => { const o = {}; SHARED_KEYS.forEach((k) => (o[k] = S[k])); return o; };
const sourceNames = () => S.sources.map((s) => s.name);

function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'light' || S.theme === 'dark') r.dataset.theme = S.theme; else delete r.dataset.theme;
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').content = dark ? '#1a1a19' : '#0f766e';
}
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* --------------------------- Navigasi --------------------------- */
const VIEWS = [
  ['catat', 'Catat', 'pen'], ['riwayat', 'Riwayat', 'list'], ['laporan', 'Laporan', 'report'],
  ['analisis', 'Analisis', 'chart'], ['pengaturan', 'Pengaturan', 'gear']
];
let currentView = 'catat';
function go(v) {
  currentView = v;
  $$('.view').forEach((s) => (s.hidden = s.id !== 'v-' + v));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  window.scrollTo(0, 0);
  RENDER[v]();
}
function refreshCurrent() {
  if (currentView === 'catat') renderToday();
  else if (!$('#sheet').hidden) return; // jangan ganggu saat lembar terbuka
  else RENDER[currentView]();
}

/* =============================== CATAT =============================== */
const defaultSumber = () => (S.lastSumber && sourceNames().includes(S.lastSumber) ? S.lastSumber : sourceNames()[0] || '');
const newItem = (prev) => ({
  jenis: prev ? prev.jenis : 'keluar', sumber: prev ? prev.sumber : defaultSumber(),
  kategori: '', uraian: '', jumlah: '', keterangan: '', foto: ''
});
let F = { person: S.persons.includes(S.lastPerson) ? S.lastPerson : '', tanggal: todayStr(), jam: nowTime(), touched: false, items: [newItem()] };
const formDirty = () => F.items.some((it) => it.uraian || it.jumlah || it.keterangan || it.foto);

function renderCatat() {
  renderPersons();
  $('#fTanggal').value = F.tanggal;
  $('#fJam').value = F.jam;
  $('#fHari').textContent = F.tanggal ? fmtDateLong(F.tanggal) + (F.tanggal === todayStr() ? ' (hari ini)' : '') : '';
  renderItems();
  renderToday();
}
function renderPersons() {
  $('#personBtns').innerHTML = S.persons.map((p) =>
    `<button type="button" class="person ${F.person === p ? 'active' : ''}" data-p="${esc(p)}"><span class="av">${esc(p.charAt(0).toUpperCase())}</span>${esc(p)}</button>`).join('');
}
function chipsHtml(values, activeVal, attr) {
  return values.map((v) => `<button type="button" class="chip ${v === activeVal ? 'active' : ''}" ${attr} data-v="${esc(v)}">${esc(v)}</button>`).join('');
}
function itemHtml(it, i) {
  const many = F.items.length > 1;
  return `<div class="card item ${it.jenis === 'masuk' ? 'in' : ''}" data-i="${i}">
    ${many ? `<div class="item-head"><b>Belanja ${i + 1}</b><button type="button" class="icon-btn" data-act="rm-item" aria-label="Hapus item">${icon('trash')}</button></div>` : ''}
    <div class="seg">
      <button type="button" class="seg-btn out ${it.jenis === 'keluar' ? 'active' : ''}" data-act="jenis" data-v="keluar">${icon('out')} Keluar</button>
      <button type="button" class="seg-btn in ${it.jenis === 'masuk' ? 'active' : ''}" data-act="jenis" data-v="masuk">${icon('in')} Masuk</button>
    </div>
    <span class="lbl">Sumber dana</span>
    <div class="chips">${chipsHtml(sourceNames(), it.sumber, 'data-act="sumber"')}</div>
    <span class="lbl">Kategori <span class="opt">(opsional)</span></span>
    <div class="chips scroll">${chipsHtml(S.categories, it.kategori, 'data-act="kategori"')}</div>
    <span class="lbl">Uraian</span>
    <div class="ac-wrap">
      <input class="inp" data-f="uraian" value="${esc(it.uraian)}" placeholder="mis. Beli beras 5 kg" autocomplete="off" enterkeyhint="next">
      <div class="ac-list" hidden></div>
    </div>
    <span class="lbl">Jumlah</span>
    <div class="amount"><span>Rp</span><input data-f="jumlah" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${it.jumlah ? num(it.jumlah) : ''}" autocomplete="off" enterkeyhint="next"><button type="button" class="k000" data-act="000">000</button></div>
    <span class="lbl">Keterangan <span class="opt">(opsional)</span></span>
    <input class="inp" data-f="keterangan" value="${esc(it.keterangan)}" placeholder="Catatan tambahan" autocomplete="off" enterkeyhint="done">
    ${it.foto
      ? `<div class="photo-prev"><img src="${it.foto}" alt="Foto"><button type="button" data-act="rm-foto" aria-label="Hapus foto">✕</button></div>`
      : `<div class="photo-row"><button type="button" class="btn" data-act="cam">${icon('camera')} Kamera</button><button type="button" class="btn" data-act="gal">${icon('image')} Galeri</button></div>`}
  </div>`;
}
function renderItems() {
  $('#items').innerHTML = F.items.map(itemHtml).join('');
  updateTotal();
}
function updateTotal() {
  const out = sum(F.items.filter((i) => i.jenis === 'keluar'), (i) => parseAmount(i.jumlah));
  const inn = sum(F.items.filter((i) => i.jenis === 'masuk'), (i) => parseAmount(i.jumlah));
  const n = F.items.length;
  let main = out && inn ? `${rp(inn - out)}` : rp(out || inn);
  let sub = n > 1 ? `${n} item` : '1 item';
  if (out && inn) sub += ` · keluar ${rp(out)} · masuk ${rp(inn)}`;
  else sub += out || !inn ? ' · total keluar' : ' · total masuk';
  $('#formTotal').innerHTML = `${sub}<b>${main}</b>`;
}

function renderToday() {
  const t = todayStr();
  const list = active().filter((r) => r.tanggal === t).sort((a, b) => (b.jam + b.createdAt).localeCompare(a.jam + a.createdAt));
  const out = sum(list.filter((r) => r.jenis === 'keluar')), inn = sum(list.filter((r) => r.jenis === 'masuk'));
  $('#todayBox').innerHTML = `<h3>Catatan hari ini <small>${list.length} transaksi</small></h3>
    <div class="stat-line">Keluar <b>${rp(out)}</b> · Masuk <b>${rp(inn)}</b></div>
    ${list.length ? list.slice(0, 6).map(trxRow).join('') : '<div class="empty" style="padding:14px">Belum ada catatan hari ini</div>'}
    ${list.length > 6 ? `<button type="button" class="link-btn" data-go="riwayat">Lihat semua di Riwayat →</button>` : ''}`;
}

/* --- autocomplete uraian --- */
let AC = null;
function acIndex() {
  if (AC) return AC;
  const m = new Map();
  for (const r of DB.all) {
    if (r.deleted || !r.uraian) continue;
    const k = norm(r.uraian), d = r.tanggal + r.jam;
    const e = m.get(k);
    if (!e) m.set(k, { t: r.uraian.trim(), n: 1, j: r.jumlah, k: r.kategori, s: r.sumber, d });
    else { e.n++; if (d > e.d) Object.assign(e, { t: r.uraian.trim(), j: r.jumlah, k: r.kategori || e.k, s: r.sumber, d }); }
  }
  AC = [...m.values()];
  return AC;
}
function showAc(input) {
  const list = input.parentElement.querySelector('.ac-list');
  const q = norm(input.value);
  if (!q) { list.hidden = true; return; }
  const found = acIndex()
    .filter((e) => norm(e.t).includes(q) && norm(e.t) !== q)
    .map((e) => ({ e, s: (norm(e.t).startsWith(q) ? 1000 : 0) + e.n }))
    .sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.e);
  if (!found.length) { list.hidden = true; return; }
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
  list.innerHTML = found.map((e) =>
    `<button type="button" class="ac-item" data-act="ac" data-t="${esc(e.t)}"><b>${esc(e.t).replace(re, '<mark>$1</mark>')}</b><small>${e.n}× · ${rp(e.j)}</small></button>`).join('');
  list.hidden = false;
}

/* --- foto --- */
let photoTarget = null; // index item, atau 'edit'
function compressImage(file, max = 1280, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    img.src = url;
  });
}
async function onPhotoPicked(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = await compressImage(f);
    if (photoTarget === 'edit' && E) { E.foto = data; E.fotoUrl = ''; renderEditorPhoto(); }
    else if (F.items[photoTarget]) { F.items[photoTarget].foto = data; renderItems(); }
  } catch (err) { toast('Gagal membaca foto', 'err'); }
}

/* --- simpan --- */
let saving = false;
async function simpan() {
  if (saving) return;
  if (!F.person) {
    toast('Pilih dulu siapa yang input', 'err');
    $('#personBtns').classList.remove('err'); void $('#personBtns').offsetWidth; $('#personBtns').classList.add('err');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (!F.tanggal) { toast('Tanggal belum diisi', 'err'); return; }
  for (let i = 0; i < F.items.length; i++) {
    const it = F.items[i], card = $(`.item[data-i="${i}"]`), label = F.items.length > 1 ? `Belanja ${i + 1}: ` : '';
    if (!it.sumber) { toast(label + 'pilih sumber dana', 'err'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!it.uraian.trim()) { toast(label + 'uraian belum diisi', 'err'); const el = $('[data-f=uraian]', card); el.classList.add('err'); el.focus(); return; }
    if (!(parseAmount(it.jumlah) > 0)) { toast(label + 'jumlah belum diisi', 'err'); const el = $('.amount', card); el.classList.add('err'); $('[data-f=jumlah]', card).focus(); return; }
  }
  // cek data ganda
  const existing = active();
  const dups = F.items.filter((it) => existing.some((r) =>
    r.tanggal === F.tanggal && r.jenis === it.jenis && r.sumber === it.sumber &&
    r.jumlah === parseAmount(it.jumlah) && norm(r.uraian) === norm(it.uraian)));
  const seen = new Set(); let selfDup = false;
  F.items.forEach((it) => { const k = [it.jenis, it.sumber, parseAmount(it.jumlah), norm(it.uraian)].join('|'); if (seen.has(k)) selfDup = true; seen.add(k); });
  if (dups.length || selfDup) {
    const names = dups.map((d) => `• ${d.uraian} — ${rp(parseAmount(d.jumlah))}`).join('\n');
    const msg = dups.length
      ? `Kemungkinan DATA GANDA.\nTransaksi berikut sudah tercatat pada ${fmtDate(F.tanggal)}:\n${names}\n\nTetap simpan?`
      : 'Ada item yang sama persis di formulir ini. Tetap simpan?';
    if (!(await ask(msg, { ok: 'Tetap simpan', cancel: 'Batal' }))) return;
  }

  saving = true; $('#btnSimpan').disabled = true;
  try {
    const now = new Date().toISOString();
    const gid = F.items.length > 1 ? uid() : '';
    const recs = F.items.map((it) => ({
      id: uid(), groupId: gid, tanggal: F.tanggal, jam: F.jam || nowTime(), penginput: F.person,
      jenis: it.jenis, sumber: it.sumber, kategori: it.kategori, uraian: it.uraian.trim(),
      jumlah: parseAmount(it.jumlah), keterangan: it.keterangan.trim(), foto: it.foto, fotoUrl: '',
      createdAt: now, updatedAt: now, synced: 0, deleted: 0, device: S.device
    }));
    await DB.putMany(recs);
    S.lastPerson = F.person; S.lastSumber = F.items[F.items.length - 1].sumber; saveS();
    toast(`✓ ${recs.length} transaksi tersimpan di HP`, 'ok');
    F.items = [newItem()]; F.tanggal = todayStr(); F.jam = nowTime(); F.touched = false;
    renderCatat(); updateSyncChip();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    sync();
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'err');
  } finally { saving = false; $('#btnSimpan').disabled = false; }
}

function bindCatat() {
  $('#personBtns').addEventListener('click', (e) => {
    const b = e.target.closest('.person'); if (!b) return;
    F.person = b.dataset.p; renderPersons();
  });
  $('#fTanggal').addEventListener('change', (e) => { F.tanggal = e.target.value; F.touched = true; $('#fHari').textContent = F.tanggal ? fmtDateLong(F.tanggal) + (F.tanggal === todayStr() ? ' (hari ini)' : '') : ''; });
  $('#fJam').addEventListener('change', (e) => { F.jam = e.target.value; F.touched = true; });
  $('#btnNow').addEventListener('click', () => { F.tanggal = todayStr(); F.jam = nowTime(); F.touched = false; renderCatat(); });
  $('#btnAddItem').addEventListener('click', () => {
    F.items.push(newItem(F.items[F.items.length - 1]));
    renderItems();
    const cards = $$('.item'); const last = cards[cards.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('[data-f=uraian]', last).focus({ preventScroll: true }), 350);
  });
  $('#btnSimpan').addEventListener('click', simpan);

  const items = $('#items');
  items.addEventListener('pointerdown', (e) => { if (e.target.closest('.ac-list')) e.preventDefault(); });
  items.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.item'); const i = +card.dataset.i; const it = F.items[i];
    switch (b.dataset.act) {
      case 'jenis': it.jenis = b.dataset.v; renderItems(); break;
      case 'sumber': it.sumber = b.dataset.v; renderItems(); break;
      case 'kategori': it.kategori = it.kategori === b.dataset.v ? '' : b.dataset.v; renderItems(); break;
      case 'rm-item':
        if (formDirtyItem(it) && !(await ask(`Hapus Belanja ${i + 1} dari formulir?`))) return;
        F.items.splice(i, 1); renderItems(); break;
      case '000': {
        it.jumlah = (it.jumlah || '') + '000';
        if (it.jumlah.length > 15) it.jumlah = it.jumlah.slice(0, 15);
        $('[data-f=jumlah]', card).value = num(it.jumlah); updateTotal(); break;
      }
      case 'cam': photoTarget = i; $('#camInput').click(); break;
      case 'gal': photoTarget = i; $('#galInput').click(); break;
      case 'rm-foto': it.foto = ''; renderItems(); break;
      case 'ac': {
        const e2 = acIndex().find((x) => x.t === b.dataset.t);
        it.uraian = b.dataset.t;
        if (e2) { if (!parseAmount(it.jumlah)) it.jumlah = String(e2.j || ''); if (!it.kategori && e2.k) it.kategori = e2.k; }
        renderItems();
        const inp = $(`.item[data-i="${i}"] [data-f=jumlah]`); inp.focus(); inp.select();
        break;
      }
    }
  });
  items.addEventListener('input', (e) => {
    const f = e.target.dataset.f; if (!f) return;
    const i = +e.target.closest('.item').dataset.i; const it = F.items[i];
    e.target.classList.remove('err');
    if (f === 'jumlah') {
      const raw = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15);
      it.jumlah = raw; e.target.value = raw ? num(raw) : '';
      e.target.closest('.amount').classList.remove('err');
      updateTotal();
    } else {
      it[f] = e.target.value;
      if (f === 'uraian') showAc(e.target);
    }
  });
  items.addEventListener('focusin', (e) => { if (e.target.dataset.f === 'uraian') showAc(e.target); });
  items.addEventListener('focusout', (e) => {
    if (e.target.dataset.f === 'uraian') setTimeout(() => { const l = e.target.parentElement && e.target.parentElement.querySelector('.ac-list'); if (l) l.hidden = true; }, 150);
  });
  items.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const f = e.target.dataset.f; if (!f) return;
    e.preventDefault();
    const card = e.target.closest('.item');
    if (f === 'uraian') { $('.ac-list', card).hidden = true; $('[data-f=jumlah]', card).focus(); }
    else if (f === 'jumlah') $('[data-f=keterangan]', card).focus();
    else e.target.blur();
  });
}
const formDirtyItem = (it) => it.uraian || it.jumlah || it.keterangan || it.foto;

/* ============================== RIWAYAT ============================== */
const RW = { q: '', jenis: 'all', month: monthKeyOf(new Date()), person: 'all', limit: 150 };
function trxRow(r) {
  const meta = [r.jam, r.sumber, r.penginput, r.kategori].filter(Boolean).join(' · ');
  const sign = r.jenis === 'masuk' ? '+' : '−';
  const cls = r.jenis === 'masuk' ? 'in' : 'out';
  return `<button type="button" class="trx" data-id="${r.id}">
    <span class="trx-ic ${cls}">${icon(cls)}</span>
    <span class="trx-main"><b>${esc(r.uraian)}</b><small>${esc(meta)}${r.keterangan ? ' · ' + esc(r.keterangan) : ''}</small></span>
    <span class="trx-amt ${cls}">${sign}${rp(r.jumlah)}<small>${r.foto || r.fotoUrl ? icon('clip', 'sm') : ''}<i class="dot ${r.synced ? 'ok' : 'wait'}" title="${r.synced ? 'Tersinkron' : 'Menunggu sinkron'}"></i>${r.synced ? 'sinkron' : 'di HP'}</small></span>
  </button>`;
}
function renderRiwayat() {
  const all = active();
  const months = uniq(all.map((r) => r.tanggal.slice(0, 7))).sort().reverse();
  const cur = monthKeyOf(new Date());
  if (!months.includes(cur)) months.unshift(cur);
  if (RW.month !== 'all' && !months.includes(RW.month)) months.push(RW.month);
  $('#rBulan').innerHTML = `<option value="all">Semua bulan</option>` + months.map((m) => `<option value="${m}" ${m === RW.month ? 'selected' : ''}>${fmtMonth(m)}</option>`).join('');
  if (RW.month === 'all') $('#rBulan').value = 'all';
  const persons = uniq([...S.persons, ...all.map((r) => r.penginput)]);
  $('#rOrang').innerHTML = `<option value="all">Semua orang</option>` + persons.map((p) => `<option ${p === RW.person ? 'selected' : ''}>${esc(p)}</option>`).join('');
  const pend = DB.all.filter((r) => !r.synced && !r.deleted).length;
  $('#rJenis').innerHTML = [['all', 'Semua'], ['keluar', 'Keluar'], ['masuk', 'Masuk'], ['pending', `Belum sinkron (${pend})`], ['foto', 'Ada foto']]
    .map(([v, l]) => `<button type="button" class="chip ${RW.jenis === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('');

  const q = norm(RW.q);
  let list = all.filter((r) =>
    (RW.month === 'all' || r.tanggal.startsWith(RW.month)) &&
    (RW.person === 'all' || r.penginput === RW.person) &&
    (RW.jenis === 'all' || (RW.jenis === 'pending' ? !r.synced : RW.jenis === 'foto' ? (r.foto || r.fotoUrl) : r.jenis === RW.jenis)) &&
    (!q || norm([r.uraian, r.keterangan, r.kategori, r.sumber, r.penginput, String(r.jumlah)].join(' ')).includes(q)));
  list.sort((a, b) => (b.tanggal + b.jam + b.createdAt).localeCompare(a.tanggal + a.jam + a.createdAt));

  const inn = sum(list.filter((r) => r.jenis === 'masuk')), out = sum(list.filter((r) => r.jenis === 'keluar'));
  $('#rSummary').innerHTML = `<div>Masuk<b class="in-t">${rp(inn)}</b></div><div>Keluar<b>${rp(out)}</b></div><div>Selisih<b>${rp(inn - out)}</b></div>`;

  if (!list.length) { $('#rList').innerHTML = `<div class="empty">Tidak ada transaksi${q ? ' yang cocok' : ''}.</div>`; return; }
  const shown = list.slice(0, RW.limit);
  const byDay = new Map();
  shown.forEach((r) => { if (!byDay.has(r.tanggal)) byDay.set(r.tanggal, []); byDay.get(r.tanggal).push(r); });
  let html = '';
  for (const [d, rs] of byDay) {
    const dOut = sum(rs.filter((r) => r.jenis === 'keluar')), dIn = sum(rs.filter((r) => r.jenis === 'masuk'));
    html += `<div class="day-head"><span>${fmtDateLong(d)}</span><small>${dIn ? '+' + rpShort(dIn) + ' ' : ''}${dOut ? '−' + rpShort(dOut) : ''}</small></div>
      <div class="trx-group">${rs.map(trxRow).join('')}</div>`;
  }
  if (list.length > RW.limit) html += `<button type="button" class="btn block more-btn" id="rMore">Tampilkan lebih banyak (${list.length - RW.limit} lagi)</button>`;
  $('#rList').innerHTML = html;
}
function bindRiwayat() {
  let t;
  $('#rCari').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { RW.q = e.target.value; RW.limit = 150; renderRiwayat(); }, 200); });
  $('#rBulan').addEventListener('change', (e) => { RW.month = e.target.value; RW.limit = 150; renderRiwayat(); });
  $('#rOrang').addEventListener('change', (e) => { RW.person = e.target.value; renderRiwayat(); });
  $('#rJenis').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; RW.jenis = b.dataset.v; renderRiwayat(); });
  $('#rList').addEventListener('click', (e) => {
    if (e.target.id === 'rMore') { RW.limit += 150; renderRiwayat(); }
  });
  // klik transaksi di mana saja → detail
  document.addEventListener('click', (e) => {
    const t2 = e.target.closest('.trx[data-id]'); if (t2) { openDetail(t2.dataset.id); return; }
    const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
  });
}

/* --- detail & edit --- */
function openDetail(id) {
  const r = DB.get(id); if (!r) return;
  const cls = r.jenis === 'masuk' ? 'in' : 'out';
  const body = openSheet(r.jenis === 'masuk' ? 'Uang Masuk' : 'Uang Keluar', `
    <div class="detail-amt ${cls}">${r.jenis === 'masuk' ? '+' : '−'}${rp(r.jumlah)}</div>
    <div style="font-size:17px;font-weight:600">${esc(r.uraian)}</div>
    <dl class="kv">
      <dt>Tanggal</dt><dd>${fmtDateLong(r.tanggal)}, ${esc(r.jam)}</dd>
      <dt>Penginput</dt><dd>${esc(r.penginput)}</dd>
      <dt>Sumber dana</dt><dd>${esc(r.sumber)}</dd>
      <dt>Kategori</dt><dd>${esc(r.kategori || '-')}</dd>
      <dt>Keterangan</dt><dd>${esc(r.keterangan || '-')}</dd>
      <dt>Status</dt><dd>${r.synced ? '<i class="dot ok"></i> Tersinkron ke Spreadsheet' : '<i class="dot wait"></i> Tersimpan di HP, menunggu sinkron'}</dd>
      ${r.groupId ? `<dt>Grup</dt><dd>Bagian dari belanja ${active().filter((x) => x.groupId === r.groupId).length} item</dd>` : ''}
    </dl>
    ${r.foto ? `<img class="detail-photo" src="${r.foto}" alt="Foto">` : ''}
    ${r.fotoUrl ? `<p><a href="${esc(r.fotoUrl)}" target="_blank" rel="noopener">Buka foto di Google Drive ↗</a></p>` : ''}
    <div class="btn-row">
      <button type="button" class="btn" data-d="edit">${icon('pen', 'sm')} Edit</button>
      <button type="button" class="btn" data-d="copy">${icon('copy', 'sm')} Catat lagi</button>
      <button type="button" class="btn danger" data-d="del">${icon('trash', 'sm')} Hapus</button>
    </div>`);
  body.onclick = async (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'edit') openEditor(r);
    if (b.dataset.d === 'copy') {
      closeSheet();
      F.items = [{ jenis: r.jenis, sumber: sourceNames().includes(r.sumber) ? r.sumber : defaultSumber(), kategori: r.kategori, uraian: r.uraian, jumlah: String(r.jumlah), keterangan: '', foto: '' }];
      F.tanggal = todayStr(); F.jam = nowTime(); F.touched = false;
      if (S.persons.includes(r.penginput) && !F.person) F.person = r.penginput;
      go('catat'); toast('Disalin ke formulir. Periksa lalu Simpan.');
    }
    if (b.dataset.d === 'del') {
      if (!(await ask(`Hapus "${r.uraian}" (${rp(r.jumlah)})?\n${r.synced ? 'Data juga akan dihapus dari Spreadsheet saat online.' : ''}`, { ok: 'Hapus', danger: true }))) return;
      await deleteRecord(r);
      closeSheet(); toast('Transaksi dihapus'); refreshCurrent(); updateSyncChip(); sync();
    }
  };
}
async function deleteRecord(r) {
  if (r.synced || r.fotoUrl) await DB.put({ ...r, deleted: 1, synced: 0, foto: '', updatedAt: new Date().toISOString() });
  else await DB.delMany([r.id]);
}

let E = null; // data yang sedang diedit
function openEditor(r) {
  E = { ...r, jumlah: String(r.jumlah) };
  const persons = uniq([...S.persons, r.penginput]);
  const sources = uniq([...sourceNames(), r.sumber]);
  const body = openSheet('Edit Transaksi', `
    <span class="lbl">Penginput</span><div class="chips" data-ed="penginput">${chipsHtml(persons, E.penginput, '')}</div>
    <div class="row2 mt-s">
      <label class="field"><span class="lbl">Tanggal</span><input type="date" class="inp" data-ef="tanggal" value="${E.tanggal}"></label>
      <label class="field"><span class="lbl">Jam</span><input type="time" class="inp" data-ef="jam" value="${E.jam}"></label>
    </div>
    <div class="seg mt" data-ed="jenis">
      <button type="button" class="seg-btn out chip-like ${E.jenis === 'keluar' ? 'active' : ''}" data-v="keluar">${icon('out')} Keluar</button>
      <button type="button" class="seg-btn in chip-like ${E.jenis === 'masuk' ? 'active' : ''}" data-v="masuk">${icon('in')} Masuk</button>
    </div>
    <span class="lbl">Sumber dana</span><div class="chips" data-ed="sumber">${chipsHtml(sources, E.sumber, '')}</div>
    <span class="lbl">Kategori</span><div class="chips scroll" data-ed="kategori" data-toggle="1">${chipsHtml(uniq([...S.categories, E.kategori]), E.kategori, '')}</div>
    <span class="lbl">Uraian</span><input class="inp" data-ef="uraian" value="${esc(E.uraian)}">
    <span class="lbl">Jumlah</span><div class="amount"><span>Rp</span><input data-ef="jumlah" inputmode="numeric" value="${num(E.jumlah)}"></div>
    <span class="lbl">Keterangan</span><input class="inp" data-ef="keterangan" value="${esc(E.keterangan)}">
    <div id="edPhoto"></div>
    <button type="button" class="btn primary block big mt" data-d="save">Simpan Perubahan</button>`);
  renderEditorPhoto();
  const activeCat = $('.chips.scroll .chip.active', body);
  if (activeCat) activeCat.parentElement.scrollLeft = activeCat.offsetLeft - 40;
  body.onclick = async (e) => {
    const chip = e.target.closest('[data-ed] [data-v]');
    if (chip) {
      const grp = chip.closest('[data-ed]'); const key = grp.dataset.ed;
      const v = grp.dataset.toggle && E[key] === chip.dataset.v ? '' : chip.dataset.v;
      E[key] = v;
      $$('[data-v]', grp).forEach((c) => c.classList.toggle('active', c.dataset.v === v));
      return;
    }
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'cam') { photoTarget = 'edit'; $('#camInput').click(); }
    if (b.dataset.d === 'gal') { photoTarget = 'edit'; $('#galInput').click(); }
    if (b.dataset.d === 'rmfoto') { E.foto = ''; E.fotoUrl = ''; renderEditorPhoto(); }
    if (b.dataset.d === 'save') {
      const amt = parseAmount(E.jumlah);
      if (!E.uraian.trim() || !amt || !E.tanggal) { toast('Uraian, jumlah, dan tanggal wajib diisi', 'err'); return; }
      const rec = { ...E, uraian: E.uraian.trim(), keterangan: (E.keterangan || '').trim(), jumlah: amt, synced: 0, updatedAt: new Date().toISOString() };
      await DB.put(rec);
      closeSheet(); toast('Perubahan tersimpan', 'ok'); refreshCurrent(); updateSyncChip(); sync();
    }
  };
  body.oninput = (e) => {
    const f = e.target.dataset.ef; if (!f) return;
    if (f === 'jumlah') { const raw = e.target.value.replace(/\D/g, '').slice(0, 15); E.jumlah = raw; e.target.value = raw ? num(raw) : ''; }
    else E[f] = e.target.value;
  };
}
function renderEditorPhoto() {
  const el = $('#edPhoto'); if (!el || !E) return;
  el.innerHTML = (E.foto ? `<div class="photo-prev"><img src="${E.foto}" alt=""><button type="button" data-d="rmfoto">✕</button></div>` : '')
    + (!E.foto && E.fotoUrl ? `<p class="help"><a href="${esc(E.fotoUrl)}" target="_blank" rel="noopener">Foto tersimpan di Drive ↗</a> · <button type="button" class="link-btn" data-d="rmfoto">lepas</button></p>` : '')
    + `<div class="photo-row"><button type="button" class="btn" data-d="cam">${icon('camera')} ${E.foto || E.fotoUrl ? 'Ganti' : 'Kamera'}</button><button type="button" class="btn" data-d="gal">${icon('image')} Galeri</button></div>`;
}

/* ============================== LAPORAN ============================== */
const LP = { period: 'bulan', from: '', to: '', person: 'all', sumber: 'all' };
function getPeriod(key, cf, ct) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const y = t.getFullYear(), m = t.getMonth();
  let f = null, to = null, label = '';
  switch (key) {
    case 'hari': f = to = t; label = 'Hari ini'; break;
    case 'kemarin': f = to = addDays(t, -1); label = 'Kemarin'; break;
    case 'minggu': f = addDays(t, -((t.getDay() + 6) % 7)); to = addDays(f, 6); label = 'Minggu ini'; break;
    case '7hari': f = addDays(t, -6); to = t; label = '7 hari terakhir'; break;
    case 'bulan': f = new Date(y, m, 1); to = new Date(y, m + 1, 0); label = BULAN[m] + ' ' + y; break;
    case 'bulanlalu': f = new Date(y, m - 1, 1); to = new Date(y, m, 0); label = BULAN[f.getMonth()] + ' ' + f.getFullYear(); break;
    case '30hari': f = addDays(t, -29); to = t; label = '30 hari terakhir'; break;
    case 'tahun': f = new Date(y, 0, 1); to = new Date(y, 11, 31); label = 'Tahun ' + y; break;
    case 'custom': f = cf ? parseDate(cf) : null; to = ct ? parseDate(ct) : null; label = 'Periode pilihan'; break;
    default: label = 'Semua data';
  }
  const from = f ? isoDate(f) : '', toS = to ? isoDate(to) : '';
  const range = from && toS ? (from === toS ? fmtDateLong(from) : `${fmtDate(from)} – ${fmtDate(toS)}`) : from ? `Sejak ${fmtDate(from)}` : toS ? `Sampai ${fmtDate(toS)}` : 'Seluruh catatan';
  return { from, to: toS, label, range };
}
const inRange = (r, p) => (!p.from || r.tanggal >= p.from) && (!p.to || r.tanggal <= p.to);
function groupSum(list, keyFn) {
  const m = new Map();
  list.forEach((r) => { const k = keyFn(r) || '(tanpa kategori)'; const e = m.get(k) || { k, total: 0, n: 0 }; e.total += r.jumlah; e.n++; m.set(k, e); });
  return [...m.values()].sort((a, b) => b.total - a.total);
}
function saldoTable(toDate, includeAll = true) {
  const all = active();
  const names = uniq([...sourceNames(), ...all.map((r) => r.sumber)]);
  return names.map((name) => {
    const src = S.sources.find((s) => s.name === name);
    const awal = src ? Number(src.saldoAwal) || 0 : 0;
    const upto = all.filter((r) => r.sumber === name && (!toDate || r.tanggal <= toDate));
    const saldo = awal + sum(upto.filter((r) => r.jenis === 'masuk')) - sum(upto.filter((r) => r.jenis === 'keluar'));
    return { name, awal, saldo, used: upto.length > 0 || !!src };
  }).filter((x) => includeAll || x.used);
}

function renderLaporan() {
  const all = active();
  $('#lSumber').innerHTML = `<option value="all">Semua</option>` + uniq([...sourceNames(), ...all.map((r) => r.sumber)]).map((s) => `<option ${s === LP.sumber ? 'selected' : ''}>${esc(s)}</option>`).join('');
  const persons = uniq([...S.persons, ...all.map((r) => r.penginput)]);
  $('#lOrang').innerHTML = [['all', 'Semua'], ...persons.map((p) => [p, p])].map(([v, l]) => `<button type="button" class="chip ${LP.person === v ? 'active' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('');
  $('#lPeriode').value = LP.period;
  $('#lCustom').hidden = LP.period !== 'custom';
  if (LP.period === 'custom') { $('#lDari').value = LP.from; $('#lSampai').value = LP.to; }

  const p = getPeriod(LP.period, LP.from, LP.to);
  const list = all.filter((r) => inRange(r, p) && (LP.person === 'all' || r.penginput === LP.person) && (LP.sumber === 'all' || r.sumber === LP.sumber))
    .sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
  const ins = list.filter((r) => r.jenis === 'masuk'), outs = list.filter((r) => r.jenis === 'keluar');
  const tIn = sum(ins), tOut = sum(outs);
  const days = new Set(list.map((r) => r.tanggal)).size;
  let spanDays = 0;
  if (p.from && p.to) { const end = p.to > todayStr() ? todayStr() : p.to; spanDays = Math.max(1, Math.round((parseDate(end) - parseDate(p.from)) / 864e5) + 1); }
  else spanDays = days || 1;
  const filt = [LP.person !== 'all' ? 'Penginput: ' + LP.person : '', LP.sumber !== 'all' ? 'Sumber: ' + LP.sumber : ''].filter(Boolean).join(' · ');

  const catOut = groupSum(outs, (r) => r.kategori), catIn = groupSum(ins, (r) => r.kategori);
  const byPerson = uniq(list.map((r) => r.penginput)).map((n) => {
    const l = list.filter((r) => r.penginput === n);
    return { n, inn: sum(l.filter((r) => r.jenis === 'masuk')), out: sum(l.filter((r) => r.jenis === 'keluar')), c: l.length };
  });
  const bySrc = uniq(list.map((r) => r.sumber)).map((n) => {
    const l = list.filter((r) => r.sumber === n);
    return { n, inn: sum(l.filter((r) => r.jenis === 'masuk')), out: sum(l.filter((r) => r.jenis === 'keluar')) };
  });
  const topUraian = groupSum(outs, (r) => r.uraian.trim()).slice(0, 10);
  const saldo = saldoTable(p.to, false);
  const largest = [...outs].sort((a, b) => b.jumlah - a.jumlah).slice(0, 5);

  const catTable = (rows, total, cls) => `<table class="tbl"><thead><tr><th>Kategori</th><th class="num">Trx</th><th class="num">Jumlah</th><th class="num">%</th></tr></thead><tbody>
    ${rows.map((c) => `<tr><td>${esc(c.k)}<div class="pbar ${cls}"><i style="width:${pct(c.total, rows[0].total)}%"></i></div></td><td class="num">${c.n}</td><td class="num">${rp(c.total)}</td><td class="num">${pct(c.total, total)}%</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="num">${rows.reduce((a, c) => a + c.n, 0)}</td><td class="num">${rp(total)}</td><td class="num">100%</td></tr></tfoot></table>`;

  // rincian per hari
  const byDay = new Map();
  list.forEach((r) => { if (!byDay.has(r.tanggal)) byDay.set(r.tanggal, []); byDay.get(r.tanggal).push(r); });
  let rincian = '';
  for (const [d, rs] of byDay) {
    const di = sum(rs.filter((r) => r.jenis === 'masuk')), dk = sum(rs.filter((r) => r.jenis === 'keluar'));
    rincian += `<tr class="dayrow"><td colspan="3">${fmtDateLong(d)}</td><td class="num in">${di ? rp(di) : ''}</td><td class="num out">${dk ? rp(dk) : ''}</td></tr>`;
    rincian += rs.map((r) => `<tr><td>${esc(r.jam)}</td><td>${esc(r.uraian)}${r.keterangan || r.kategori ? `<small>${esc([r.kategori, r.keterangan].filter(Boolean).join(' · '))}</small>` : ''}</td><td>${esc(r.sumber)}<small>${esc(r.penginput)}</small></td><td class="num in">${r.jenis === 'masuk' ? rp(r.jumlah) : ''}</td><td class="num out">${r.jenis === 'keluar' ? rp(r.jumlah) : ''}</td></tr>`).join('');
  }

  $('#reportArea').innerHTML = `
    <div class="rp-head"><img src="icons/icon-192.png" alt=""><div><h2>Laporan Keuangan — ${esc(p.label)}</h2><p>${esc(p.range)}${filt ? ' · ' + esc(filt) : ''}</p></div></div>
    <div class="rp-tiles">
      <div class="rp-tile in"><span>Pemasukan</span><b>${rp(tIn)}</b></div>
      <div class="rp-tile out"><span>Pengeluaran</span><b>${rp(tOut)}</b></div>
      <div class="rp-tile"><span>Selisih</span><b>${rp(tIn - tOut)}</b></div>
    </div>
    <p class="rp-note">${list.length} transaksi dalam ${days} hari · rata-rata pengeluaran ${rp(tOut / spanDays)}/hari${tIn ? ` · ${pct(tOut, tIn)}% dari pemasukan terpakai` : ''}</p>

    ${!list.length ? '<div class="empty">Belum ada transaksi pada periode ini.</div>' : ''}

    <section class="rp-block"><h3>Saldo per Sumber Dana ${p.to ? `(per ${fmtDate(p.to)})` : ''}</h3>
      <table class="tbl"><thead><tr><th>Sumber</th><th class="num">Masuk*</th><th class="num">Keluar*</th><th class="num">Saldo</th></tr></thead><tbody>
      ${saldo.map((s) => { const b = bySrc.find((x) => x.n === s.name) || { inn: 0, out: 0 }; return `<tr><td>${esc(s.name)}</td><td class="num in">${rp(b.inn)}</td><td class="num out">${rp(b.out)}</td><td class="num"><b>${rp(s.saldo)}</b></td></tr>`; }).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="num">${rp(sum(bySrc, (x) => x.inn))}</td><td class="num">${rp(sum(bySrc, (x) => x.out))}</td><td class="num">${rp(sum(saldo, (x) => x.saldo))}</td></tr></tfoot></table>
      <p class="help">*Masuk/Keluar = pada periode ini (sesuai filter). Saldo = saldo awal + semua transaksi sampai akhir periode.</p>
    </section>

    ${catOut.length ? `<section class="rp-block"><h3>Pengeluaran per Kategori</h3>${catTable(catOut, tOut, '')}</section>` : ''}
    ${catIn.length ? `<section class="rp-block"><h3>Pemasukan per Kategori</h3>${catTable(catIn, tIn, 'in')}</section>` : ''}

    ${byPerson.length ? `<section class="rp-block"><h3>Per Penginput</h3><table class="tbl"><thead><tr><th>Nama</th><th class="num">Trx</th><th class="num">Masuk</th><th class="num">Keluar</th></tr></thead><tbody>
      ${byPerson.map((x) => `<tr><td>${esc(x.n)}</td><td class="num">${x.c}</td><td class="num in">${rp(x.inn)}</td><td class="num out">${rp(x.out)}</td></tr>`).join('')}</tbody></table></section>` : ''}

    ${topUraian.length ? `<section class="rp-block"><h3>10 Pengeluaran Terbesar (per uraian)</h3><table class="tbl"><thead><tr><th>Uraian</th><th class="num">Kali</th><th class="num">Total</th></tr></thead><tbody>
      ${topUraian.map((x) => `<tr><td>${esc(x.k)}</td><td class="num">${x.n}×</td><td class="num">${rp(x.total)}</td></tr>`).join('')}</tbody></table></section>` : ''}

    ${largest.length ? `<section class="rp-block"><h3>Transaksi Pengeluaran Terbesar</h3><table class="tbl"><tbody>
      ${largest.map((r) => `<tr><td>${fmtDate(r.tanggal)}</td><td>${esc(r.uraian)}<small>${esc(r.sumber)} · ${esc(r.penginput)}</small></td><td class="num out">${rp(r.jumlah)}</td></tr>`).join('')}</tbody></table></section>` : ''}

    ${list.length ? `<section class="rp-block"><h3>Rincian Transaksi</h3><table class="tbl"><thead><tr><th>Jam</th><th>Uraian</th><th>Sumber</th><th class="num">Masuk</th><th class="num">Keluar</th></tr></thead><tbody>${rincian}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="num in">${rp(tIn)}</td><td class="num out">${rp(tOut)}</td></tr></tfoot></table></section>` : ''}

    <div class="rp-foot">Dibuat ${fmtDateLong(todayStr())} ${nowTime()} · Catatan Keuangan v${esc(VER.v)}</div>`;
  LP._list = list; LP._p = p;
}
function bindLaporan() {
  $('#lPeriode').addEventListener('change', (e) => {
    LP.period = e.target.value;
    if (LP.period === 'custom' && !LP.from) { const t = new Date(); LP.from = isoDate(new Date(t.getFullYear(), t.getMonth(), 1)); LP.to = todayStr(); }
    renderLaporan();
  });
  $('#lDari').addEventListener('change', (e) => { LP.from = e.target.value; renderLaporan(); });
  $('#lSampai').addEventListener('change', (e) => { LP.to = e.target.value; renderLaporan(); });
  $('#lSumber').addEventListener('change', (e) => { LP.sumber = e.target.value; renderLaporan(); });
  $('#lOrang').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; LP.person = b.dataset.v; renderLaporan(); });
  $('.export-row').addEventListener('click', (e) => { const b = e.target.closest('[data-exp]'); if (b) exportReport(b.dataset.exp, b); });
}
const reportFileName = (ext) => `Laporan_Keuangan_${(LP._p.from || 'awal')}_${(LP._p.to || todayStr())}.${ext}`;

async function reportCanvas() {
  if (!window.html2canvas) throw new Error('Pustaka ekspor belum termuat');
  const el = $('#reportArea'); const root = document.documentElement;
  const prevTheme = root.dataset.theme;
  root.dataset.theme = 'light';
  el.classList.add('exporting');
  await nextFrame();
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', windowWidth: 820, width: el.scrollWidth, height: el.scrollHeight, logging: false });
    // titik potong halaman yang aman (di antara baris)
    const top = el.getBoundingClientRect().top, k = canvas.height / el.scrollHeight;
    const breaks = $$('tr, .rp-block, .rp-tiles, .rp-head, .rp-note', el).map((n) => (n.getBoundingClientRect().bottom - top) * k).sort((a, b) => a - b);
    return { canvas, breaks };
  } finally {
    el.classList.remove('exporting');
    if (prevTheme) root.dataset.theme = prevTheme; else delete root.dataset.theme;
    applyTheme();
  }
}
async function exportReport(kind, btn) {
  if (!LP._list) renderLaporan();
  if (kind === 'csv') return exportCsv(LP._list);
  const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
  try {
    const { canvas, breaks } = await reportCanvas();
    if (kind === 'png' || kind === 'share') {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      const name = reportFileName('png');
      if (kind === 'share') {
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Laporan Keuangan' }); }
        else { downloadBlob(blob, name); toast('Berbagi tidak didukung, file diunduh'); }
      } else { downloadBlob(blob, name); toast('PNG diunduh', 'ok'); }
    }
    if (kind === 'pdf') {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const m = 10, pw = 210 - 2 * m, ph = 297 - 2 * m;
      const pxPerMm = canvas.width / pw, pageH = Math.floor(ph * pxPerMm);
      let y = 0, page = 0;
      while (y < canvas.height - 2) {
        let end = Math.min(y + pageH, canvas.height);
        if (end < canvas.height) { const ok = breaks.filter((b) => b > y + pageH * 0.4 && b <= end); if (ok.length) end = Math.floor(ok[ok.length - 1]); }
        const h = end - y;
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, pw, h / pxPerMm);
        pdf.setFontSize(8); pdf.setTextColor(140); pdf.text(`Halaman ${page + 1}`, 210 - m, 297 - 4, { align: 'right' });
        y = end; page++;
      }
      pdf.save(reportFileName('pdf'));
      toast('PDF diunduh', 'ok');
    }
  } catch (err) {
    if (err && err.name !== 'AbortError') toast('Gagal ekspor: ' + (err.message || err), 'err');
  } finally { btn.disabled = false; btn.textContent = old; }
}
function exportCsv(list, name) {
  const head = ['Tanggal', 'Jam', 'Penginput', 'Jenis', 'Sumber Dana', 'Kategori', 'Uraian', 'Masuk', 'Keluar', 'Keterangan', 'Foto', 'ID'];
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = list.map((r) => [r.tanggal, r.jam, r.penginput, r.jenis === 'masuk' ? 'Masuk' : 'Keluar', r.sumber, r.kategori, r.uraian, r.jenis === 'masuk' ? r.jumlah : '', r.jenis === 'keluar' ? r.jumlah : '', r.keterangan, r.fotoUrl, r.id]);
  const csv = '﻿' + 'sep=;\n' + [head, ...rows].map((r) => r.map(q).join(';')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name || reportFileName('csv'));
  toast('File CSV diunduh (buka dengan Excel)', 'ok');
}

/* ============================== ANALISIS ============================== */
const AN = { month: monthKeyOf(new Date()) };
const charts = {};
function mkChart(id, cfg) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  charts[id] = new Chart(el, cfg);
}
function chartOpts({ horizontal = false, legend = false, stacked = false } = {}) {
  const ink = cssv('--muted'), grid = cssv('--grid'), axis = cssv('--axis');
  const valAxis = { beginAtZero: true, stacked, grid: { color: grid }, border: { display: false }, ticks: { color: ink, font: { size: 10 }, callback: (v) => rpShort(v), maxTicksLimit: 5 } };
  const catAxis = { stacked, grid: { display: false }, border: { color: axis }, ticks: { color: ink, font: { size: 10 }, autoSkip: true, maxRotation: 0 } };
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
    plugins: {
      legend: { display: legend },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${rp(horizontal ? c.parsed.x : c.parsed.y)}` } }
    },
    scales: horizontal ? { x: valAxis, y: { ...catAxis, ticks: { ...catAxis.ticks, font: { size: 11 }, color: cssv('--text2') } } } : { x: catAxis, y: valAxis }
  };
}
const barDs = (label, data, color) => ({ label, data, backgroundColor: color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, categoryPercentage: 0.75, barPercentage: 0.9 });

function renderAnalisis() {
  $('#aBulan').value = AN.month;
  const all = active();
  const mk = AN.month, [y, m] = mk.split('-').map(Number);
  const cur = all.filter((r) => r.tanggal.startsWith(mk));
  const prevKey = monthKeyOf(new Date(y, m - 2, 1));
  const prev = all.filter((r) => r.tanggal.startsWith(prevKey));
  const out = sum(cur.filter((r) => r.jenis === 'keluar')), inn = sum(cur.filter((r) => r.jenis === 'masuk'));
  const pOut = sum(prev.filter((r) => r.jenis === 'keluar'));
  const isCurMonth = mk === monthKeyOf(new Date());
  const dim = daysInMonth(mk);
  const elapsed = isCurMonth ? new Date().getDate() : dim;
  const avg = out / Math.max(1, elapsed);
  const proj = isCurMonth ? avg * dim : out;
  const chg = pOut ? Math.round(((out - pOut) / pOut) * 100) : null;
  const saveRate = inn ? Math.round(((inn - out) / inn) * 100) : null;

  // data grafik
  const months12 = []; for (let i = 11; i >= 0; i--) months12.push(monthKeyOf(new Date(y, m - 1 - i, 1)));
  const mIn = months12.map((k) => sum(all.filter((r) => r.jenis === 'masuk' && r.tanggal.startsWith(k))));
  const mOut = months12.map((k) => sum(all.filter((r) => r.jenis === 'keluar' && r.tanggal.startsWith(k))));
  const dayLabels = Array.from({ length: dim }, (_, i) => i + 1);
  const dOut = dayLabels.map((d) => sum(cur.filter((r) => r.jenis === 'keluar' && +r.tanggal.slice(8) === d)));
  const dIn = dayLabels.map((d) => sum(cur.filter((r) => r.jenis === 'masuk' && +r.tanggal.slice(8) === d)));
  let acc = 0; const cum = dayLabels.map((d, i) => (isCurMonth && d > elapsed ? null : (acc += dIn[i] - dOut[i])));
  const cats = groupSum(cur.filter((r) => r.jenis === 'keluar'), (r) => r.kategori);
  const catTop = cats.slice(0, 7); if (cats.length > 7) catTop.push({ k: 'Lainnya (gabungan)', total: sum(cats.slice(7), (c) => c.total), n: sum(cats.slice(7), (c) => c.n) });
  // pola hari: rata-rata per hari dalam 3 bulan terakhir
  const from90 = isoDate(addDays(new Date(), -90));
  const recent = all.filter((r) => r.jenis === 'keluar' && r.tanggal >= from90);
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  const wdTot = wdOrder.map((wd) => sum(recent.filter((r) => parseDate(r.tanggal).getDay() === wd)));
  const wdCount = wdOrder.map((wd) => { let c = 0; for (let d = addDays(new Date(), -90); d <= new Date(); d = addDays(d, 1)) if (d.getDay() === wd) c++; return c || 1; });
  const wdAvg = wdTot.map((t, i) => Math.round(t / wdCount[i]));
  const persons = uniq(cur.map((r) => r.penginput));
  const pIn = persons.map((p) => sum(cur.filter((r) => r.penginput === p && r.jenis === 'masuk')));
  const pOutArr = persons.map((p) => sum(cur.filter((r) => r.penginput === p && r.jenis === 'keluar')));
  const freq = groupSum(cur.filter((r) => r.jenis === 'keluar'), (r) => r.uraian.trim()).sort((a, b) => b.n - a.n).slice(0, 8);
  const small = cur.filter((r) => r.jenis === 'keluar' && r.jumlah < 20000);
  const saldo = saldoTable('', false);

  // insight otomatis
  const tips = [];
  if (!cur.length) tips.push(`Belum ada transaksi di ${fmtMonth(mk)}.`);
  if (chg !== null && out) tips.push(chg > 0 ? `Pengeluaran ${fmtMonth(mk)} <b>naik ${chg}%</b> dibanding ${fmtMonth(prevKey)} (${rp(pOut)}).` : chg < 0 ? `Pengeluaran ${fmtMonth(mk)} <b>turun ${-chg}%</b> dibanding ${fmtMonth(prevKey)}. Bagus!` : 'Pengeluaran sama dengan bulan lalu.');
  if (cats[0] && out) tips.push(`Kategori terbesar: <b>${esc(cats[0].k)}</b> — ${rp(cats[0].total)} (${pct(cats[0].total, out)}% dari pengeluaran).`);
  if (isCurMonth && out) tips.push(`Rata-rata ${rp(avg)}/hari. Jika pola ini berlanjut, pengeluaran akhir bulan sekitar <b>${rp(proj)}</b>.`);
  if (S.budget && isCurMonth) {
    const sisa = S.budget - out, sisaHari = dim - elapsed + 1;
    tips.push(sisa >= 0 ? `Sisa budget ${rp(sisa)} untuk ${sisaHari} hari → maksimal <b>${rp(sisa / sisaHari)}/hari</b>.` : `Budget bulan ini <b>terlampaui ${rp(-sisa)}</b>.`);
    if (proj > S.budget && sisa >= 0) tips.push(`Perkiraan akhir bulan melebihi budget sebesar ${rp(proj - S.budget)}. Coba kurangi pengeluaran harian.`);
  }
  if (saveRate !== null) tips.push(saveRate >= 0 ? `Rasio tabungan ${saveRate}% dari pemasukan.${saveRate < 10 ? ' Usahakan menabung minimal 10–20%.' : ''}` : `Pengeluaran melebihi pemasukan sebesar ${rp(out - inn)}.`);
  const maxWd = wdAvg.indexOf(Math.max(...wdAvg));
  if (recent.length > 5) tips.push(`Hari paling boros (3 bulan terakhir): <b>${HARI[wdOrder[maxWd]]}</b>, rata-rata ${rp(wdAvg[maxWd])}.`);
  if (small.length >= 5) tips.push(`Ada ${small.length} pengeluaran kecil (&lt; Rp 20.000) dengan total ${rp(sum(small))}. Pengeluaran kecil yang sering bisa jadi besar.`);
  if (persons.length > 1) { const pc = persons.map((p) => [p, cur.filter((r) => r.penginput === p).length]).sort((a, b) => b[1] - a[1]); tips.push(`${esc(pc[0][0])} paling banyak mencatat (${pc[0][1]} dari ${cur.length} transaksi).`); }
  const neg = saldo.filter((s) => s.saldo < 0);
  if (neg.length) tips.push(`Saldo minus pada: ${neg.map((s) => esc(s.name)).join(', ')}. Periksa saldo awal di Pengaturan.`);

  const budgetPct = S.budget ? pct(out, S.budget) : 0;
  const legend2 = `<div class="legend"><span><i style="background:${cssv('--c-in')}"></i>Masuk</span><span><i style="background:${cssv('--c-out')}"></i>Keluar</span></div>`;

  $('#anaArea').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Pengeluaran</span><b>${rp(out)}</b><small class="${chg > 0 ? 'up' : chg < 0 ? 'down' : ''}">${chg === null ? 'bulan lalu: -' : (chg > 0 ? '▲ ' : chg < 0 ? '▼ ' : '') + Math.abs(chg) + '% vs bulan lalu'}</small></div>
      <div class="kpi"><span>Pemasukan</span><b>${rp(inn)}</b><small>Selisih ${rp(inn - out)}</small></div>
      <div class="kpi"><span>Rata-rata / hari</span><b>${rp(avg)}</b><small>${elapsed} hari</small></div>
      <div class="kpi"><span>${isCurMonth ? 'Proyeksi akhir bulan' : 'Total transaksi'}</span><b>${isCurMonth ? rp(proj) : cur.length}</b><small>${isCurMonth ? 'perkiraan pengeluaran' : 'transaksi'}</small></div>
    </div>

    ${S.budget ? `<div class="card"><h3>Budget Bulanan</h3>
      <div class="budget-bar"><i class="${budgetPct >= 100 ? 'over' : budgetPct >= 80 ? 'warn' : ''}" style="width:${Math.min(100, budgetPct)}%"></i></div>
      <div class="row-between stat-line"><span>${budgetPct >= 100 ? '⛔ Terlampaui' : budgetPct >= 80 ? '⚠️ Hampir habis' : '✅ Aman'} · terpakai <b>${budgetPct}%</b></span><span>${rp(out)} / ${rp(S.budget)}</span></div></div>`
      : `<div class="card stat-line">Atur <b>budget bulanan</b> di Pengaturan untuk memantau batas belanja.</div>`}

    <div class="card"><h3>Ringkasan & Saran</h3><ul class="insights">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>

    <div class="card chart-card"><h3>Tren 12 Bulan</h3><p class="sub">Pemasukan vs pengeluaran per bulan</p>${legend2}<div class="chart-box"><canvas id="cTrend"></canvas></div></div>

    <div class="card chart-card"><h3>Pengeluaran Harian</h3><p class="sub">${fmtMonth(mk)}${avg ? ' · garis putus-putus = rata-rata' : ''}</p><div class="chart-box"><canvas id="cDaily"></canvas></div></div>

    <div class="card chart-card"><h3>Arus Kas Kumulatif</h3><p class="sub">Selisih masuk − keluar yang terkumpul sepanjang ${fmtMonth(mk)}</p><div class="chart-box"><canvas id="cCum"></canvas></div></div>

    <div class="card chart-card"><h3>Pengeluaran per Kategori</h3><p class="sub">${fmtMonth(mk)}</p>
      ${catTop.length ? `<div class="chart-box" style="height:${Math.max(140, catTop.length * 34 + 30)}px"><canvas id="cCat"></canvas></div>` : '<div class="empty">Belum ada data</div>'}</div>

    <div class="card chart-card"><h3>Pola Hari dalam Seminggu</h3><p class="sub">Rata-rata pengeluaran per hari, 90 hari terakhir</p><div class="chart-box"><canvas id="cWeek"></canvas></div></div>

    ${persons.length ? `<div class="card chart-card"><h3>Per Penginput</h3><p class="sub">${fmtMonth(mk)}</p>${legend2}<div class="chart-box" style="height:${persons.length * 60 + 40}px"><canvas id="cPerson"></canvas></div></div>` : ''}

    <div class="card"><h3>Saldo Saat Ini per Sumber Dana</h3>
      ${saldo.map((s) => `<div class="rank"><span>${esc(s.name)}</span><b>${rp(s.saldo)}</b></div>`).join('') || '<div class="empty">-</div>'}
      <div class="rank"><span><b>Total</b></span><b>${rp(sum(saldo, (s) => s.saldo))}</b></div></div>

    ${freq.length ? `<div class="card"><h3>Paling Sering Dibeli</h3><p class="sub help">${fmtMonth(mk)}</p>
      ${freq.map((f) => `<div class="rank"><span>${esc(f.k)} <small>${f.n}×</small></span><b>${rp(f.total)}</b></div>`).join('')}</div>` : ''}
  `;

  const cIn = cssv('--c-in'), cOut = cssv('--c-out'), cLine = cssv('--c-line');
  mkChart('cTrend', { type: 'bar', data: { labels: months12.map((k) => BLN[+k.slice(5) - 1] + (k.endsWith('-01') ? " '" + k.slice(2, 4) : '')), datasets: [barDs('Masuk', mIn, cIn), barDs('Keluar', mOut, cOut)] }, options: chartOpts() });
  const dailyOpts = chartOpts();
  mkChart('cDaily', {
    type: 'bar',
    data: { labels: dayLabels, datasets: [barDs('Keluar', dOut, cOut), { type: 'line', label: 'Rata-rata', data: dayLabels.map(() => Math.round(avg)), borderColor: cssv('--muted'), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0 }] },
    options: dailyOpts
  });
  mkChart('cCum', { type: 'line', data: { labels: dayLabels, datasets: [{ label: 'Kumulatif', data: cum, borderColor: cLine, backgroundColor: cLine + '22', fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.25 }] }, options: chartOpts() });
  if (catTop.length) mkChart('cCat', { type: 'bar', data: { labels: catTop.map((c) => c.k.length > 18 ? c.k.slice(0, 17) + '…' : c.k), datasets: [barDs('Pengeluaran', catTop.map((c) => c.total), cOut)] }, options: chartOpts({ horizontal: true }) });
  mkChart('cWeek', { type: 'bar', data: { labels: wdOrder.map((d) => HARI[d].slice(0, 3)), datasets: [barDs('Rata-rata', wdAvg, cOut)] }, options: chartOpts() });
  if (persons.length) mkChart('cPerson', { type: 'bar', data: { labels: persons, datasets: [barDs('Masuk', pIn, cIn), barDs('Keluar', pOutArr, cOut)] }, options: chartOpts({ horizontal: true }) });
}

/* ============================= PENGATURAN ============================= */
async function renderPengaturan() {
  const pend = DB.all.filter((r) => !r.synced).length;
  const photos = DB.all.filter((r) => r.foto).length;
  const photosSynced = DB.all.filter((r) => r.foto && r.fotoUrl && r.synced).length;
  let storage = '';
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); storage = `${(e.usage / 1048576).toFixed(1)} MB terpakai`; } } catch (e) { /* abaikan */ }
  let persisted = false;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { /* abaikan */ }

  $('#setArea').innerHTML = `
    <div class="card"><h3>Penginput</h3>
      ${S.persons.map((p, i) => `<div class="set-row"><span class="name">${esc(p)}</span><button type="button" class="icon-btn" data-s="rm-person" data-i="${i}" aria-label="Hapus">${icon('trash')}</button></div>`).join('')}
      <div class="add-row"><input id="newPerson" class="inp sm" placeholder="Nama baru"><button type="button" class="btn sm primary" data-s="add-person">Tambah</button></div>
    </div>

    <div class="card"><h3>Sumber Dana & Saldo Awal</h3>
      <p class="help">Saldo awal = jumlah uang saat mulai memakai aplikasi. Dipakai untuk menghitung saldo.</p>
      ${S.sources.map((s, i) => `<div class="set-row"><span class="name">${esc(s.name)}</span><input class="inp sm saldo" inputmode="numeric" data-saldo="${i}" value="${num(s.saldoAwal)}" aria-label="Saldo awal ${esc(s.name)}"><button type="button" class="icon-btn" data-s="rm-source" data-i="${i}" aria-label="Hapus">${icon('trash')}</button></div>`).join('')}
      <div class="add-row"><input id="newSource" class="inp sm" placeholder="mis. Bank BCA, DANA"><button type="button" class="btn sm primary" data-s="add-source">Tambah</button></div>
    </div>

    <div class="card"><h3>Kategori</h3>
      <div class="chips">${S.categories.map((c, i) => `<button type="button" class="chip" data-s="rm-cat" data-i="${i}">${esc(c)}<span class="x">✕</span></button>`).join('')}</div>
      <div class="add-row"><input id="newCat" class="inp sm" placeholder="Kategori baru"><button type="button" class="btn sm primary" data-s="add-cat">Tambah</button></div>
    </div>

    <div class="card"><h3>Budget Pengeluaran Bulanan</h3>
      <div class="amount"><span>Rp</span><input id="budgetInp" inputmode="numeric" value="${S.budget ? num(S.budget) : ''}" placeholder="0 = tidak dipakai"></div>
    </div>

    <div class="card stack"><h3>Koneksi Google Spreadsheet</h3>
      <div class="stat-line">${S.scriptUrl ? `Terhubung otomatis ke Web App <b>…${esc(S.scriptUrl.slice(-18, -5))}</b>${S.token ? ' · kode rahasia aktif' : ''}` : '<span style="color:var(--err)">URL Web App belum diisi di config.js</span>'}</div>
      <div class="row2"><button type="button" class="btn sm" data-s="test">Tes koneksi</button><button type="button" class="btn sm primary" data-s="sync">Sinkron sekarang</button></div>
      <div class="stat-line">Menunggu sinkron: <b>${pend}</b> · Terakhir sinkron: <b>${S.lastSync ? fmtDate(S.lastSync.slice(0, 10)) + ' ' + new Date(S.lastSync).toTimeString().slice(0, 5) : 'belum pernah'}</b>${SY.error ? `<br><span style="color:var(--err)">Error terakhir: ${esc(SY.error)}</span>` : ''}</div>
      <button type="button" class="btn sm block" data-s="check">Cek data HP yang tidak ada di Spreadsheet</button>
      <p class="help">Data otomatis disinkron saat ada internet. Data dari HP pasangan juga otomatis diambil, sehingga laporan di kedua HP sama.</p>
    </div>

    <div class="card"><h3>Tampilan</h3>
      <div class="seg seg3" id="themeSeg">${[['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) => `<button type="button" class="seg-btn ${S.theme === v ? 'on' : ''}" data-theme-v="${v}">${l}</button>`).join('')}</div>
      <label class="field mt"><span class="lbl">Nama perangkat ini</span><input id="devInp" class="inp sm" value="${esc(S.device)}"></label>
    </div>

    <div class="card stack"><h3>Data di HP</h3>
      <div class="stat-line">Total <b>${active().length}</b> transaksi · <b>${photos}</b> foto${storage ? ' · ' + storage : ''}<br>Penyimpanan permanen: <b>${persisted ? 'Ya ✓' : 'Belum'}</b>${persisted ? '' : ' (install aplikasi agar data lebih aman)'}</div>
      <div class="row2"><button type="button" class="btn sm" data-s="backup">Backup (.json)</button><button type="button" class="btn sm" data-s="restore">Pulihkan backup</button></div>
      <button type="button" class="btn sm block" data-s="csvall">Ekspor semua ke Excel/CSV</button>
      <button type="button" class="btn sm block" data-s="clean-photo" ${photosSynced ? '' : 'disabled'}>Hapus foto lokal yang sudah di Drive (${photosSynced})</button>
      <p class="help">Data di HP <b>tidak terhapus</b> setelah sinkron. Data hanya hilang jika Anda menghapusnya sendiri.</p>
    </div>

    <div class="card danger-zone stack"><h3>Zona Berbahaya</h3>
      <button type="button" class="btn sm danger block" data-s="wipe">Hapus SEMUA data di HP ini</button>
      <p class="help">Data di Spreadsheet tidak ikut terhapus. Bisa diambil lagi dengan "Sinkron sekarang".</p>
    </div>

    <div class="card stack"><h3>Tentang Aplikasi</h3>
      <div class="stat-line">Versi <b>${esc(VER.v)}</b> · ${fmtDate(VER.d)}</div>
      <button type="button" class="btn sm block" data-s="update">${icon('refresh', 'sm')} Cek Update</button>
      <button type="button" class="btn sm block" data-s="install">Cara install aplikasi</button>
    </div>`;
}
function bindPengaturan() {
  const area = $('#setArea');
  area.addEventListener('click', async (e) => {
    const th = e.target.closest('[data-theme-v]');
    if (th) { S.theme = th.dataset.themeV; saveS(); applyTheme(); renderPengaturan(); return; }
    const b = e.target.closest('[data-s]'); if (!b) return;
    const i = +b.dataset.i;
    switch (b.dataset.s) {
      case 'add-person': {
        const v = $('#newPerson').value.trim(); if (!v) return;
        if (S.persons.some((p) => norm(p) === norm(v))) return toast('Nama sudah ada', 'err');
        S.persons.push(v); saveS(true); break;
      }
      case 'rm-person':
        if (S.persons.length <= 1) return toast('Minimal satu penginput', 'err');
        if (!(await ask(`Hapus penginput "${S.persons[i]}"?\nTransaksi lama tetap tersimpan.`, { ok: 'Hapus', danger: true }))) return;
        if (F.person === S.persons[i]) F.person = '';
        S.persons.splice(i, 1); saveS(true); break;
      case 'add-source': {
        const v = $('#newSource').value.trim(); if (!v) return;
        if (S.sources.some((s) => norm(s.name) === norm(v))) return toast('Sumber dana sudah ada', 'err');
        S.sources.push({ name: v, saldoAwal: 0 }); saveS(true); break;
      }
      case 'rm-source':
        if (S.sources.length <= 1) return toast('Minimal satu sumber dana', 'err');
        if (!(await ask(`Hapus sumber dana "${S.sources[i].name}"?\nTransaksi lama tetap tersimpan.`, { ok: 'Hapus', danger: true }))) return;
        S.sources.splice(i, 1); F.items.forEach((it) => { if (!sourceNames().includes(it.sumber)) it.sumber = defaultSumber(); }); saveS(true); break;
      case 'add-cat': {
        const v = $('#newCat').value.trim(); if (!v) return;
        if (S.categories.some((c) => norm(c) === norm(v))) return toast('Kategori sudah ada', 'err');
        S.categories.push(v); saveS(true); break;
      }
      case 'rm-cat':
        if (!(await ask(`Hapus kategori "${S.categories[i]}"?`, { ok: 'Hapus', danger: true }))) return;
        S.categories.splice(i, 1); saveS(true); break;
      case 'test': return testConnection(b);
      case 'sync': b.disabled = true; await sync({ silent: false }); renderPengaturan(); return;
      case 'check': return checkMissing();
      case 'backup': return backup();
      case 'restore': $('#restoreInput').click(); return;
      case 'csvall': return exportCsv([...active()].sort((a, c) => (a.tanggal + a.jam).localeCompare(c.tanggal + c.jam)), `Semua_Transaksi_${todayStr()}.csv`);
      case 'clean-photo': {
        if (!(await ask('Hapus foto dari HP untuk transaksi yang fotonya sudah tersimpan di Google Drive? Foto tetap bisa dibuka lewat link Drive.'))) return;
        await DB.putMany(DB.all.filter((r) => r.foto && r.fotoUrl && r.synced).map((r) => ({ ...r, foto: '' })));
        toast('Foto lokal dibersihkan', 'ok'); break;
      }
      case 'wipe': {
        const pend = DB.all.filter((r) => !r.synced).length;
        if (!(await ask(`Hapus SEMUA ${DB.all.length} data di HP ini?${pend ? `\n\n⚠️ ${pend} data BELUM tersinkron dan akan hilang permanen!` : ''}`, { ok: 'Lanjut', danger: true }))) return;
        if (!(await ask('Yakin? Tindakan ini tidak bisa dibatalkan.', { ok: 'Hapus semua', danger: true }))) return;
        await DB.clear(); toast('Data di HP dihapus'); break;
      }
      case 'update': return checkUpdate(true);
      case 'install': return installHelp();
    }
    renderPengaturan(); renderPersons(); updateSyncChip();
  });
  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const map = { newPerson: 'add-person', newSource: 'add-source', newCat: 'add-cat' };
    if (map[e.target.id]) { e.preventDefault(); $(`[data-s="${map[e.target.id]}"]`).click(); }
  });
  area.addEventListener('input', (e) => {
    if (e.target.dataset.saldo !== undefined || e.target.id === 'budgetInp') {
      const raw = e.target.value.replace(/[^\d-]/g, '');
      const n = Number(raw) || 0;
      e.target.value = raw === '-' ? '-' : raw ? num(n) : '';
    }
  });
  area.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.saldo !== undefined) { S.sources[+t.dataset.saldo].saldoAwal = Number(t.value.replace(/[^\d-]/g, '')) || 0; saveS(true); renderSaldoBar(); toast('Saldo awal disimpan', 'ok'); sync({ pull: false }); }
    if (t.id === 'budgetInp') { S.budget = parseAmount(t.value); saveS(true); toast('Budget disimpan', 'ok'); sync({ pull: false }); }
    if (t.id === 'devInp') { S.device = t.value.trim() || S.device; saveS(); }
  });
  $('#restoreInput').addEventListener('change', restore);
}
async function testConnection(btn) {
  if (!S.scriptUrl) return toast('URL Web App belum diisi di config.js', 'err');
  if (!navigator.onLine) return toast('Tidak ada internet', 'err');
  btn.disabled = true; btn.textContent = 'Menguji…';
  try { const r = await api({ action: 'ping' }, 30000); toast(`✓ Terhubung ke "${r.name}"`, 'ok', 3500); }
  catch (err) { toast('Gagal: ' + err.message, 'err', 5000); }
  finally { btn.disabled = false; btn.textContent = 'Tes koneksi'; }
}
async function checkMissing() {
  if (!S.scriptUrl || !navigator.onLine) return toast('Butuh internet & URL Spreadsheet', 'err');
  toast('Memeriksa…');
  try {
    const res = await api({ action: 'list' });
    await mergeServer(res);
    const ids = new Set((res.records || []).map((r) => r.id));
    const missing = DB.all.filter((r) => r.synced && !r.deleted && !ids.has(r.id));
    if (!missing.length) return toast('✓ Semua data HP ada di Spreadsheet', 'ok');
    const up = await ask(`${missing.length} transaksi di HP ini tidak ditemukan di Spreadsheet (mungkin dihapus di HP lain atau langsung di Spreadsheet).\n\nPilih "Unggah ulang" untuk mengirim lagi, atau "Hapus dari HP".`, { ok: 'Unggah ulang', cancel: 'Hapus dari HP' });
    if (up) { await DB.putMany(missing.map((r) => ({ ...r, synced: 0, fotoUrl: r.foto ? '' : r.fotoUrl }))); sync({ silent: false }); }
    else if (await ask(`Yakin hapus ${missing.length} transaksi tersebut dari HP?`, { ok: 'Hapus', danger: true })) { await DB.delMany(missing.map((r) => r.id)); toast('Dihapus dari HP'); }
    renderPengaturan(); updateSyncChip();
  } catch (err) { toast('Gagal: ' + err.message, 'err'); }
}
function backup() {
  const data = { app: 'catatan-keuangan', version: VER.v, exportedAt: new Date().toISOString(), settings: sharedSettings(), records: DB.all };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `Backup_Keuangan_${todayStr()}.json`);
  toast('Backup diunduh', 'ok');
}
async function restore(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'catatan-keuangan' || !Array.isArray(data.records)) throw new Error('Bukan file backup aplikasi ini');
    const local = new Map(DB.all.map((r) => [r.id, r]));
    const put = data.records.filter((r) => r && r.id && (!local.has(r.id) || (r.updatedAt || '') > (local.get(r.id).updatedAt || '')));
    if (!(await ask(`Pulihkan ${put.length} transaksi dari backup (${data.records.length} total di file)?${data.settings ? '\nPengaturan (penginput, sumber dana, kategori) juga akan dipulihkan.' : ''}`))) return;
    await DB.putMany(put);
    if (data.settings) { SHARED_KEYS.forEach((k) => { if (data.settings[k] !== undefined) S[k] = data.settings[k]; }); saveS(true); }
    toast(`✓ ${put.length} transaksi dipulihkan`, 'ok');
    renderPengaturan(); renderPersons(); updateSyncChip(); sync();
  } catch (err) { toast('Gagal memulihkan: ' + err.message, 'err', 4000); }
}

/* ============================== SINKRON ============================== */
const SY = { running: false, error: '', again: false };
async function api(payload, timeout = 90000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(S.scriptUrl, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, token: S.token })
    });
    const txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error(res.ok ? 'Balasan bukan JSON — cek URL & akses Web App ("Siapa saja")' : 'HTTP ' + res.status); }
    if (!j.ok) throw new Error(j.error || 'Gagal');
    return j;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Waktu habis (koneksi lambat)');
    if (err instanceof TypeError) throw new Error('Tidak bisa terhubung ke Spreadsheet');
    throw err;
  } finally { clearTimeout(t); }
}
function toServer(r) {
  const o = { ...r }; delete o.foto; delete o.synced; delete o.deleted;
  o.fotoData = r.foto && !r.fotoUrl ? r.foto : '';
  return o;
}
/* --- saldo di header --- */
let hideSaldo = false;
try { hideSaldo = localStorage.getItem('ck_hide_saldo') === '1'; } catch (e) { /* abaikan */ }
function renderSaldoBar() {
  const list = saldoTable('', false);
  const total = sum(list, (s) => s.saldo);
  // di atas 10 juta ditulis ringkas (mis. 124,6 jt) agar muat; angka lengkap ada di Laporan
  const show = (n) => `<small>Rp</small>${hideSaldo ? '•••••' : Math.abs(n) >= 1e7 ? rpShort(n) : (n < 0 ? '-' : '') + num(Math.abs(n))}`;
  $('#saldoList').innerHTML =
    `<button type="button" class="saldo-item total ${total < 0 ? 'neg' : ''}" data-go="laporan"><span>Total</span><b>${show(total)}</b></button>` +
    list.map((s) => `<button type="button" class="saldo-item ${s.saldo < 0 ? 'neg' : ''}" data-go="laporan"><span>${esc(s.name)}</span><b>${show(s.saldo)}</b></button>`).join('');
  $('#btnEye').innerHTML = icon(hideSaldo ? 'eyeOff' : 'eye');
}

function updateSyncChip() {
  renderSaldoBar();
  const el = $('#syncChip'); const p = DB.all.filter((r) => !r.synced).length;
  let cls, txt;
  if (SY.running) { cls = 'busy'; txt = 'Menyinkron…'; }
  else if (!navigator.onLine) { cls = 'off'; txt = p ? `Offline · ${p} tersimpan di HP` : 'Offline · data aman di HP'; }
  else if (!S.scriptUrl) { cls = 'warn'; txt = 'Spreadsheet belum diatur'; }
  else if (SY.error) { cls = 'err'; txt = p ? `Gagal sinkron · ${p} menunggu` : 'Gagal sinkron'; }
  else if (p) { cls = 'warn'; txt = `${p} menunggu sinkron`; }
  else { cls = 'ok'; txt = 'Tersinkron'; }
  el.className = 'sync-chip ' + cls; el.innerHTML = `<i></i>${txt}`;
}
async function sync({ silent = true, pull = true } = {}) {
  if (SY.running) { SY.again = true; return; }
  if (!S.scriptUrl || !navigator.onLine) { updateSyncChip(); if (!silent) toast(!S.scriptUrl ? 'URL Web App belum diisi di config.js' : 'Tidak ada internet — data aman di HP', 'err'); return; }
  SY.running = true; SY.error = ''; updateSyncChip();
  let changed = false;
  try {
    // 1) hapus
    const dels = DB.all.filter((r) => r.deleted && !r.synced);
    if (dels.length) { await api({ action: 'delete', ids: dels.map((r) => r.id) }); await DB.delMany(dels.map((r) => r.id)); changed = true; }
    // 2) kirim data baru / ubahan
    const ups = DB.all.filter((r) => !r.deleted && !r.synced);
    const plain = ups.filter((r) => !(r.foto && !r.fotoUrl)), withPhoto = ups.filter((r) => r.foto && !r.fotoUrl);
    const batches = [];
    for (let i = 0; i < plain.length; i += 25) batches.push(plain.slice(i, i + 25));
    withPhoto.forEach((r) => batches.push([r]));
    for (const b of batches) {
      const res = await api({ action: 'upsert', records: b.map(toServer) });
      const got = new Map((res.results || []).map((x) => [x.id, x]));
      const upd = [];
      for (const r of b) {
        const curr = DB.get(r.id); const x = got.get(r.id);
        if (!curr || !x) continue;
        const n = { ...curr, fotoUrl: x.fotoUrl || curr.fotoUrl };
        if (curr.updatedAt === r.updatedAt) n.synced = 1;
        upd.push(n);
      }
      await DB.putMany(upd); changed = true; updateSyncChip();
    }
    // 3) pengaturan bersama
    if (S.settingsDirty) {
      await api({ action: 'saveSettings', settings: sharedSettings(), updatedAt: S.updatedAt });
      S.settingsDirty = false; saveS();
    }
    // 4) ambil data dari spreadsheet (termasuk catatan pasangan)
    if (pull) { const res = await api({ action: 'list' }); if (await mergeServer(res)) changed = true; }
    S.lastSync = new Date().toISOString(); saveS();
    if (!silent) toast('✓ Sinkronisasi selesai', 'ok');
  } catch (err) {
    SY.error = err.message || String(err);
    if (!silent) toast('Sinkron gagal: ' + SY.error, 'err', 4500);
  } finally {
    SY.running = false; updateSyncChip();
    if (changed) refreshCurrent();
    if (SY.again) { SY.again = false; setTimeout(() => sync(), 500); }
  }
}
async function mergeServer(res) {
  const local = new Map(DB.all.map((r) => [r.id, r]));
  const put = [];
  for (const s of res.records || []) {
    if (!s.id) continue;
    const rec = {
      id: s.id, groupId: s.groupId || '', tanggal: s.tanggal, jam: s.jam || '00:00', penginput: s.penginput || '',
      jenis: s.jenis === 'masuk' ? 'masuk' : 'keluar', sumber: s.sumber || '', kategori: s.kategori || '', uraian: s.uraian || '',
      jumlah: Number(s.jumlah) || 0, keterangan: s.keterangan || '', fotoUrl: s.fotoUrl || '',
      createdAt: s.createdAt || '', updatedAt: s.updatedAt || '', device: s.device || ''
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.tanggal)) continue;
    const l = local.get(s.id);
    if (!l) put.push({ ...rec, foto: '', synced: 1, deleted: 0 });
    else if (l.synced && !l.deleted && rec.updatedAt > (l.updatedAt || '')) put.push({ ...l, ...rec, foto: l.foto, synced: 1, deleted: 0 });
  }
  await DB.putMany(put);
  let settingsChanged = false;
  const st = res.settings;
  if (st && st.data && st.updatedAt && st.updatedAt > (S.updatedAt || '') && !S.settingsDirty) {
    SHARED_KEYS.forEach((k) => { if (st.data[k] !== undefined) S[k] = st.data[k]; });
    S.updatedAt = st.updatedAt; saveS(); settingsChanged = true;
    if (!S.persons.includes(F.person)) F.person = '';
    if (currentView === 'catat' && !formDirty()) { F.items.forEach((it) => { if (!sourceNames().includes(it.sumber)) it.sumber = defaultSumber(); }); renderPersons(); renderItems(); }
  }
  return put.length > 0 || settingsChanged;
}

/* ========================== INSTALL & UPDATE ========================== */
let deferredPrompt = null, swReg = null, manualUpdate = false;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function showInstall() { $('#btnInstall').hidden = isStandalone(); }
function installHelp() {
  openSheet('Pasang Aplikasi', isIOS
    ? `<ol class="steps"><li>Buka halaman ini di <b>Safari</b>.</li><li>Tap tombol <b>Bagikan</b> (kotak dengan panah ke atas).</li><li>Pilih <b>Tambahkan ke Layar Utama</b> lalu <b>Tambah</b>.</li></ol>`
    : `<ol class="steps"><li>Buka di <b>Google Chrome</b>.</li><li>Tap menu <b>⋮</b> di kanan atas.</li><li>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li></ol><p class="help">Jika tombol Install tidak memunculkan jendela, pastikan web dibuka lewat https (GitHub Pages), lalu muat ulang halaman sekali.</p>`);
}
async function doInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice; deferredPrompt = null;
    if (r.outcome === 'accepted') toast('Memasang aplikasi…', 'ok');
  } else installHelp();
}
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { swReg = await navigator.serviceWorker.register('sw.js'); }
  catch (e) { console.warn('SW gagal', e); return; }
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  if (swReg.waiting && navigator.serviceWorker.controller) onUpdateReady();
  swReg.addEventListener('updatefound', () => {
    const w = swReg.installing; if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(); });
  });
  checkUpdate(false);
}
function onUpdateReady() {
  const b = $('#btnUpdate');
  b.classList.remove('spin'); b.classList.add('has-update'); b.innerHTML = icon('refresh') + ' Update tersedia';
  if (manualUpdate || (!formDirty() && $('#sheet').hidden)) applyUpdate();
  else toast('Versi baru tersedia. Tap "Update" setelah selesai mencatat.', '', 4000);
}
function applyUpdate() {
  if (swReg && swReg.waiting) { toast('Memperbarui aplikasi…'); swReg.waiting.postMessage('SKIP_WAITING'); }
  else location.reload();
}
async function checkUpdate(manual) {
  const b = $('#btnUpdate');
  if (manual) manualUpdate = true;
  if (!navigator.onLine) { if (manual) toast('Tidak ada internet. Coba lagi nanti.', 'err'); return; }
  if (!swReg) { if (manual) location.reload(); return; }
  if (manual && swReg.waiting) return applyUpdate();
  if (manual) b.classList.add('spin');
  try { await swReg.update(); } catch (e) { /* offline / gagal */ }
  if (swReg.waiting) { if (manual) applyUpdate(); }
  else if (manual) {
    setTimeout(() => {
      if (swReg.installing || swReg.waiting) return; // onUpdateReady akan menangani
      b.classList.remove('spin'); manualUpdate = false;
      toast(`✓ Sudah versi terbaru (v${VER.v})`, 'ok');
    }, 1200);
  }
}

/* ================================ INIT ================================ */
const RENDER = { catat: renderCatat, riwayat: renderRiwayat, laporan: renderLaporan, analisis: renderAnalisis, pengaturan: renderPengaturan };

function refreshClock() {
  if (!F.touched && !formDirty()) { F.tanggal = todayStr(); F.jam = nowTime(); if (currentView === 'catat') { $('#fTanggal').value = F.tanggal; $('#fJam').value = F.jam; $('#fHari').textContent = fmtDateLong(F.tanggal) + ' (hari ini)'; } }
  else if (!F.touched) { F.jam = F.jam || nowTime(); }
}

(async function init() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); if (currentView === 'analisis') renderAnalisis(); });

  $('#nav').innerHTML = VIEWS.map(([v, l, ic]) => `<button type="button" class="nav-btn" data-v="${v}">${icon(ic)}<span>${l}</span></button>`).join('');
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('.nav-btn'); if (b) go(b.dataset.v); });
  $('#verText').textContent = `v${VER.v} · ${fmtDate(VER.d)}`;
  $('#btnUpdate').innerHTML = icon('refresh') + ' Update';
  $('#btnUpdate').addEventListener('click', () => checkUpdate(true));
  $('#btnInstall').addEventListener('click', doInstall);
  $('#syncChip').addEventListener('click', () => { if (!S.scriptUrl) go('pengaturan'); else sync({ silent: false }); });
  $('#btnEye').addEventListener('click', () => {
    hideSaldo = !hideSaldo;
    try { localStorage.setItem('ck_hide_saldo', hideSaldo ? '1' : '0'); } catch (e) { /* abaikan */ }
    renderSaldoBar();
  });
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetBg').addEventListener('click', closeSheet);
  $('#camInput').addEventListener('change', onPhotoPicked);
  $('#galInput').addEventListener('change', onPhotoPicked);
  $('#aBulan').addEventListener('change', (e) => { if (e.target.value) { AN.month = e.target.value; renderAnalisis(); } });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstall(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; $('#btnInstall').hidden = true; toast('✓ Aplikasi terpasang', 'ok'); });

  try { await DB.open(); await DB.load(); }
  catch (err) { toast('Penyimpanan HP tidak tersedia: ' + err.message, 'err', 6000); DB.all = []; }

  bindCatat(); bindRiwayat(); bindLaporan(); bindPengaturan();
  go('catat');
  updateSyncChip(); showInstall();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* abaikan */ }

  window.addEventListener('online', () => { updateSyncChip(); sync(); checkUpdate(false); });
  window.addEventListener('offline', updateSyncChip);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refreshClock(); renderToday(); sync(); checkUpdate(false); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') { refreshClock(); sync(); } }, 3 * 60 * 1000);
  setInterval(() => { if (document.visibilityState === 'visible') checkUpdate(false); }, 30 * 60 * 1000);

  registerSW();
  sync();
  if (!S.scriptUrl && !localStorage.getItem('ck_welcome')) {
    localStorage.setItem('ck_welcome', '1');
    setTimeout(() => toast('Selamat datang! Atur koneksi Spreadsheet di menu Pengaturan.', '', 5000), 800);
  }
})();

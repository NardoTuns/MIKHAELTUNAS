// Catat Makan Web — perakit aplikasi.
import { h, icon, clear, toast, dialog, overlayOpen, pickFile } from './ui/dom.js';
import * as st from './state.js';
import { S, isLocked } from './state.js';
import { APP_VERSION, DEFAULT_SCRIPT_URL } from './config.js';
import { kvGet, kvSet, requestPersist } from './core/db.js';
import { listMembers } from './core/sync.js';
import { today, nowHour, addDays, fmt, num } from './core/util.js';
import { mealForHour, mealEmoji, total } from './core/fooddb.js';
import { dueReminders } from './core/reminders.js';
import { Period } from './core/period.js';
import { renderHome } from './ui/home.js';
import { renderHistory } from './ui/history.js';
import { renderAnalysis } from './ui/analysis.js';
import { renderProgress } from './ui/progress.js';
import { renderSettings } from './ui/settings.js';
import { openFoodForm } from './ui/foodform.js';
import { avatar, openSwitcher, askPin, LOCK_HINT } from './ui/users.js';

const TABS = [
  ['hari-ini', 'Hari Ini', 'home', renderHome],
  ['riwayat', 'Riwayat', 'history', renderHistory],
  ['analisis', 'Analisis', 'chart', renderAnalysis],
  ['progres', 'Progres', 'star', renderProgress],
  ['pengaturan', 'Pengaturan', 'settings', renderSettings],
];

const app = document.getElementById('app');
const ctx = {};
let tab = 'hari-ini';
let deferredInstall = null;
let swReg = null;
let updateReady = false;

// ------------------------------------------------------------------ tema
ctx.applyTheme = () => {
  const t = S.app.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111511' : '#f6f8f4');
};

// ------------------------------------------------------------------ navigasi
ctx.go = (t, { replace = false } = {}) => {
  const target = TABS.some((x) => x[0] === t) ? t : 'hari-ini';
  const hash = '#/' + target;
  if (location.hash !== hash) { if (replace) history.replaceState(history.state, '', hash); else location.hash = hash; }
  if (tab !== target) { tab = target; window.scrollTo(0, 0); }
  render();
};
window.addEventListener('hashchange', () => {
  const t = location.hash.replace(/^#\/?/, '') || 'hari-ini';
  if (t !== tab) { tab = TABS.some((x) => x[0] === t) ? t : 'hari-ini'; window.scrollTo(0, 0); render(); }
});

ctx.setDate = (d) => { S.date = d > today() ? today() : d; render(); };
ctx.openDay = (d) => { S.date = d; ctx.go('hari-ini'); };
ctx.openAnalysis = (key) => {
  const p = Period.fromKey(key);
  if (p && p.start <= today()) { ctx.period = p; ctx.aTab = 'ringkasan'; }
  ctx.go('analisis');
};
ctx.editFood = (e) => {
  if (isLocked()) { viewFood(e); return; }
  openFoodForm({
    entry: e,
    onDeleted: (entry) => toast(`${entry.name} dihapus`, { action: 'Urungkan', onAction: () => st.saveFood({ ...entry }) }),
  });
};

/** Rincian satu catatan untuk akun terkunci (hanya dibaca). */
function viewFood(e) {
  const row = (k, v) => h('div', { class: 'row' }, h('span', { class: 'grow muted', text: k }), h('b', { text: v }));
  dialog(`${mealEmoji(e.meal)} ${e.name}`, h('div', { class: 'col', style: { gap: '6px' } },
    row('Waktu makan', `${e.meal} · ${e.time}`), row('Porsi', `${num(e.portion)}`), row('Kalori per porsi', `${fmt(e.kcal)} kkal`), row('Total', `${fmt(total(e))} kkal`),
    e.protein + e.carbs + e.fat > 0 ? row('Protein / Karbo / Lemak', `${fmt(e.protein * e.portion)} / ${fmt(e.carbs * e.portion)} / ${fmt(e.fat * e.portion)} g`) : null,
    e.note ? row('Catatan', e.note) : null,
    h('p', { class: 'small muted', style: { margin: '6px 0 0' }, text: '🔒 ' + LOCK_HINT })));
}
ctx.render = () => render();

// ------------------------------------------------------------------ kerangka
let main; let navBtns = {}; let fab; let syncBtn; let userChip; let updateDot;

function buildShell() {
  clear(app);
  document.querySelectorAll('.bottom-nav, .fab').forEach((e) => e.remove());
  userChip = h('button', { class: 'user-chip', 'aria-label': 'Ganti pengguna', onclick: () => openSwitcher(ctx) });
  syncBtn = h('button', { class: 'icon-btn', 'aria-label': 'Sinkron sekarang', title: 'Sinkron sekarang', onclick: async () => {
    if (!st.scriptUrlFor()) { toast('Isi URL Web App dulu di Pengaturan'); return; }
    if (!navigator.onLine) { toast('Sedang offline. Data aman di HP dan akan dikirim saat online.'); return; }
    const m = await st.syncNow();
    toast(m || 'Selesai');
  } });
  updateDot = h('span', { class: 'dot hidden' });
  const header = h('header', { class: 'topbar' }, userChip, h('div', { class: 'spacer' }), syncBtn,
    h('button', { class: 'icon-btn', 'aria-label': 'Cek update', title: 'Cek update', onclick: () => ctx.checkUpdate(true) }, icon('download'), updateDot));
  main = h('main', { id: 'main' });
  const inner = h('div', { class: 'inner' });
  navBtns = {};
  for (const [id, label, ic] of TABS) {
    navBtns[id] = h('button', { 'aria-label': label, onclick: () => ctx.go(id) }, icon(ic), h('span', { text: label }));
    inner.append(navBtns[id]);
  }
  fab = h('button', { class: 'fab', onclick: () => openFoodForm({ meal: mealForHour(nowHour()) }) }, icon('plus'), 'Catat makanan');
  app.append(header, main);
  document.body.append(h('nav', { class: 'bottom-nav', 'aria-label': 'Navigasi' }, inner), fab);
}

function drawHeader() {
  clear(userChip);
  userChip.append(...[avatar(S.user), h('span', { class: 'bold ellipsis', text: S.user.name }), isLocked() ? h('span', { class: 'lk', title: 'Hanya bisa dilihat', text: '🔒' }) : null, h('span', { class: 'muted small', text: '▾' })].filter(Boolean));
  clear(syncBtn);
  syncBtn.append(icon('sync', S.sync.running ? 'spin' : ''));
  if (!S.sync.running && (S.sync.error || S.sync.pending > 0) && st.scriptUrlFor()) syncBtn.append(h('span', { class: 'dot', style: S.sync.error ? null : { background: 'var(--carb)' } }));
  syncBtn.title = S.sync.error ? 'Sinkron gagal: ' + S.sync.error : S.sync.pending ? `${S.sync.pending} perubahan belum terkirim` : 'Sinkron sekarang';
  updateDot.classList.toggle('hidden', !updateReady);
}

let raf = 0;
function render() {
  if (!S.user || !main) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    drawHeader();
    for (const [id] of TABS) navBtns[id].classList.toggle('active', id === tab);
    fab.classList.toggle('hidden', tab !== 'hari-ini' || isLocked());
    const view = h('div', { class: 'view' });
    const fn = TABS.find((x) => x[0] === tab)[3];
    try { fn(view, ctx); } catch (e) { console.error(e); view.append(h('div', { class: 'card warn', text: 'Terjadi kesalahan saat menampilkan halaman: ' + e.message })); }
    const y = window.scrollY;
    clear(main).append(view);
    window.scrollTo(0, y);
  });
}

st.subscribe((kind) => {
  if (kind === 'user') { ctx.aiCache = {}; ctx.aiState = {}; ctx.period = null; ctx.historyQuery = ''; }
  if (kind === 'sync') { if (main) drawHeader(); if (tab === 'pengaturan') render(); return; }
  render();
});

// ------------------------------------------------------------------ pasang (PWA)
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
ctx.installState = () => {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return 'installed';
  if (deferredInstall) return 'prompt';
  return isIos() ? 'ios' : 'manual';
};
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (tab === 'hari-ini' || tab === 'pengaturan') render(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('🎉 Catat Makan terpasang di layar utama'); render(); });

ctx.install = async () => {
  const s = ctx.installState();
  if (s === 'prompt') {
    deferredInstall.prompt();
    const r = await deferredInstall.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') deferredInstall = null;
    return;
  }
  if (s === 'installed') { toast('Sudah terpasang'); return; }
  const ios = s === 'ios';
  await dialog('Pasang di layar utama', h('div', { class: 'col' },
    h('p', { style: { margin: 0 }, text: ios ? 'Di iPhone/iPad (Safari):' : 'Di Android (Chrome):' }),
    h('ol', { class: 'step-list' }, ...(ios ? [
      h('li', {}, 'Buka halaman ini di ', h('b', { text: 'Safari' }), '.'),
      h('li', {}, 'Ketuk tombol ', h('b', { text: 'Bagikan' }), ' (kotak dengan panah ke atas).'),
      h('li', {}, 'Pilih ', h('b', { text: 'Tambah ke Layar Utama' }), ' lalu ', h('b', { text: 'Tambah' }), '.'),
      h('li', {}, 'Buka Catat Makan dari ikon di layar utama — bisa dipakai tanpa internet.'),
    ] : [
      h('li', {}, 'Ketuk menu ', h('span', { class: 'kbd', text: '⋮' }), ' di pojok kanan atas Chrome.'),
      h('li', {}, 'Pilih ', h('b', { text: 'Instal aplikasi' }), ' atau ', h('b', { text: 'Tambahkan ke layar utama' }), '.'),
      h('li', {}, 'Buka Catat Makan dari ikon di layar utama — bisa dipakai tanpa internet.'),
    ])),
    h('p', { class: 'small muted', style: { margin: 0 }, text: 'Data tersimpan di HP. Menghapus data situs/browser akan menghapus catatan yang belum tersinkron, jadi aktifkan sinkron atau cadangkan file.' })));
};

ctx.installCard = () => {
  const s = ctx.installState();
  if (s === 'installed' || localStorage.getItem('cm-install-dismissed') === '1') return null;
  return h('div', { class: 'banner' }, h('span', { style: { fontSize: '1.5rem' }, text: '📲' }),
    h('div', { class: 'grow' }, h('div', { class: 'bold', text: 'Pasang Catat Makan di layar utama' }), h('div', { class: 'small muted', text: 'Buka seperti aplikasi biasa & tetap jalan tanpa internet.' })),
    h('div', { class: 'col', style: { gap: '4px' } },
      h('button', { class: 'btn small', text: 'Pasang', onclick: () => ctx.install() }),
      h('button', { class: 'btn text small', text: 'Nanti', onclick: () => { localStorage.setItem('cm-install-dismissed', '1'); render(); } })));
};

// ------------------------------------------------------------------ pembaruan
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

function onWaiting() {
  updateReady = true;
  if (main) drawHeader();
}

async function applyUpdate() {
  const w = swReg?.waiting;
  if (!w) { location.reload(); return; }
  w.postMessage({ type: 'SKIP_WAITING' });
}

ctx.checkUpdate = async (manual = false) => {
  if (!('serviceWorker' in navigator) || !swReg) { if (manual) toast('Pembaruan otomatis tidak didukung browser ini. Muat ulang halaman.'); return; }
  let remote = null;
  try { remote = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json(); } catch { /* offline */ }
  if (!remote && manual) { toast('Tidak bisa cek update (offline?). Coba lagi saat online.'); return; }
  try { await swReg.update(); } catch { /* abaikan */ }
  const newer = remote && cmpVer(remote.version, APP_VERSION) > 0;
  ctx.updateInfo = remote ? `Versi terbaru: ${remote.version}${remote.date ? ` (${remote.date})` : ''}` : null;
  if (swReg.waiting || newer) {
    if (!swReg.waiting) {
      // tunggu unduhan versi baru selesai
      await new Promise((res) => {
        const sw = swReg.installing;
        if (!sw) { setTimeout(res, 2500); return; }
        sw.addEventListener('statechange', () => { if (sw.state === 'installed' || sw.state === 'redundant') res(); });
        setTimeout(res, 15000);
      });
    }
    onWaiting();
    if (!manual) {
      toast(`Versi baru ${remote?.version || ''} siap dipasang`, { action: 'Perbarui', onAction: applyUpdate });
      return;
    }
    const notes = (remote?.changes || []).slice(0, 8);
    const ok = await dialog(`Versi baru ${remote?.version || ''} tersedia`, h('div', { class: 'col' },
      h('p', { style: { margin: 0 }, text: `Terpasang: ${APP_VERSION}. Data di HP tidak akan hilang.` }),
      notes.length ? h('ul', { class: 'step-list' }, ...notes.map((n) => h('li', { text: n }))) : null),
    [{ label: 'Nanti', value: false }, { label: 'Perbarui sekarang', value: true, kind: 'tonal' }]);
    if (ok) await applyUpdate();
  } else if (manual) {
    toast(`Sudah versi terbaru (${APP_VERSION})`);
  }
  if (tab === 'pengaturan') render();
};

async function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (swReg.waiting && navigator.serviceWorker.controller) onWaiting();
    swReg.addEventListener('updatefound', () => {
      const sw = swReg.installing;
      sw?.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && updateReady) { reloading = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'ACTION') handleAction(e.data.action); });
  } catch (e) { console.warn('Service worker gagal:', e); }
}

// ------------------------------------------------------------------ pengingat
async function notify(r) {
  const url = r.type === 'weekly' ? './#/analisis' : r.type === 'weight' ? './#/progres' : r.type === 'water' ? './?act=water' : './?act=add';
  let shown = false;
  if ('Notification' in window && Notification.permission === 'granted' && swReg) {
    try {
      await swReg.showNotification(r.title, { body: r.body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: r.key, data: { url }, renotify: false });
      shown = true;
    } catch { /* abaikan */ }
  }
  if (document.visibilityState === 'visible') {
    toast(`${r.title} — ${r.body}`, r.type === 'water' ? { action: '+1 gelas', onAction: () => st.addWater(today(), 1) }
      : r.type === 'meal' ? { action: 'Catat', onAction: () => openFoodForm({ meal: r.meal }) } : r.type === 'weekly' ? { action: 'Lihat', onAction: () => ctx.openAnalysis(Period.of('W', addDays(today(), -7)).key) } : {});
  }
  return shown;
}

async function checkReminders() {
  if (!S.user || isLocked()) return; // akun terkunci tidak mencatat, jadi tidak diingatkan
  const s = st.settings();
  const t = today();
  const key = 'fired:' + S.user.id;
  const rec = (await kvGet(key)) || { date: t, keys: [] };
  if (rec.date !== t) { rec.date = t; rec.keys = []; }
  const foods = st.foodsOn(t);
  const now = new Date();
  const due = dueReminders({
    date: t, minutes: now.getHours() * 60 + now.getMinutes(), settings: s,
    mealsLogged: new Set(foods.map((e) => e.meal)), water: st.waterOn(t), hasWeightToday: S.weight.has(t) && !S.weight.get(t).deleted,
    fired: new Set(rec.keys), totalKcal: foods.reduce((a, e) => a + total(e), 0),
  });
  for (const r of due) { rec.keys.push(r.key); await notify(r); }
  if (due.length) await kvSet(key, rec);
}

ctx.testNotification = async () => {
  if (!('Notification' in window)) { toast('Browser ini tidak mendukung notifikasi. Gunakan "Tambahkan ke Kalender HP".'); return; }
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') {
    toast(isIos() ? 'Di iPhone, notifikasi web hanya untuk aplikasi yang sudah dipasang di layar utama (iOS 16.4+). Izinkan di Pengaturan iPhone.' : 'Izin notifikasi ditolak. Izinkan di pengaturan situs browser.');
    return;
  }
  await notify({ key: 'test-' + Date.now(), type: 'meal', meal: mealForHour(nowHour()), title: '🔔 Tes pengingat Catat Makan', body: 'Notifikasi berfungsi. Ketuk untuk mencatat makanan.' });
  render();
};

function handleAction(act) {
  if (isLocked()) { toast(LOCK_HINT); return; }
  if (act === 'add') { ctx.go('hari-ini'); setTimeout(() => openFoodForm({ meal: mealForHour(nowHour()) }), 120); }
  else if (act === 'water') st.addWater(today(), 1).then((n) => toast(`💧 +1 gelas (${n} hari ini)`));
}

// ------------------------------------------------------------------ onboarding (pilih anggota keluarga)
const GAS_RE = /^https:\/\/script\.google(usercontent)?\.com\//;

/** Tautan undangan: <alamat web>#url=<URL Web App>. Hanya alamat Google Apps Script yang diterima (agar data keluarga tidak bisa dibelokkan ke server lain). */
function takeInvite() {
  const m = /^#url=(.+)$/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let url = '';
  try { url = decodeURIComponent(m[1]).trim(); } catch { return null; }
  return GAS_RE.test(url) ? url : null;
}

function onboarding(prefillUrl = '') {
  clear(app);
  const urlIn = h('input', { type: 'url', value: prefillUrl || S.app.scriptUrl || DEFAULT_SCRIPT_URL, placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off' });
  const err = h('div', { class: 'small over' });
  const next = h('button', { class: 'btn block', text: 'Lanjut' });
  const page = (...kids) => { clear(app); app.append(h('main', { style: { paddingBottom: '40px' } }, h('div', { class: 'view', style: { paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))' } }, ...kids))); };

  const stepMembers = async (members, url) => {
    const found = (members || []).filter((m) => m.syncId !== '');
    const picked = new Set(found.length === 1 ? [found[0].syncId] : []);
    const owner = (members || []).find((m) => m.syncId === '');
    const nameIn = h('input', { type: 'text', maxlength: 30, placeholder: 'mis. Adik (kosongkan bila tidak perlu)', autocomplete: 'off' });
    const go = h('button', { class: 'btn block', text: 'Mulai' });
    go.onclick = async () => {
      go.disabled = true;
      const mainU = await st.ensureMainUser();
      if (owner?.name) mainU.name = owner.name.slice(0, 30);
      if (owner?.emoji) mainU.emoji = owner.emoji;
      if (owner?.color) mainU.color = owner.color;
      const created = [];
      for (const m of found.filter((x) => picked.has(x.syncId))) {
        created.push(await st.createUser({ name: m.name || m.syncId, emoji: m.emoji || undefined, color: m.color || undefined, syncId: m.syncId }));
      }
      if (nameIn.value.trim()) created.push(await st.createUser({ name: nameIn.value.trim(), syncId: st.suggestSyncId(nameIn.value) }));
      await st.switchUser((created[0] || mainU).id);
      await boot();
      if (navigator.onLine) {
        toast('Mengambil data dari Spreadsheet…');
        const m = await st.syncNow({ silent: true, all: true });
        toast(m || 'Sinkron selesai');
      }
    };
    page(
      h('div', { class: 'hero' }, h('h2', { text: 'Siapa yang memakai HP ini? 👨‍👩‍👧' }), h('p', { text: 'Pilih anggota keluarga yang akan mencatat di HP ini. Akun utama (pemilik) ikut tampil, tetapi hanya bisa dilihat.' })),
      owner || found.length ? h('div', { class: 'card col' },
        owner ? h('div', { class: 'row' }, h('span', { text: owner.emoji || '🙂', style: { fontSize: '1.5rem' } }), h('div', { class: 'grow' }, h('div', { class: 'bold', text: `🔒 ${owner.name || 'Pemilik'}` }), h('div', { class: 'tiny muted', text: 'Akun utama · hanya bisa dilihat' }))) : null,
        ...found.map((m) => {
          const cb = h('input', { type: 'checkbox', class: 'switch', checked: picked.has(m.syncId) });
          cb.addEventListener('change', () => { if (cb.checked) picked.add(m.syncId); else picked.delete(m.syncId); });
          return h('label', { class: 'switch-row' }, h('div', { class: 'txt' }, `${m.emoji || '🙂'} ${m.name || m.syncId}`, h('div', { class: 'tiny muted', text: `ID sinkron: ${m.syncId}` })), cb);
        })) : h('div', { class: 'card' }, h('p', { class: 'small muted', style: { margin: 0 }, text: members === null
        ? 'Daftar anggota belum tersedia (Code.gs di Spreadsheet belum versi terbaru). Anda tetap bisa menambah anggota baru di bawah, atau perbarui Code.gs lalu buka ulang halaman ini.'
        : 'Belum ada anggota keluarga di Spreadsheet. Tambahkan anggota baru di bawah, atau tambahkan lebih dulu lewat aplikasi Android.' })),
      h('div', { class: 'card col' }, h('label', { class: 'field' }, h('span', { text: 'Tambah anggota baru (opsional)' }), nameIn),
        h('div', { class: 'tiny muted', text: 'Anggota baru otomatis mendapat ID sinkron dan muncul di aplikasi Android setelah sinkron.' })),
      go, h('button', { class: 'btn text', text: '‹ Ubah URL', onclick: () => onboarding(url) }));
  };

  next.onclick = async () => {
    const url = urlIn.value.trim();
    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url)) { err.textContent = 'URL Web App harus diawali https://'; urlIn.focus(); return; }
    next.disabled = true; next.textContent = 'Menghubungi…'; err.textContent = '';
    S.app.scriptUrl = url; S.app.autoSync = true; await st.saveApp();
    try {
      const info = await st.ensureServer(url, true);
      if (!info.multiUser) err.textContent = 'Catatan: Code.gs di Spreadsheet masih versi lama, anggota keluarga belum bisa sinkron. Perbarui ke versi 2.1 (lihat README).';
      const members = info.hasMembers ? await listMembers(url) : null;
      await stepMembers(members, url);
    } catch (e) {
      err.textContent = 'Gagal terhubung: ' + e.message;
      next.disabled = false; next.textContent = 'Lanjut';
    }
  };

  page(
    h('div', { class: 'hero' }, h('h2', { text: 'Catat Makan Keluarga 👋' }), h('p', { text: 'Catat makan, minum, dan berat badan untuk seluruh keluarga. Jalan tanpa internet dan tersinkron ke Google Spreadsheet.' })),
    h('div', { class: 'card col' },
      h('label', { class: 'field' }, h('span', { text: 'URL Web App (dari tautan undangan)' }), urlIn),
      h('div', { class: 'small muted', text: 'Minta tautan undangan dari pemilik aplikasi (Pengaturan › Sinkron › Bagikan tautan undangan). Membuka tautan itu mengisi kolom ini otomatis.' }),
      err),
    next,
    h('button', { class: 'btn text', text: 'Pulihkan dari file cadangan (.json)', onclick: async () => {
      const f = await pickFile({ accept: '.json,application/json' });
      if (!f) return;
      try {
        await st.ensureMainUser();
        await st.importBackup(JSON.parse(await f.text()));
        await st.switchUser((st.editableUsers()[0] || S.users[0]).id);
        await boot();
        toast('Cadangan dipulihkan');
      } catch (e) { toast('Gagal: ' + e.message); }
    } }));
  setTimeout(() => urlIn.focus(), 200);
}
// ------------------------------------------------------------------ mulai
async function boot() {
  buildShell();
  const t0 = (location.hash.replace(/^#\/?/, '') || 'hari-ini');
  tab = TABS.some((x) => x[0] === t0) ? t0 : 'hari-ini';
  render();
  // Kunci PIN saat aplikasi dibuka: tidak bisa dilewati, hanya bisa membuka akun lain yang PIN-nya benar.
  const locked = !!S.user.pinHash;
  document.body.classList.toggle('locked', locked);
  while (S.user.pinHash) {
    if (await askPin(S.user, `Halo ${S.user.name}, masukkan PIN`)) break;
    if (S.users.length < 2) continue;
    const pick = await dialog('Pakai akun lain?', h('div', { class: 'col' }, ...S.users.filter((u) => u.id !== S.user.id).map((u) =>
      h('div', { class: 'row' }, avatar(u), h('span', { class: 'grow', text: u.name + (u.pinHash ? ' 🔒' : '') })))),
    [{ label: 'Coba PIN lagi', value: null }, ...S.users.filter((u) => u.id !== S.user.id).map((u) => ({ label: u.name, value: u.id, kind: 'tonal' }))]);
    const u = S.users.find((x) => x.id === pick);
    if (u && await askPin(u)) { await st.switchUser(u.id); break; }
  }
  document.body.classList.remove('locked');
  const params = new URLSearchParams(location.search);
  const act = params.get('act');
  if (act) { history.replaceState(null, '', location.pathname + location.hash); handleAction(act); }
  if (st.scriptUrlFor() && S.app.autoSync && navigator.onLine) setTimeout(() => st.syncNow({ silent: true, all: true }), 1500);
  checkReminders();
}

let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.user) return;
  lastToday = st.rollDateIfNeeded(lastToday);
  checkReminders();
  if (st.scriptUrlFor() && S.app.autoSync && navigator.onLine && Date.now() - S.sync.lastAt > 5 * 60000 && !overlayOpen()) st.syncNow({ silent: true });
});
window.addEventListener('online', () => { if (S.user && st.scriptUrlFor() && S.app.autoSync) st.syncNow({ silent: true, all: true }); });
setInterval(() => { if (S.user) { lastToday = st.rollDateIfNeeded(lastToday); checkReminders(); } }, 60000);
setInterval(() => { if (S.user && st.scriptUrlFor() && S.app.autoSync && navigator.onLine) st.syncNow({ silent: true }); }, 30 * 60000);
setInterval(() => ctx.checkUpdate(false), 6 * 3600000);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => ctx.applyTheme());
// Upaya mengubah akun terkunci (mis. lewat tombol lama di layar) ditolak dengan pesan ramah, bukan galat diam-diam.
window.addEventListener('unhandledrejection', (ev) => {
  if (ev.reason?.name === 'LockedError') { ev.preventDefault(); toast(ev.reason.message); }
});

(async () => {
  try {
    await st.init();
  } catch (e) {
    app.append(h('div', { class: 'card warn', style: { margin: '20px' }, text: 'Penyimpanan HP tidak bisa dibuka: ' + e.message + '. Jika memakai mode penyamaran/privat, buka di tab biasa.' }));
    return;
  }
  ctx.applyTheme();
  window.__catatmakan = { S, st, ctx }; // untuk uji otomatis
  registerSw();
  requestPersist();
  setTimeout(() => ctx.checkUpdate(false), 4000);
  const invite = takeInvite();
  if (invite && S.users.length && invite !== S.app.scriptUrl) {
    // Tautan undangan baru di HP yang sudah dipakai: tanya dulu, jangan diam-diam mengganti Spreadsheet.
    if (await dialog('Pakai Spreadsheet dari tautan ini?', 'HP ini sudah terhubung ke Spreadsheet lain. Mengganti alamat tidak menghapus data di HP, tetapi sinkron berikutnya memakai alamat baru.',
      [{ label: 'Tidak', value: false }, { label: 'Ya, ganti', value: true, kind: 'tonal' }])) { S.app.scriptUrl = invite; await st.saveApp(); }
  }
  if (!S.users.length) onboarding(invite || ''); else await boot();
})();

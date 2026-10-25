// Uji end-to-end di Chrome headless (layar HP) terhadap Code.gs 2.0 tiruan.
// Pakai: node tools/e2e.mjs [folder-screenshot]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './serve.mjs';
import { launchBrowser } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
const ok = (m) => console.log('✔ ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = createServer();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const base = `http://127.0.0.1:${port}/`;
const GAS = base + 'gas/exec';

async function phone(browser) {
  const p = await browser.newPage();
  await p.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 860, deviceScaleFactor: 1, mobile: true });
  await p.send('Network.enable');
  await p.send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' });
  await p.send('Network.setBlockedURLs', { urls: ['*openfoodfacts.org*'] }); // uji tertutup: tanpa internet luar
  const h = {
    p,
    async click(text, sel = 'button', exact = false) {
      await p.waitFor(`[...document.querySelectorAll(${JSON.stringify(sel)})].some((b) => b.getClientRects().length && (${exact} ? b.textContent.trim() === ${JSON.stringify(text)} : b.textContent.includes(${JSON.stringify(text)})))`, 8000);
      await p.eval(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((b) => b.getClientRects().length && (${exact} ? b.textContent.trim() === ${JSON.stringify(text)} : b.textContent.includes(${JSON.stringify(text)}))); all[all.length - 1].click(); })()`);
    },
    async type(sel, value) {
      await p.waitFor(`document.querySelector(${JSON.stringify(sel)})`, 8000);
      await p.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].pop(); el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },
    st: (expr) => p.eval(`(async () => { const { S, st } = window.__catatmakan; return (${expr}); })()`),
    async ready() { await p.waitFor('window.__catatmakan && window.__catatmakan.S.ready', 15000); },
    async idle() { await p.waitFor('!window.__catatmakan.S.sync.running', 20000); await sleep(150); },
    async shot(name) { if (shots) { await sleep(350); await p.screenshot(join(shots, name + '.png')); } },
    noDialog: () => p.waitFor('!document.querySelector(".scrim")', 8000),
  };
  return h;
}

async function onboard(h, name) {
  await h.p.goto(base);
  await h.ready();
  await h.type('input[autocomplete=given-name]', name);
  await h.type('input[type=url]', GAS);
  await h.click('Mulai', 'button', true);
  await h.p.waitFor('document.querySelector(".bottom-nav") && window.__catatmakan.S.user', 10000);
  await h.p.waitFor('window.__catatmakan.S.sync.lastAt > 0', 20000); // sinkron awal sudah selesai
  await sleep(1800); // sinkron otomatis saat dibuka (1,5 detik) ikut berjalan
  await h.idle();
}

const browser = await launchBrowser({ width: 412, height: 860 });
const browser2 = await launchBrowser({ width: 412, height: 860 });
try {
  const A = await phone(browser);
  await onboard(A, 'Geby');
  assert.equal(await A.st('S.user.syncId'), '');
  assert.match(await A.st('S.sync.lastMsg'), /Berhasil/);
  ok('onboarding: pengguna utama dibuat & tersambung ke Code.gs 2.0');

  // ---- catat makanan lewat formulir (saran lokal)
  await A.click('Catat makanan', '.fab');
  await A.p.waitFor('document.querySelector(".sheet")');
  await A.shot('02-form-catat');
  await A.type('.sheet input[aria-label="Nama makanan"]', 'nasi put');
  await A.click('Nasi putih', '.sheet .list-item');
  assert.equal(await A.p.eval('document.querySelector(".sheet input[aria-label=\\"kkal per porsi\\"]").value'), '195');
  await A.click('Simpan', '.sheet button', true);
  await A.noDialog();
  assert.equal(await A.st('st.foodsOn(window.__catatmakan.S.date).length'), 1);
  ok('formulir: saran database bawaan mengisi kalori, makanan tersimpan');

  // ---- air & catat cepat
  for (let i = 0; i < 3; i++) { await A.click('+ 1 gelas'); await sleep(120); }
  assert.equal(await A.st('st.waterOn(S.date)'), 3);
  await A.type('input[aria-label="Catat cepat"]', '2 tempe goreng, teh tawar');
  await A.click('Catat', 'button', true);
  await A.p.waitFor('document.querySelector(".dialog")', 12000);
  const preview = await A.p.eval('document.querySelector(".dialog").innerText');
  assert.match(preview, /2 × Tempe goreng/);
  await A.click('Simpan', '.dialog button', true);
  await A.p.waitFor('window.__catatmakan.st.foodsOn(window.__catatmakan.S.date).length === 3');
  const tempe = await A.st('st.foodsOn(S.date).find((e) => e.name === "Tempe goreng")');
  assert.equal(tempe.portion, 2);
  assert.equal(tempe.kcal, 120);
  await A.shot('01-hari-ini');
  ok('air +3 gelas; catat cepat "2 tempe goreng, teh tawar" → 2 makanan dengan porsi & kalori benar');

  // ---- hapus & urungkan
  await A.click('Tempe goreng', '.list-item');
  await A.click('Hapus', '.sheet button');
  await A.noDialog();
  assert.equal(await A.st('st.foodsOn(S.date).length'), 2);
  await A.click('Urungkan', '.toast button');
  await A.p.waitFor('window.__catatmakan.st.foodsOn(window.__catatmakan.S.date).length === 3');
  ok('hapus makanan lalu "Urungkan" mengembalikannya');

  // ---- sinkron ke Spreadsheet
  await A.click('', 'button[aria-label="Sinkron sekarang"]');
  await A.idle();
  const food = srv.gas.sheets.get('Makanan').objects().filter((r) => !r.deleted || r.deleted === 'false');
  assert.equal(food.filter((r) => r.user === '' && r.deleted === false).length, 3);
  assert.equal(srv.gas.sheets.get('Air').objects()[0].gelas, 3);
  assert.equal(await A.st('S.sync.pending'), 0);
  ok('sinkron: 3 makanan & 3 gelas air terkirim ke Spreadsheet sebagai pengguna utama');

  // ---- pengguna kedua
  await A.click('Pengaturan', '.bottom-nav button');
  await A.click('Tambah pengguna');
  await A.p.waitFor('document.querySelector(".dialog")');
  await A.type('.dialog input[maxlength="30"]', 'Budi');
  const budiSync = await A.p.eval('document.querySelectorAll(".dialog input[type=text]")[1].value');
  assert.match(budiSync, /^budi-[a-z0-9]{4}$/);
  await A.click('Tambah', '.dialog button', true);
  await A.click('Pindah', '.dialog button', true);
  await A.p.waitFor('window.__catatmakan.S.user.name === "Budi"');
  await A.noDialog();
  assert.equal(await A.st('st.allFoods().length'), 0);
  await A.click('Hari Ini', '.bottom-nav button');
  await A.click('+ 1 gelas');
  await A.type('input[aria-label="Catat cepat"]', 'bakso');
  await A.click('Catat', 'button', true);
  await A.click('Simpan', '.dialog button', true);
  await A.p.waitFor('window.__catatmakan.st.allFoods().length === 1');
  await A.st('st.saveSettings({ targetKcal: 2100 })');
  await A.st('st.syncNow()');
  await A.idle();
  const air = srv.gas.sheets.get('Air').objects();
  assert.equal(air.length, 2, 'air per pengguna tidak saling menimpa');
  assert.deepEqual(air.map((r) => [r.user, r.gelas]).sort(), [['', 3], [budiSync, 1]].sort());
  assert.equal(srv.gas.sheets.get('Makanan').objects().filter((r) => r.user === budiSync).length, 1);
  assert.equal(JSON.parse(srv.gas.sheets.get('Profil').objects().find((r) => r.user === budiSync).data).settings.targetKcal, 2100);
  ok(`pengguna kedua "Budi" (${budiSync}): data terpisah, sinkron air/makanan/profil per pengguna`);

  // ---- ganti pengguna lewat avatar
  await A.click('', 'button.user-chip');
  await A.p.waitFor('document.querySelector(".sheet")');
  await A.shot('06-ganti-pengguna');
  await A.click('Geby', '.sheet .list-item');
  await A.p.waitFor('window.__catatmakan.S.user.name === "Geby"');
  await A.noDialog();
  assert.equal(await A.st('st.allFoods().length'), 3);
  ok('ganti pengguna lewat avatar: kembali ke Geby dengan datanya sendiri');

  // ---- perangkat kedua (HP lain): data & profil ikut tertarik
  const B = await phone(browser2);
  await onboard(B, 'Geby HP2');
  assert.equal(await B.st('st.allFoods().length'), 3);
  assert.equal(await B.st('st.waterOn(S.date)'), 3);
  await B.st(`(async () => { const u = await st.createUser({ name: 'Budi', syncId: '${budiSync}' }); await st.switchUser(u.id); await st.syncNow(); return true; })()`);
  await B.idle();
  const diag = await B.st('({ user: S.user.name, syncId: S.user.syncId, msg: S.sync.lastMsg, foods: st.allFoods().length, users: S.users.map((u) => u.name + ":" + u.syncId) })');
  assert.equal(diag.foods, 1, JSON.stringify(diag));
  assert.equal(await B.st('S.settings.targetKcal'), 2100);
  ok('HP kedua: data Geby & Budi (termasuk target dari profil) tersinkron dari Spreadsheet');

  // ---- analisis, AI, laporan
  await A.click('Analisis', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Skor diet")');
  await A.shot('03-analisis');
  await A.click('Gizi', '.chip', true);
  await A.p.waitFor('document.body.innerText.includes("Indeks Massa Tubuh")');
  await A.click('Saran AI', '.chip', true);
  await A.click('Analisis dengan AI');
  await A.p.waitFor('document.body.innerText.includes("Penilaian AI: 72/100")', 15000);
  await A.click('Camilan sehat di bawah 150 kkal?', '.chip');
  await A.p.waitFor('document.body.innerText.includes("Jawaban AI tiruan")', 15000);
  await A.shot('04-saran-ai');
  await A.click('Laporan', '.chip', true);
  await A.p.waitFor('document.querySelector("pre.preview")');
  assert.match(await A.p.eval('document.querySelector("pre.preview").textContent'), /Laporan Diet Mingguan[\s\S]*Analisis AI/);
  await A.click('Bagikan PDF');
  await A.p.waitFor('window.jspdf && !document.body.innerText.includes("Membuat…")', 15000);
  const pdfSize = await A.p.eval(`(async () => { const m = await import('./js/core/report.js'); const a = await import('./js/ui/analysis.js'); const ctx = window.__catatmakan.ctx; const blob = m.reportPdf(window.jspdf.jsPDF, a.currentReport(ctx), null, 'Geby'); const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5)); return [blob.size, head]; })()`);
  assert.equal(pdfSize[1], '%PDF-');
  assert.ok(pdfSize[0] > 3000);
  ok(`analisis: skor, gizi, AI (analisis & tanya jawab), laporan teks & PDF (${Math.round(pdfSize[0] / 1024)} KB)`);

  await A.click('Progres', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Kalender catatan") && document.body.innerText.includes("Pencapaian")');
  await A.type('input[aria-label="Berat hari ini (kg)"]', '62,5');
  await A.click('Simpan', 'button', true);
  await A.p.waitFor('window.__catatmakan.st.weights().length === 1');
  await A.shot('05-progres');
  await A.click('Pengaturan', '.bottom-nav button');
  await A.shot('07-pengaturan');
  ok('progres: grafik, berat badan, kalender, lencana; pengaturan tampil');

  // ---- offline: server mati → aplikasi tetap terbuka dari cache, data tetap ada
  await A.p.waitFor('navigator.serviceWorker.controller', 15000);
  await srv.closeNow();
  await A.p.goto(base + '?uji=offline#/hari-ini');
  await A.ready();
  await A.p.waitFor('document.querySelector(".bottom-nav")', 10000);
  assert.equal(await A.st('st.allFoods().length'), 3);
  await A.st('st.saveFood({ date: S.date, time: "15:00", meal: "Camilan", name: "Pisang", portion: 1, kcal: 90 })');
  await A.st('st.syncNow()');
  await A.idle();
  assert.match(await A.st('S.sync.lastMsg'), /Gagal/);
  assert.equal(await A.st('st.allFoods().length'), 4);
  assert.ok(await A.st('S.sync.pending') > 0);
  await A.shot('08-offline');
  ok('offline: aplikasi terbuka dari cache, catatan baru tersimpan di HP, sinkron gagal dengan aman');

  // ---- internet kembali → terkirim; data lama tetap di HP
  const gas = srv.gas;
  srv = createServer({ gas });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  await A.st('st.syncNow()');
  await A.idle();
  assert.match(await A.st('S.sync.lastMsg'), /Berhasil/);
  assert.equal(gas.sheets.get('Makanan').objects().filter((r) => r.user === '' && r.deleted === false).length, 4);
  assert.equal(await A.st('st.allFoods().length'), 4);
  assert.equal(await A.st('S.sync.pending'), 0);
  ok('online lagi: catatan offline terkirim; semua data yang sudah tersinkron tetap tersimpan di HP');

  // ---- tombol Update: simulasikan rilis 2.0.1
  const rep = (f, a, b) => readFileSync(join(root, f), 'utf8').replace(a, b);
  srv.overrides.set('version.json', JSON.stringify({ version: '2.0.1', date: '2026-10-26', changes: ['Perbaikan kecil (uji)'] }));
  srv.overrides.set('js/config.js', rep('js/config.js', /APP_VERSION = '[^']+'/, "APP_VERSION = '2.0.1'"));
  srv.overrides.set('sw.js', rep('sw.js', /const CACHE = '[^']+'/, "const CACHE = 'catatmakan-2.0.1-uji'"));
  await A.click('', 'button[aria-label="Cek update"]');
  await A.p.waitFor('document.querySelector(".dialog") && document.querySelector(".dialog").innerText.includes("2.0.1")', 20000);
  await A.shot('09-update');
  await A.click('Perbarui sekarang', '.dialog button');
  await sleep(1500);
  await A.ready();
  await A.p.waitFor('window.__catatmakan && document.querySelector(".bottom-nav")', 15000);
  const ver = await A.p.eval(`import('./js/config.js').then((m) => m.APP_VERSION)`);
  assert.equal(ver, '2.0.1');
  assert.equal(await A.st('st.allFoods().length'), 4);
  ok('tombol Update: versi 2.0.1 terdeteksi, dipasang, halaman dimuat ulang tanpa kehilangan data');

  // ---- PIN
  await A.st('st.setPin(S.user.id, "1234")');
  await A.p.goto(base + '?uji=pin');
  await A.ready();
  await A.p.waitFor('document.body.classList.contains("locked") && document.querySelector(".pin-pad")', 10000);
  for (const d of '1239') await A.click(d, '.pin-pad button', true);
  await A.click('OK', '.pin-pad button', true);
  await A.p.waitFor('document.querySelector(".shake")');
  for (const d of '1234') await A.click(d, '.pin-pad button', true);
  await A.click('OK', '.pin-pad button', true);
  await A.p.waitFor('!document.body.classList.contains("locked")', 8000);
  ok('PIN: aplikasi terkunci saat dibuka, PIN salah ditolak, PIN benar membuka');

  // ---- mode gelap
  await A.st('(async () => { S.app.theme = "dark"; await st.saveApp(); window.__catatmakan.ctx.applyTheme(); window.__catatmakan.ctx.render(); return 1; })()');
  await A.click('Hari Ini', '.bottom-nav button');
  await A.shot('10-gelap');

  const errs = [...A.p.errors, ...B.p.errors];
  assert.deepEqual(errs, [], 'tidak ada galat JavaScript');
  const consoleErr = [...A.p.consoleMessages, ...B.p.consoleMessages].filter((m) => m.type === 'error');
  assert.deepEqual(consoleErr, []);
  ok('tanpa galat JavaScript di kedua HP');
} finally {
  await browser.close();
  await browser2.close();
  await srv.closeNow();
}
console.log('\nSemua pemeriksaan end-to-end lulus.');

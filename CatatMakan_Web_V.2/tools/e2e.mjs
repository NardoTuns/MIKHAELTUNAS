// Uji end-to-end di Chrome headless (layar HP) terhadap Code.gs 2.1 tiruan.
// Skenario: pemilik (data aplikasi Android) TERKUNCI di web; istri & anak mencatat lewat akun masing-masing.
// Pakai: node tools/e2e.mjs [folder-screenshot]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './serve.mjs';
import { makeEnv } from './gas-mock.mjs';
import { launchBrowser } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
const ok = (m) => console.log('✔ ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = ymd();

// ---- Spreadsheet milik pemilik: data dari aplikasi Android (pengguna utama, kolom user kosong)
const gas = makeEnv({}, { realTime: true, ai: true });
gas.setup();
gas.post({
  action: 'push', device: 'HP Android', user: '',
  food: [
    { id: 'own-1', date: TODAY, time: '07:00', meal: 'Sarapan', name: 'Roti bakar', portion: 1, kcal: 150, updatedAt: Date.now() },
    { id: 'own-2', date: TODAY, time: '12:30', meal: 'Makan Siang', name: 'Nasi pecel', portion: 1, kcal: 400, updatedAt: Date.now() },
  ],
  water: [{ date: TODAY, glasses: 4, updatedAt: Date.now() }],
  profile: { data: { name: 'Bapak', emoji: '🦁', settings: { targetKcal: 2000 } }, updatedAt: Date.now() },
});
const ownerRows = () => gas.sheets.get('Makanan').objects().filter((r) => r.user === '' && r.deleted === false);

let srv = createServer({ gas });
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
    text: () => p.eval('document.body.innerText'),
    async ready() { await p.waitFor('window.__catatmakan && window.__catatmakan.S.ready', 15000); },
    async idle() { await p.waitFor('!window.__catatmakan.S.sync.running', 20000); await sleep(150); },
    async shot(name) { if (shots) { await sleep(350); await p.screenshot(join(shots, name + '.png')); } },
    noDialog: () => p.waitFor('!document.querySelector(".scrim")', 8000),
    async openMenu(name) { await h.click('', 'button.user-chip'); await p.waitFor('document.querySelector(".sheet")'); await h.click(name, '.sheet .list-item'); await p.waitFor(`window.__catatmakan.S.user.name === ${JSON.stringify(name)}`); await h.noDialog(); },
  };
  return h;
}

/** Layar awal: URL → pilih anggota dari Spreadsheet (+ tambah baru) → Mulai. */
async function onboard(h, { pick = [], add = '' }) {
  await h.p.goto(base);
  await h.ready();
  await h.type('input[type=url]', GAS);
  await h.click('Lanjut', 'button', true);
  await h.p.waitFor('document.body.innerText.includes("Siapa yang memakai HP ini?")', 10000);
  assert.match(await h.text(), /🔒 Bapak/, 'akun pemilik tampil terkunci');
  for (const n of pick) await h.click(n, '.switch-row');
  if (add) await h.type('input[maxlength="30"]', add);
  await h.shot('00-pilih-anggota');
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
  await onboard(A, { add: 'Istri' });
  const istriSync = await A.st('S.user.syncId');
  assert.match(istriSync, /^istri-[a-z0-9]{4}$/);
  assert.equal(await A.st('S.user.name'), 'Istri');
  assert.equal(await A.st('st.isLocked()'), false);
  assert.deepEqual(await A.st('S.users.map((u) => u.name + (st.isLocked(u) ? "!" : ""))'), ['Bapak!', 'Istri']);
  assert.match(await A.st('S.sync.lastMsg'), /Berhasil/);
  await A.shot('01-hari-ini-istri');
  ok(`onboarding: URL → pilih anggota; pemilik "Bapak" terkunci, "Istri" (${istriSync}) dibuat & tersambung ke Code.gs 2.1`);

  // ---- catat makanan lewat formulir (saran lokal)
  await A.click('Catat makanan', '.fab');
  await A.p.waitFor('document.querySelector(".sheet")');
  await A.shot('02-form-catat');
  await A.type('.sheet input[aria-label="Nama makanan"]', 'nasi put');
  await A.click('Nasi putih', '.sheet .list-item');
  assert.equal(await A.p.eval('document.querySelector(".sheet input[aria-label=\\"kkal per porsi\\"]").value'), '195');
  await A.click('Simpan', '.sheet button', true);
  await A.noDialog();
  assert.equal(await A.st('st.foodsOn(S.date).length'), 1);
  ok('formulir: saran database bawaan mengisi kalori, makanan tersimpan untuk Istri');

  // ---- air & catat cepat
  for (let i = 0; i < 3; i++) { await A.click('+ 1 gelas'); await sleep(120); }
  assert.equal(await A.st('st.waterOn(S.date)'), 3);
  await A.type('input[aria-label="Catat cepat"]', '2 tempe goreng, teh tawar');
  await A.click('Catat', 'button', true);
  await A.p.waitFor('document.querySelector(".dialog")', 12000);
  assert.match(await A.p.eval('document.querySelector(".dialog").innerText'), /2 × Tempe goreng/);
  await A.click('Simpan', '.dialog button', true);
  await A.p.waitFor('window.__catatmakan.st.foodsOn(window.__catatmakan.S.date).length === 3');
  const tempe = await A.st('st.foodsOn(S.date).find((e) => e.name === "Tempe goreng")');
  assert.equal(tempe.portion, 2);
  assert.equal(tempe.kcal, 120);
  ok('air +3 gelas; catat cepat "2 tempe goreng, teh tawar" → 2 makanan dengan porsi & kalori benar');

  // ---- hapus & urungkan
  await A.click('Tempe goreng', '.list-item');
  await A.click('Hapus', '.sheet button');
  await A.noDialog();
  assert.equal(await A.st('st.foodsOn(S.date).length'), 2);
  await A.click('Urungkan', '.toast button');
  await A.p.waitFor('window.__catatmakan.st.foodsOn(window.__catatmakan.S.date).length === 3');
  ok('hapus makanan lalu "Urungkan" mengembalikannya');

  // ---- AI pencari kalori: kunci belum diisi → diberi tahu; setelah diisi → "Cek AI" & saran AI jalan
  srv.gas.setAi(false);
  await A.click('Catat makanan', '.fab');
  await A.type('.sheet input[aria-label="Nama makanan"]', 'rendang sapi');
  await A.p.waitFor('document.querySelector(".sheet") && document.querySelector(".sheet").innerText.includes("AI belum aktif di Spreadsheet")', 20000);
  await A.p.eval('document.querySelector(".scrim").click()');
  await A.noDialog();
  await A.click('Pengaturan', '.bottom-nav button');
  await A.p.waitFor('document.getElementById("ai-setup") && document.getElementById("ai-setup").innerText.includes("GEMINI_API_KEY belum diisi")');
  srv.gas.setAi(true); // pengguna mengisi GEMINI_API_KEY di Apps Script
  await A.click('Cek AI', '#ai-setup button');
  await A.p.waitFor('document.getElementById("ai-setup").innerText.includes("AI aktif!")', 20000);
  await A.click('Hari Ini', '.bottom-nav button');
  await A.click('Catat makanan', '.fab');
  await A.type('.sheet input[aria-label="Nama makanan"]', 'soto betawi');
  await A.p.waitFor('document.querySelector(".sheet").innerText.includes("Nasi kuning (AI)")', 20000);
  await A.p.eval('document.querySelector(".scrim").click()');
  await A.noDialog();
  ok('AI pencari kalori: tanpa kunci → pesan & panduan; setelah kunci diisi → "Cek AI" lulus & saran AI muncul');

  // ---- sinkron: hanya data Istri yang terkirim, data pemilik tidak tersentuh
  await A.click('', 'button[aria-label="Sinkron sekarang"]');
  await A.idle();
  const istriRows = gas.sheets.get('Makanan').objects().filter((r) => r.user === istriSync && r.deleted === false);
  assert.equal(istriRows.length, 3);
  assert.equal(ownerRows().length, 2, 'baris pemilik tetap 2, tidak bertambah dari web');
  assert.equal(gas.sheets.get('Air').objects().find((r) => r.user === istriSync).gelas, 3);
  assert.equal(gas.sheets.get('Air').objects().find((r) => r.user === '').gelas, 4, 'air pemilik tidak tertimpa');
  assert.equal(await A.st('S.sync.pending'), 0);
  ok('sinkron: 3 makanan & 3 gelas air Istri terkirim sebagai pengguna Istri; data pemilik utuh');

  // ---- akun pemilik: hanya dilihat
  await A.openMenu('Bapak');
  assert.equal(await A.st('st.isLocked()'), true);
  assert.equal(await A.st('st.allFoods().length'), 2, 'data Android pemilik tampil (hanya baca)');
  assert.equal(await A.st('st.waterOn(S.date)'), 4);
  await A.p.waitFor('document.body.innerText.includes("Halo, Bapak") && document.body.innerText.includes("hanya bisa dilihat")', 8000);
  assert.ok(!/\bnull\b/.test(await A.text()), 'tidak ada teks "null" nyasar di layar');
  assert.ok(await A.p.eval('(() => { const f = document.querySelector(".fab"); return !f || f.classList.contains("hidden") || !f.getClientRects().length; })()'), 'tombol catat tersembunyi');
  assert.equal(await A.p.eval('!!document.querySelector("input[aria-label=\\"Catat cepat\\"]")'), false, 'catat cepat tersembunyi');
  assert.equal(await A.p.eval('[...document.querySelectorAll("button")].some((b) => b.textContent.includes("+ 1 gelas") && b.getClientRects().length)'), false);
  const blockedErr = await A.st('(async () => { try { await st.saveFood({ date: S.date, time: "09:00", meal: "Camilan", name: "Curang", portion: 1, kcal: 10 }); return "tersimpan"; } catch (e) { return e.name; } })()');
  assert.equal(blockedErr, 'LockedError');
  assert.equal(await A.st('(async () => { try { await st.addWater(S.date, 1); return "tersimpan"; } catch (e) { return e.name; } })()'), 'LockedError');
  assert.equal(await A.st('st.allFoods().length'), 2);
  await A.shot('03-akun-terkunci');
  // makanan pemilik bisa dibuka tapi tidak bisa diubah/dihapus
  await A.click('Nasi pecel', '.list-item');
  await A.p.waitFor('document.querySelector(".dialog")');
  assert.match(await A.p.eval('document.querySelector(".dialog").innerText'), /Kalori per porsi[\s\S]*400/);
  assert.equal(await A.p.eval('[...document.querySelectorAll(".dialog button")].some((b) => ["Hapus", "Simpan"].includes(b.textContent.trim()))'), false);
  await A.p.eval('document.querySelector(".scrim").click()');
  await A.noDialog();
  // Pengaturan akun pemilik: tanpa target/profil, tanpa tombol ubah/hapus pemilik
  await A.click('Pengaturan', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Akun utama terkunci")');
  assert.equal(await A.p.eval('!!document.querySelector("button[aria-label=\\"Ubah Bapak\\"]") || !!document.querySelector("button[aria-label=\\"Hapus Bapak\\"]")'), false);
  await A.shot('04-pengaturan-terkunci');
  // server juga menolak push web atas pengguna utama
  const forced = gas.post({ action: 'push', device: 'Web', client: 'web', user: '', food: [{ id: 'bobol', date: TODAY, time: '10:00', meal: 'Camilan', name: 'Bobol', portion: 1, kcal: 1, updatedAt: Date.now() + 5000 }] });
  assert.equal(forced.locked, true);
  assert.equal(ownerRows().length, 2);
  await A.st('st.syncNow({ all: true })');
  await A.idle();
  assert.equal(ownerRows().length, 2);
  ok('akun pemilik "Bapak": data tampil, tidak bisa catat/ubah/hapus/air, server menolak push web, sinkron tidak mengubahnya');

  // ---- anggota ketiga (anak) + catat bersama
  await A.openMenu('Istri');
  await A.click('Pengaturan', '.bottom-nav button');
  await A.click('Tambah anggota');
  await A.p.waitFor('document.querySelector(".dialog")');
  await A.type('.dialog input[maxlength="30"]', 'Adik');
  const adikSync = await A.p.eval('document.querySelectorAll(".dialog input[type=text]")[1].value');
  assert.match(adikSync, /^adik-[a-z0-9]{4}$/);
  await A.click('Tambah', '.dialog button', true);
  await A.p.waitFor('window.__catatmakan.S.users.some((u) => u.name === "Adik")');
  await A.noDialog().catch(() => {});
  // profil anak 7 tahun → kebutuhan dari AKG 2019
  const adikId = await A.st('S.users.find((u) => u.name === "Adik").id');
  await A.st(`(async () => { await st.switchUser(${JSON.stringify(adikId)}); await st.saveSettings({ gender: "P", age: 7, heightCm: 120, weightKg: 22 }); await st.switchUser(S.users.find((u) => u.name === "Istri").id); return 1; })()`);
  await A.click('Hari Ini', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Siapa yang mencatat?")');
  // "Catat juga untuk": Istri & Adik makan bersama
  await A.click('Catat makanan', '.fab');
  await A.p.waitFor('document.querySelector(".sheet")');
  assert.match(await A.p.eval('document.querySelector(".sheet").innerText'), /Catat juga untuk/);
  assert.ok(!(await A.p.eval('document.querySelector(".sheet").innerText.includes("Bapak")')), 'pemilik terkunci tidak ditawarkan di "catat juga untuk"');
  await A.click('Adik', '.sheet .chip');
  await A.type('.sheet input[aria-label="Nama makanan"]', 'bubur ayam');
  await A.type('.sheet input[aria-label="kkal per porsi"]', '300');
  await A.click('Simpan', '.sheet button', true);
  await A.noDialog();
  const adikFoods = await A.st(`(async () => (await st.userBundle(S.users.find((u) => u.name === "Adik"))).foods.filter((e) => e.name.toLowerCase().includes("bubur")).length)()`);
  assert.equal(adikFoods, 1);
  assert.equal(await A.st('st.foodsOn(S.date).filter((e) => e.name.toLowerCase().includes("bubur")).length'), 1);
  await A.shot('05-ganti-pengguna');
  await A.st('st.syncNow({ all: true })');
  await A.idle();
  assert.equal(gas.sheets.get('Makanan').objects().filter((r) => r.user === adikSync && /bubur/i.test(r.nama)).length, 1);
  assert.equal(ownerRows().length, 2);
  ok(`anggota ketiga "Adik" (${adikSync}): "Catat juga untuk" mencatat bubur untuk Istri & Adik, data terpisah di Spreadsheet`);

  // ---- HP kedua (HP anak): pilih Istri & Adik dari daftar Spreadsheet
  const B = await phone(browser2);
  await onboard(B, { pick: ['Adik', 'Istri'] });
  assert.deepEqual((await B.st('S.users.map((u) => u.name)')).sort(), ['Adik', 'Bapak', 'Istri']);
  assert.equal(await B.st('S.user.name'), 'Adik', 'anggota pertama yang dipilih menjadi aktif');
  assert.equal(await B.st('st.allFoods().length'), 1);
  assert.equal(await B.st(`(async () => (await st.userBundle(S.users.find((u) => u.name === "Istri"))).foods.length)()`), 4);
  assert.equal(await B.st(`(async () => (await st.userBundle(S.users.find((u) => u.name === "Bapak"))).foods.length)()`), 2);
  assert.equal(await B.st('S.settings.age'), 7, 'profil anak ikut tertarik dari Spreadsheet');
  await B.shot('06-hp-kedua');
  ok('HP kedua: Istri, Adik (termasuk profil) & pemilik (hanya baca) tersinkron dari Spreadsheet');

  // ---- analisis, Rekap Gizi AI, laporan (Istri)
  await A.click('Analisis', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Skor diet")');
  await A.shot('07-analisis');
  await A.click('Gizi', '.chip', true);
  await A.p.waitFor('document.body.innerText.includes("Indeks Massa Tubuh")');
  await A.click('Rekap Gizi AI', '.chip', true);
  await A.click('Buat rekap gizi dengan AI');
  await A.p.waitFor('document.body.innerText.includes("Rekap tiruan") && document.body.innerText.includes("Serat")', 15000);
  assert.match(await A.text(), /Natrium/);
  await A.shot('08-rekap-gizi-ai');
  await A.click('Saran AI', '.chip', true);
  await A.click('Analisis dengan AI');
  await A.p.waitFor('document.body.innerText.includes("Penilaian AI: 72/100")', 15000);
  await A.click('Camilan sehat di bawah 150 kkal?', '.chip');
  await A.p.waitFor('document.body.innerText.includes("Jawaban AI tiruan")', 15000);
  await A.click('Laporan', '.chip', true);
  await A.p.waitFor('document.querySelector("pre.preview")');
  assert.match(await A.p.eval('document.querySelector("pre.preview").textContent'), /Laporan Diet Mingguan[\s\S]*Analisis AI/);
  await A.click('Bagikan PDF');
  await A.p.waitFor('window.jspdf && !document.body.innerText.includes("Membuat…")', 15000);
  const pdfSize = await A.p.eval(`(async () => { const m = await import('./js/core/report.js'); const a = await import('./js/ui/analysis.js'); const ctx = window.__catatmakan.ctx; const blob = m.reportPdf(window.jspdf.jsPDF, a.currentReport(ctx), null, 'Istri'); const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5)); return [blob.size, head]; })()`);
  assert.equal(pdfSize[1], '%PDF-');
  assert.ok(pdfSize[0] > 3000);
  ok(`analisis Istri: skor, gizi, Rekap Gizi AI (zat gizi vs AKG), Analisis & Tanya AI, laporan teks & PDF (${Math.round(pdfSize[0] / 1024)} KB)`);

  // ---- rekap keluarga + menu keluarga AI
  await A.click('Keluarga', 'button');
  await A.p.waitFor('document.querySelector(".sheet") && document.querySelector(".sheet").innerText.includes("Rekap keluarga")');
  await A.p.waitFor('document.querySelector(".sheet").innerText.includes("Adik") && document.querySelector(".sheet").innerText.includes("Bapak")', 10000);
  await A.click('Harian', '.sheet .seg button', true);
  await A.p.waitFor('document.querySelector(".sheet").innerText.includes("Istri")', 10000);
  await A.click('Buat menu keluarga', '.sheet button');
  await A.p.waitFor('document.querySelector(".sheet").innerText.includes("Sop ayam") && document.querySelector(".sheet").innerText.includes("Ayam")', 15000);
  assert.match(await A.p.eval('document.querySelector(".sheet").innerText'), /Daftar belanja/);
  await A.click('Wortel', '.sheet label.shop');
  assert.ok(await A.p.eval('[...document.querySelectorAll(".sheet label.shop")].some((l) => l.classList.contains("done"))'));
  await A.shot('09-rekap-keluarga');
  await A.p.eval('document.querySelector(".scrim").click()');
  await A.noDialog();
  ok('rekap keluarga: kartu semua anggota (pemilik 🔒), menu keluarga AI dengan pembagian porsi & daftar belanja yang bisa dicentang');

  // ---- gizi anak (Adik) memakai AKG 2019
  await A.openMenu('Adik');
  await A.click('Analisis', '.bottom-nav button');
  await A.click('Ringkasan', '.chip', true);
  await A.p.waitFor('document.body.innerText.includes("Skor diet")');
  await A.click('Gizi', '.chip', true);
  await A.p.waitFor('document.body.innerText.includes("AKG")', 8000);
  assert.ok(!(await A.text()).includes('Obesitas'), 'IMT anak tidak dinilai dengan kategori dewasa');
  const child = await A.st('(async () => { const n = await import("./js/core/nutrition.js"); const x = n.needs(n.withDefaults(S.settings), 22); return { child: x.child, tdee: x.tdee, kcal: x.akg && x.akg.kcal }; })()');
  assert.equal(child.child, true);
  assert.equal(child.kcal, 1650);
  await A.shot('10-gizi-anak');
  ok('gizi anak: Adik (7 th) memakai AKG 2019 (1650 kkal), tanpa target turun berat');

  // ---- progres & berat (Istri)
  await A.openMenu('Istri');
  await A.click('Progres', '.bottom-nav button');
  await A.p.waitFor('document.body.innerText.includes("Kalender catatan") && document.body.innerText.includes("Pencapaian")');
  await A.type('input[aria-label="Berat hari ini (kg)"]', '62,5');
  await A.click('Simpan', 'button', true);
  await A.p.waitFor('window.__catatmakan.st.weights().length === 1');
  await A.shot('11-progres');
  await A.click('Pengaturan', '.bottom-nav button');
  await A.shot('12-pengaturan');
  ok('progres: grafik, berat badan, kalender, lencana; pengaturan tampil');

  // ---- offline: server mati → aplikasi tetap terbuka dari cache, data tetap ada
  await A.p.waitFor('navigator.serviceWorker.controller', 15000);
  await srv.closeNow();
  await A.p.goto(base + '?uji=offline#/hari-ini');
  await A.ready();
  await A.p.waitFor('document.querySelector(".bottom-nav")', 10000);
  assert.equal(await A.st('S.user.name'), 'Istri');
  const before = await A.st('st.allFoods().length');
  await A.st('st.saveFood({ date: S.date, time: "15:00", meal: "Camilan", name: "Pisang", portion: 1, kcal: 90 })');
  await A.st('st.syncNow()');
  await A.idle();
  assert.match(await A.st('S.sync.lastMsg'), /Gagal/);
  assert.equal(await A.st('st.allFoods().length'), before + 1);
  assert.ok(await A.st('S.sync.pending') > 0);
  await A.shot('13-offline');
  ok('offline: aplikasi terbuka dari cache, catatan baru tersimpan di HP, sinkron gagal dengan aman');

  // ---- internet kembali → terkirim; data lama tetap di HP
  srv = createServer({ gas });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  await A.st('st.syncNow()');
  await A.idle();
  assert.match(await A.st('S.sync.lastMsg'), /Berhasil/);
  assert.equal(gas.sheets.get('Makanan').objects().filter((r) => r.user === istriSync && r.deleted === false).length, before + 1);
  assert.equal(ownerRows().length, 2);
  assert.equal(await A.st('S.sync.pending'), 0);
  ok('online lagi: catatan offline terkirim; semua data yang sudah tersinkron tetap tersimpan di HP');

  // ---- tombol Update: simulasikan rilis 2.1.1
  const rep = (f, a, b) => readFileSync(join(root, f), 'utf8').replace(a, b);
  srv.overrides.set('version.json', JSON.stringify({ version: '2.1.1', date: '2026-11-03', changes: ['Perbaikan kecil (uji)'] }));
  srv.overrides.set('js/config.js', rep('js/config.js', /APP_VERSION = '[^']+'/, "APP_VERSION = '2.1.1'"));
  srv.overrides.set('sw.js', rep('sw.js', /const CACHE = '[^']+'/, "const CACHE = 'catatmakan-2.1.1-uji'"));
  await A.click('', 'button[aria-label="Cek update"]');
  await A.p.waitFor('document.querySelector(".dialog") && document.querySelector(".dialog").innerText.includes("2.1.1")', 20000);
  await A.click('Perbarui sekarang', '.dialog button');
  await sleep(1500);
  await A.ready();
  await A.p.waitFor('window.__catatmakan && document.querySelector(".bottom-nav")', 15000);
  assert.equal(await A.p.eval(`import('./js/config.js').then((m) => m.APP_VERSION)`), '2.1.1');
  assert.equal(await A.st('st.allFoods().length'), before + 1);
  ok('tombol Update: versi 2.1.1 terdeteksi, dipasang, halaman dimuat ulang tanpa kehilangan data');

  // ---- PIN untuk akun Istri
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
  ok('PIN: akun Istri terkunci saat dibuka, PIN salah ditolak, PIN benar membuka');

  // ---- mode gelap
  await A.st('(async () => { S.app.theme = "dark"; await st.saveApp(); window.__catatmakan.ctx.applyTheme(); window.__catatmakan.ctx.render(); return 1; })()');
  await A.click('Hari Ini', '.bottom-nav button');
  await A.shot('14-gelap');

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

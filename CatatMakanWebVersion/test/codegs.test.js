// Uji Code.gs 2.0 dengan tiruan SpreadsheetApp (tanpa Google). Jalankan: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from '../tools/gas-mock.mjs';


// Sheet lama dari aplikasi Android v1.2 (16 kolom, tanpa "user"), satu tanggal tersimpan sebagai Date oleh Sheets.
const OLD_FOOD_HEAD = ['id', 'tanggal', 'jam', 'waktu_makan', 'nama', 'porsi', 'kkal_per_porsi', 'total_kkal', 'protein_g', 'karbo_g', 'lemak_g', 'catatan', 'updatedAt', 'deleted', 'serverTime', 'device'];
const legacy = () => ({
  Makanan: [OLD_FOOD_HEAD, ['a1', { ymd: [2026, 10, 20] }, '07:00', 'Sarapan', 'Roti', 1, 70, 70, 2, 13, 1, '', 50, false, 500, 'HP Android']],
  Air: [['tanggal', 'gelas', 'updatedAt', 'serverTime', 'device'], ['2026-10-20', 5, 60, 500, 'HP Android']],
  Berat: [['tanggal', 'kg', 'updatedAt', 'deleted', 'serverTime', 'device', 'catatan_saya'], ['2026-10-19', 64, 70, false, 500, 'HP Android', 'pagi']],
});

test('ping versi 2.0 dengan fitur multi pengguna', () => {
  const e = makeEnv();
  const p = e.get({ action: 'ping' });
  assert.equal(p.version, '2.0');
  for (const f of ['users', 'profile', 'off', 'analyze', 'ask']) assert.ok(p.features.includes(f), f);
});

test('migrasi sheet 1.2: kolom user ditambah, data lama = pengguna utama, kolom buatan sendiri tetap', () => {
  const e = makeEnv(legacy());
  e.setup();
  assert.equal(e.sheets.get('Makanan').rows[0][16], 'user');
  assert.ok(e.sheets.get('Profil'));
  assert.ok(String(e.sheets.get('Ringkasan').rows[0][0]).startsWith('=QUERY(Makanan!A:Q,"select Q, B, sum(H), count(A)'));
  // aplikasi Android (tanpa parameter user) tetap membaca datanya
  const pull = e.get({ action: 'pull', since: '0' });
  assert.equal(pull.food.length, 1);
  assert.equal(pull.food[0].date, '2026-10-20'); // Date → teks
  assert.equal(pull.water[0].glasses, 5);
  assert.equal(pull.weight[0].kg, 64);
  // Android memperbarui berat → kolom "catatan_saya" tidak hilang
  e.tick();
  e.post({ action: 'push', device: 'HP Android', weight: [{ date: '2026-10-19', kg: 63.5, updatedAt: 90, deleted: false }] });
  const berat = e.sheets.get('Berat');
  assert.equal(berat.rows.length, 2);
  assert.equal(berat.rows[1][1], 63.5);
  assert.equal(berat.rows[1][6], 'pagi');
});

test('banyak pengguna: data air & berat per pengguna tidak saling menimpa', () => {
  const e = makeEnv(legacy());
  e.tick();
  e.post({ action: 'push', device: 'Web', user: 'ani-1a2b', water: [{ date: '2026-10-20', glasses: 8, updatedAt: 100 }],
    food: [{ id: 'w1', date: '2026-10-20', time: '12:00', meal: 'Makan Siang', name: 'Soto', portion: 1, kcal: 250, updatedAt: 100 }] });
  const air = e.sheets.get('Air').rows;
  assert.equal(air.length, 3, 'baris air pengguna utama tidak tertimpa');
  const ani = e.get({ action: 'pull', since: '0', user: 'ani-1a2b' });
  assert.deepEqual(ani.water.map((w) => w.glasses), [8]);
  assert.deepEqual(ani.food.map((f) => f.name), ['Soto']);
  const utama = e.get({ action: 'pull', since: '0' });
  assert.deepEqual(utama.water.map((w) => w.glasses), [5]);
  assert.deepEqual(utama.food.map((f) => f.name), ['Roti']);
  const utama2 = e.get({ action: 'pull', since: '0', user: '' });
  assert.equal(utama2.food.length, 1);
});

test('perubahan terbaru menang; tarikan bertahap sejak serverTime', () => {
  const e = makeEnv();
  e.tick();
  e.post({ action: 'push', user: 'budi', food: [{ id: 'x', date: '2026-10-21', time: '07:00', meal: 'Sarapan', name: 'Nasi', portion: 1, kcal: 195, updatedAt: 200 }] });
  const t1 = e.get({ action: 'pull', since: '0', user: 'budi' }).serverTime;
  e.tick();
  e.post({ action: 'push', user: 'budi', food: [{ id: 'x', date: '2026-10-21', time: '07:00', meal: 'Sarapan', name: 'Nasi lama', portion: 1, kcal: 195, updatedAt: 150 }] });
  assert.equal(e.get({ action: 'pull', since: '0', user: 'budi' }).food[0].name, 'Nasi');
  e.tick();
  e.post({ action: 'push', user: 'budi', food: [{ id: 'x', date: '2026-10-21', time: '07:00', meal: 'Sarapan', name: 'Nasi merah', portion: 1, kcal: 170, updatedAt: 300, deleted: false }] });
  const inc = e.get({ action: 'pull', since: String(t1), user: 'budi' });
  assert.deepEqual(inc.food.map((f) => [f.name, f.kcal]), [['Nasi merah', 170]]);
  assert.equal(e.sheets.get('Makanan').rows.length, 2);
});

test('profil pengguna tersinkron', () => {
  const e = makeEnv();
  e.tick();
  e.post({ action: 'push', user: 'ani-1a2b', profile: { data: { name: 'Ani', settings: { targetKcal: 1600 } }, updatedAt: 500 } });
  const p = e.get({ action: 'pull', since: '0', user: 'ani-1a2b' });
  assert.equal(JSON.parse(p.profile.data).settings.targetKcal, 1600);
  assert.equal(p.profile.updatedAt, 500);
  assert.equal(e.sheets.get('Profil').rows[1][1], 'Ani');
  assert.equal(e.get({ action: 'pull', since: '0', user: 'lain' }).profile, null);
});

test('proksi Open Food Facts', () => {
  const e = makeEnv();
  const r = e.get({ action: 'off', q: 'indomie' });
  assert.equal(r.ok, true);
  assert.equal(r.hits[0].product_name, 'Indomie Goreng');
});

test('AI: saran kalori, analisis (tercatat di sheet Analisis AI per pengguna), tanya jawab', () => {
  const e = makeEnv({}, { ai: true });
  assert.equal(e.get({ action: 'ping' }).ai, true);
  assert.equal(e.get({ action: 'estimate', q: 'nasi kuning' }).items[0].kcal, 380);
  const a = e.post({ action: 'analyze', user: 'ani-1a2b', device: 'Web', summary: { periode: 'Mingguan', hasil: { skor_aplikasi: 60 } } });
  assert.equal(a.analysis.skor, 72);
  const log = e.sheets.get('Analisis AI').objects();
  assert.equal(log[0].user, 'ani-1a2b');
  assert.equal(log[0].skor_aplikasi, 60);
  assert.match(e.post({ action: 'ask', question: 'Camilan sehat?', summary: {} }).answer, /yogurt/);
});

test('Code.gs 1.2 asli (aplikasi Android) tetap jalan dengan tiruan yang sama', () => {
  const e = makeEnv({}, { code: new URL('../../CatatMakan/apps-script/Code.gs', import.meta.url) });
  assert.equal(e.get({ action: 'ping' }).version, '1.2');
  e.tick();
  e.post({ action: 'push', device: 'Web', user: 'diabaikan', food: [{ id: 'z', date: '2026-10-22', time: '08:00', meal: 'Sarapan', name: 'Roti', portion: 1, kcal: 70, updatedAt: 5 }] });
  assert.equal(e.get({ action: 'pull', since: '0' }).food[0].name, 'Roti');
});

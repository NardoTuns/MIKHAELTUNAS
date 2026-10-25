// Tes logika inti (port AnalysisTest.kt Android + fitur baru). Jalankan: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, today, addDays, isoDow, fmt, dec, signed, num, epochDay, fromEpochDay } from '../js/core/util.js';
import { Period } from '../js/core/period.js';
import { needs, bmiOf, withDefaults, calcTarget } from '../js/core/nutrition.js';
import { buildReport, scoreLabel } from '../js/core/analyzer.js';
import { reportText, reportCsv, dayShareText, pdfSafe } from '../js/core/report.js';
import { summary, parseAnalysis } from '../js/core/aicoach.js';
import { splitQuick, matchLocal } from '../js/core/quicklog.js';
import { frequent, streak, longestStreak, loggedDates, badges } from '../js/core/stats.js';
import { dueReminders, buildIcs, fold } from '../js/core/reminders.js';

// Jam tetap: Sabtu 24 Okt 2026 13:00 (deterministik)
clock.now = () => new Date(2026, 9, 24, 13, 0, 0);

const profile = withDefaults({ name: 'Ani', targetKcal: 1600, targetWater: 8, gender: 'W', age: 32, heightCm: 158, activity: 1, goal: 1, targetWeight: 58 });
let seq = 0;
const food = (date, meal, name, kcal, { time = '12:00', portion = 1, p = 10, c = 30, f = 8 } = {}) =>
  ({ id: 'f' + ++seq, date, time, meal, name, kcal, portion, protein: p, carbs: c, fat: f, note: '', updatedAt: seq, deleted: false });

test('format angka & tanggal gaya Indonesia', () => {
  assert.equal(fmt(1234.6), '1.235');
  assert.equal(fmt(-50), '-50');
  assert.equal(dec(1.25, 1), '1,3');
  assert.equal(dec(1234.5), '1.234,5');
  assert.equal(signed(-1.2), '−1,2');
  assert.equal(signed(0.4), '+0,4');
  assert.equal(num(1.5), '1.5');
  assert.equal(num(2), '2');
  assert.equal(isoDow('2026-10-19'), 1);
  assert.equal(isoDow('2026-10-25'), 7);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(fromEpochDay(epochDay('2026-12-31') + 1), '2027-01-01');
});

test('periode: minggu mulai Senin, batas bulan, kunci', () => {
  const w = Period.of('W', '2026-10-21');
  assert.equal(w.start, '2026-10-19');
  assert.equal(w.end, '2026-10-25');
  const m = Period.of('M', '2024-02-10');
  assert.equal(m.totalDays, 29);
  assert.ok(Period.fromKey(w.key).equals(w));
  assert.equal(m.shift(1).start, '2024-03-01');
  assert.equal(Period.fromKey('X:rusak'), null);
  const cur = Period.of('M', today());
  assert.equal(cur.elapsedDays, 24);
  assert.equal(cur.canGoNext(), false);
  assert.equal(cur.shift(-1).canGoNext(), true);
  assert.equal(Period.of('W', addDays(today(), -7)).title(), 'Minggu lalu');
});

test('gizi: Mifflin, IMT Asia-Pasifik, profil kosong aman', () => {
  const n = needs(profile, 64);
  assert.ok(n.profileComplete);
  assert.ok(Math.abs(n.bmr - 1306.5) < 0.01);
  assert.ok(Math.abs(n.tdee - 1306.5 * 1.375) < 0.01);
  assert.ok(n.recommendedKcal >= 1200);
  assert.ok(Math.abs(n.proteinG - 64 * 1.2) < 0.01);
  assert.equal(bmiOf(64, 158).category, 'Obesitas I');
  assert.equal(bmiOf(60, 158).category, 'Berlebih (berisiko)');
  assert.equal(bmiOf(55, 165).category, 'Normal');
  assert.equal(bmiOf(60, 0), null);
  const empty = needs(withDefaults({}), null);
  assert.equal(empty.profileComplete, false);
  assert.equal(empty.tdee, null);
  assert.ok(empty.proteinG > 0 && empty.carbsG > 0 && empty.fatG > 0);
  assert.deepEqual(calcTarget({ gender: 'W', age: 32, heightCm: 158, weightKg: 64, activity: 1, goal: 1 }).target, 1550);
  assert.equal(calcTarget({ gender: 'W', age: 15, heightCm: 158, weightKg: 64, activity: 1, goal: 1 }), null);
});

test('periode kosong: saran membantu tanpa galat', () => {
  const p = Period.of('W', addDays(today(), -14));
  const r = buildReport(p, [], [], [], withDefaults({}));
  assert.equal(r.hasData, false);
  assert.equal(r.score, 0);
  assert.ok(r.tips.some((t) => t.title === 'Belum ada catatan'));
  assert.match(reportText(r, null), /Belum ada makanan/);
  JSON.parse(JSON.stringify(summary(r)));
});

test('minggu lalu: rata-rata, target, saran tukar (sama dengan Android)', () => {
  const p = Period.of('W', addDays(today(), -7));
  const foods = [];
  p.days().forEach((d, i) => {
    if (i === 6) return;
    foods.push(food(d, 'Makan Siang', 'Nasi putih', 195, { portion: 2, p: 4, c: 43, f: 0.4 }));
    foods.push(food(d, 'Camilan', 'Bakwan goreng', 140, { portion: 3, p: 2, c: 13, f: 9, time: '21:30' }));
    foods.push(food(d, 'Makan Malam', 'Ayam goreng', 250, { portion: 2, p: 20, c: 6, f: 16 }));
  });
  const water = p.days().map((d) => ({ date: d, glasses: 4 }));
  const weights = [{ date: addDays(p.start, -1), kg: 65 }, { date: p.end, kg: 65.5 }];
  const r = buildReport(p, foods, water, weights, profile);
  assert.equal(r.statDays.length, 6);
  assert.equal(r.todayExcluded, false);
  assert.ok(Math.abs(r.avgKcal - (195 * 2 + 140 * 3 + 250 * 2)) < 0.01);
  assert.equal(r.onTargetDays, 6);
  assert.equal(r.overDays, 0);
  assert.equal(r.breakfastDays, 0);
  assert.equal(r.lateDays, 6);
  assert.ok(Math.abs(r.weightChange - 0.5) < 0.001);
  assert.ok(r.score >= 0 && r.score <= 100);
  const imp = r.improve.map((i) => i.title);
  for (const t of ['Kurang minum air', 'Sering melewatkan sarapan', 'Makan larut malam', 'Protein kurang', 'Camilan cukup banyak', 'Berat naik']) assert.ok(imp.includes(t), t);
  assert.equal(r.topByKcal[0].name, 'Ayam goreng');
  assert.deepEqual(r.tips.filter((t) => t.title.startsWith('Tukar')).map((t) => t.title), ['Tukar: Ayam goreng', 'Tukar: Nasi putih']);
  assert.ok(r.kgPerWeek != null);
  const text = reportText(r, null);
  assert.match(text, /Laporan Diet Mingguan/);
  assert.match(text, /Perlu diperbaiki/);
  const js = summary(r);
  assert.equal(js.per_hari.length, 7);
  assert.ok('rata_kkal_per_hari' in js.hasil);
  const csv = reportCsv(r);
  assert.ok(csv.startsWith('﻿tanggal,jam'));
  assert.equal(csv.split('\n').filter((l) => l.includes('Ayam goreng')).length, 6);
});

test('minggu ini tidak menghitung hari ini yang belum selesai', () => {
  const t = today();
  assert.notEqual(isoDow(t), 1);
  const p = Period.of('W', t);
  const r = buildReport(p, [food(addDays(t, -1), 'Makan Siang', 'Gado-gado', 1500), food(t, 'Sarapan', 'Roti', 200)], [], [], profile);
  assert.equal(r.todayExcluded, true);
  assert.equal(r.statDays.length, 1);
  assert.equal(r.avgKcal, 1500);
});

test('hari ini sementara: sisa kalori & ide menu; ringkasan malam', () => {
  const t = today();
  const p = Period.of('D', t);
  const r = buildReport(p, [food(t, 'Sarapan', 'Oatmeal', 300, { time: '07:00' })], [], [], profile);
  assert.equal(r.partial, true);
  assert.equal(r.remainingToday, 1300);
  assert.ok(r.menuIdeas.reduce((a, i) => a + i.kcal, 0) <= 1300 * 1.1);
  const fin = buildReport(p, r.foods, [], [], profile, { dayFinished: true });
  assert.equal(fin.partial, false);
  assert.ok(fin.improve.some((i) => i.title === 'Asupan terlalu rendah'));
  assert.equal(scoreLabel(fin).length > 0, true);
  assert.match(dayShareText(t, r.foods, 3, profile), /Total: 300 \/ 1.600 kkal/);
});

test('catat cepat: porsi, satuan, pemisah', () => {
  const items = splitQuick('2 potong tempe goreng, nasi dan teh manis + 1/2 piring capcay; setengah mangkuk bakso');
  assert.deepEqual(items, [
    { portion: 2, name: 'Tempe goreng' }, { portion: 1, name: 'Nasi' }, { portion: 1, name: 'Teh manis' },
    { portion: 0.5, name: 'Capcay' }, { portion: 0.5, name: 'Bakso' },
  ]);
  assert.deepEqual(splitQuick('2x telur'), [{ portion: 2, name: 'Telur' }]);
  assert.deepEqual(splitQuick('sepiring nasi goreng'), [{ portion: 1, name: 'Nasi goreng' }]);
  assert.deepEqual(splitQuick('jus'), [{ portion: 1, name: 'Jus' }]);
  assert.deepEqual(splitQuick(' , ; '), []);
  const m = matchLocal(splitQuick('tempe goreng, makanan aneh xyz'), [{ name: 'Tempe Goreng', kcal: 130, protein: 6, carbs: 5, fat: 9 }]);
  assert.equal(m[0].ref.kcal, 130);
  assert.equal(m[1].ref, null);
  assert.equal(matchLocal(splitQuick('teh tawar'), [])[0].ref.kcal, 2);
});

test('hasil AI dibaca & dibersihkan', () => {
  const a = parseAnalysis({
    ringkasan: '**Bagus** sekali', skor: 81, poin_baik: ['a', 'b'], perlu_perbaikan: ['c'],
    rekomendasi: [{ judul: 'Kurangi gula', detail: 'Teh tawar' }, 'teks lepas'],
    menu_besok: [{ waktu: 'Sarapan', menu: 'Oatmeal', kkal: 310.4 }, { waktu: 'x', menu: '' }], motivasi: 'Semangat',
  }, 5, 9);
  assert.equal(a.summary, 'Bagus sekali');
  assert.equal(a.score, 81);
  assert.equal(a.recs.length, 2);
  assert.deepEqual(a.recs[1], { judul: '', detail: 'teks lepas' });
  assert.equal(a.menu.length, 1);
  assert.equal(a.menu[0].kcal, 310);
  assert.equal(parseAnalysis({ skor: 150 }).score, null);
});

test('statistik: favorit, beruntun, lencana', () => {
  const t = today();
  const foods = [
    food(t, 'Sarapan', 'Telur rebus', 75), food(addDays(t, -1), 'Sarapan', 'telur rebus', 80),
    food(addDays(t, -2), 'Makan Siang', 'Soto', 300), food(addDays(t, -4), 'Makan Siang', 'Soto', 300),
  ];
  const fr = frequent(foods);
  assert.equal(fr[0].name, 'Soto'); // sama-sama 2x → yang terakhir dipakai lebih dulu
  const telur = fr.find((x) => x.name.toLowerCase() === 'telur rebus');
  assert.equal(telur.cnt, 2);
  assert.equal(telur.kcal, 80); // nilai dari catatan terbaru
  const d = loggedDates(foods);
  assert.equal(streak(d), 3);
  assert.equal(longestStreak(d), 3);
  const b = badges({ foods, waters: [], weights: [], settings: profile });
  assert.equal(b.find((x) => x.id === 'first').done, true);
  assert.equal(b.find((x) => x.id === 'streak3').done, true);
  assert.equal(b.find((x) => x.id === 'streak7').done, false);
  assert.equal(b.find((x) => x.id === 'streak7').progress, 3);
});

test('pengingat dalam aplikasi: jatuh tempo sekali, tidak bila sudah dicatat', () => {
  const base = { date: '2026-10-26', settings: profile, mealsLogged: new Set(), water: 2, hasWeightToday: false, fired: new Set(), totalKcal: 500 };
  const at = (h, m = 0, extra = {}) => dueReminders({ ...base, minutes: h * 60 + m, ...extra }).map((r) => r.key);
  assert.ok(at(7, 5).includes('meal:Sarapan:2026-10-26'));
  assert.ok(at(7, 5).includes('weight:2026-10-26')); // Senin
  assert.equal(at(7, 5, { mealsLogged: new Set(['Sarapan']) }).includes('meal:Sarapan:2026-10-26'), false);
  assert.equal(at(7, 5, { fired: new Set(['meal:Sarapan:2026-10-26']) }).includes('meal:Sarapan:2026-10-26'), false);
  assert.ok(at(10, 1).includes('water:2026-10-26:1'));
  assert.equal(at(10, 1, { water: 8 }).some((k) => k.startsWith('water')), false);
  assert.ok(at(20, 40).includes('summary:2026-10-26'));
  assert.ok(at(9).includes('weekly:2026-10-26'));
});

test('file kalender .ics valid & dilipat aman', () => {
  const ics = buildIcs(profile, { startDate: '2026-10-25', userName: 'Ani', appUrl: 'https://contoh.github.io/catatmakan/' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3 + 6 + 1 + 1 + 1); // makan 3, air tiap 2 jam 10..20 (6), ringkasan, timbang, laporan
  assert.match(ics, /DTSTART:20261025T070000/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const long = fold('DESCRIPTION:' + '🍳'.repeat(40));
  assert.ok(!long.includes('�'));
  assert.equal(long.replace(/\r\n /g, ''), 'DESCRIPTION:' + '🍳'.repeat(40));
});

test('teks PDF aman untuk font standar', () => {
  assert.equal(pdfSafe('🔥 Kalori ½ porsi → −2'), 'Kalori 1/2 porsi -> -2');
});

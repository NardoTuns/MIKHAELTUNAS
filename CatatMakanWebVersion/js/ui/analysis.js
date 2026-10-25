// Tab "Analisis": Ringkasan · Gizi · Saran AI · Laporan (port AnalysisScreen.kt).
import { h, icon, iconBtn, toast, clear, shareText, shareFile, downloadBlob } from './dom.js';
import { ring, hbar, stackedBar, barChart, bmiGauge } from './charts.js';
import { S, settings, foodsBetween, watersBetween, weights, saveSettings, getAi, putAi, scriptUrlFor, device } from '../state.js';
import { MEALS, mealEmoji } from '../core/fooddb.js';
import { Period } from '../core/period.js';
import { buildReport, scoreLabel } from '../core/analyzer.js';
import { ACTIVITY, GOALS, MEAL_SHARE, GLASS_ML, bmiOf } from '../core/nutrition.js';
import { summary, signature, parseAnalysis } from '../core/aicoach.js';
import { reportText, reportCsv, reportPdf, fileTag } from '../core/report.js';
import { fmt, dec, signed, today, addDays, shortDate, fmtDate, fmtDateTime, dayShort, toNum, numOnly } from '../core/util.js';
import * as online from '../core/online.js';
import { openCalculator } from './calc.js';
import { loadScript } from './foodform.js';

const TABS = [['ringkasan', 'Ringkasan'], ['gizi', 'Gizi'], ['ai', 'Saran AI'], ['laporan', 'Laporan']];
const scoreColor = (v) => (v >= 70 ? 'var(--primary)' : v >= 50 ? 'var(--carb)' : 'var(--over)');
const bmiColor = (lvl) => ['var(--water)', 'var(--primary)', 'var(--carb)', 'var(--over)', 'var(--danger)'][lvl];

export function currentReport(ctx) {
  const p = ctx.period;
  return buildReport(p, foodsBetween(p.start, p.end), watersBetween(p.start, p.end), weights(), settings());
}

export function renderAnalysis(root, ctx) {
  ctx.period ||= Period.of('W', today());
  ctx.aTab ||= 'ringkasan';
  const p = ctx.period;
  const r = currentReport(ctx);

  // ---- kepala periode
  const dateIn = h('input', { type: 'date', value: p.effectiveEnd, max: today(), style: { position: 'absolute', opacity: 0, width: '1px', height: '1px', pointerEvents: 'none' } });
  dateIn.addEventListener('change', () => { if (dateIn.value) { ctx.period = Period.of(p.type, dateIn.value > today() ? today() : dateIn.value); ctx.render(); } });
  const setType = (t) => { if (p.type !== t) { ctx.period = Period.of(t, p.effectiveEnd); ctx.render(); } };
  root.append(h('h2', { text: 'Analisis' }),
    h('div', { class: 'seg' }, ...[['D', 'Harian'], ['W', 'Mingguan'], ['M', 'Bulanan']].map(([t, l]) => h('button', { class: p.type === t ? 'on' : '', text: l, onclick: () => setType(t) }))),
    h('div', { class: 'row' },
      iconBtn('left', 'Periode sebelumnya', () => { ctx.period = p.shift(-1); ctx.render(); }),
      h('button', { class: 'grow center', style: { border: 0, background: 'none', cursor: 'pointer', position: 'relative' }, onclick: () => { try { dateIn.showPicker(); } catch { dateIn.click(); } } },
        h('div', { class: 'bold', text: p.title() }), h('div', { class: 'small muted', text: p.rangeText() }), dateIn),
      iconBtn('right', 'Periode berikutnya', () => { const n = p.shift(1); if (n.start <= today()) { ctx.period = n; ctx.render(); } }, { disabled: !p.canGoNext() })),
    h('div', { class: 'scroll-x' }, ...TABS.map(([k, l]) => h('button', { class: 'chip' + (ctx.aTab === k ? ' on' : ''), text: l, onclick: () => { ctx.aTab = k; ctx.render(); } }))));

  if (ctx.aTab === 'gizi') nutritionTab(root, r, ctx);
  else if (ctx.aTab === 'ai') aiTab(root, r, ctx);
  else if (ctx.aTab === 'laporan') reportTab(root, r, ctx);
  else overviewTab(root, r);
}

// ======================================================================= Ringkasan
const section = (title, ...kids) => h('div', { class: 'card col', style: { gap: '8px' } }, h('h3', { style: { margin: 0 }, text: title }), ...kids);
const kv = (k, v, sub) => h('div', { class: 'kv' }, h('div', { class: 'k' }, k, sub ? h('small', { text: sub }) : null), h('div', { class: 'v', text: v }));
const insightEl = (i) => h('div', { class: 'insight ' + i.tone }, h('div', { class: 'e', text: i.emoji }), h('div', {}, h('div', { class: 'tt', text: i.title }), h('div', { class: 'tx', text: i.text })));
const insightSection = (title, items) => (items.length ? h('div', { class: 'card' }, h('h3', { style: { margin: 0 }, text: title }), ...items.map(insightEl)) : null);
const tile = (e, v, l) => h('div', { class: 'tile' }, h('div', { class: 'e', text: e }), h('div', { class: 'v', text: v }), h('div', { class: 'l', text: l }));

function nutrientRow(label, actual, target, unit, color, caption) {
  const ratio = target > 0 ? actual / target : 0;
  return h('div', { class: 'col', style: { gap: '3px' } },
    h('div', { class: 'row' }, h('i', { class: 'dotc', style: { background: color } }), h('span', { class: 'grow', text: label }), h('b', { class: 'small', text: `${fmt(actual)} / ${fmt(target)} ${unit}` })),
    hbar(ratio, ratio > 1.15 ? 'var(--over)' : color),
    caption ? h('div', { class: 'tiny muted', text: caption }) : null);
}

function scoreCard(r) {
  const color = scoreColor(r.score);
  const parts = h('div', { class: 'col hidden', style: { gap: '8px' } }, ...r.scoreParts.map((pt) => h('div', { class: 'col', style: { gap: '3px' } },
    h('div', { class: 'row small' }, h('span', { class: 'grow', text: pt.label }), h('b', { text: `${Math.round(pt.got)} / ${pt.max}` })), hbar(pt.got / pt.max))));
  const toggle = h('button', { class: 'btn text', text: 'Lihat rincian skor', onclick: () => { parts.classList.toggle('hidden'); toggle.textContent = parts.classList.contains('hidden') ? 'Lihat rincian skor' : 'Sembunyikan rincian skor'; } });
  return h('div', { class: 'card' },
    h('div', { class: 'row', style: { gap: '16px' } },
      ring(r.hasData ? r.score / 100 : 0, { size: 96, stroke: 10, color, label: h('div', {}, h('div', { class: 'bold', style: { fontSize: '1.4rem' }, text: r.hasData ? String(r.score) : '–' }), h('div', { class: 'tiny muted', text: '/100' })) }),
      h('div', { class: 'grow' },
        h('div', { class: 'small muted bold', text: 'Skor diet' }),
        h('div', { class: 'bold', style: { fontSize: '1.25rem', color: r.hasData ? color : 'var(--muted)' }, text: scoreLabel(r) }),
        h('div', { class: 'small muted', text: !r.hasData ? 'Catat makanan untuk melihat skor.' : r.partial ? 'Sementara — hari ini belum selesai.' : r.period.type === 'D' ? `Dari ${r.foods.length} makanan tercatat.` : `Dari ${r.statDays.length} hari tercatat${r.todayExcluded ? ' (hari ini belum dihitung).' : '.'}` }))),
    r.scoreParts.length ? toggle : null, parts);
}

function overviewTab(root, r) {
  const s = r.settings;
  const day = r.period.type === 'D';
  root.append(scoreCard(r));
  if (!r.hasData) { root.append(insightSection('💡 Saran', r.tips)); return; }
  if (day) {
    const left = s.targetKcal - r.totalKcal;
    root.append(h('div', { class: 'tiles' }, tile('🔥', fmt(r.totalKcal), 'kkal'), tile('🎯', left >= 0 ? `Sisa ${fmt(left)}` : `+${fmt(-left)}`, left >= 0 ? 'kkal tersisa' : 'kkal lebih'),
      tile('💧', `${r.days[0]?.water ?? 0}/${s.targetWater}`, 'gelas air')));
  } else {
    root.append(h('div', { class: 'tiles' }, tile('🔥', fmt(r.avgKcal), 'Rata-rata kkal/hari'), tile('🎯', `${r.onTargetDays}/${r.statDays.length}`, 'Hari sesuai target'), tile('💧', dec(r.avgWater), 'Rata-rata gelas')));
    const all = r.period.allDays();
    const by = new Map(r.days.map((d) => [d.date, d.kcal]));
    const week = r.period.type === 'W';
    root.append(section('📊 Kalori harian',
      h('div', { class: 'small muted', text: `Garis putus-putus = target ${fmt(s.targetKcal)} kkal. Batang oranye = melebihi target.` }),
      barChart(all.map((d) => by.get(d) || 0), s.targetKcal, all.map((d, i) => (week ? dayShort(d) : i % 5 === 0 || i === all.length - 1 ? String(Number(d.slice(8))) : ''))),
      r.todayExcluded ? h('div', { class: 'small muted', text: 'Hari ini belum dihitung dalam rata-rata karena belum selesai.' }) : null));
  }
  const nd = r.needs;
  root.append(section(day ? '🥗 Gizi makro' : '🥗 Gizi makro (rata-rata/hari)',
    nutrientRow('Energi', r.avgKcal, s.targetKcal, 'kkal', 'var(--primary)'),
    nutrientRow('Protein', r.avgProtein, nd.proteinG, 'g', 'var(--protein)'),
    nutrientRow('Karbohidrat', r.avgCarbs, nd.carbsG, 'g', 'var(--carb)'),
    nutrientRow('Lemak', r.avgFat, nd.fatG, 'g', 'var(--fat)'),
    r.avgProtein + r.avgCarbs + r.avgFat <= 0 ? h('div', { class: 'small muted', text: 'Protein/karbo/lemak belum diisi di catatanmu. Pakai saran AI saat mencatat agar terisi otomatis.' }) : null));
  const maxV = Math.max(1, ...MEALS.map((m) => Math.max(r.mealAvg[m] || 0, s.targetKcal * MEAL_SHARE[m])));
  root.append(section(day ? '🍽️ Per waktu makan' : '🍽️ Rata-rata per waktu makan', ...MEALS.map((m) => {
    const v = r.mealAvg[m] || 0; const rec = s.targetKcal * MEAL_SHARE[m];
    return h('div', { class: 'col', style: { gap: '3px' } },
      h('div', { class: 'row' }, h('span', { class: 'grow', text: `${mealEmoji(m)} ${m}` }), h('b', { class: 'small', text: `${fmt(v)} kkal` })),
      hbar(v / maxV, v > rec * 1.25 ? 'var(--over)' : 'var(--primary)'),
      h('div', { class: 'tiny muted', text: `Anjuran ±${fmt(rec)} kkal (${Math.round(MEAL_SHARE[m] * 100)}% dari target)` }));
  })));
  if (!day) {
    const n = r.statDays.length;
    const base = Math.max(1, r.period.elapsedDays - (r.todayExcluded ? 1 : 0));
    root.append(section('🔎 Pola makan',
      kv('Hari tercatat', `${n} dari ${base} hari`),
      kv('Sesuai / lebih / kurang target', `${r.onTargetDays} / ${r.overDays} / ${r.underDays}`),
      r.highestDay ? kv('Kalori tertinggi', `${shortDate(r.highestDay.date)} · ${fmt(r.highestDay.kcal)}`) : null,
      r.lowestDay ? kv('Kalori terendah', `${shortDate(r.lowestDay.date)} · ${fmt(r.lowestDay.kcal)}`) : null,
      r.weekdayAvg != null && r.weekendAvg != null ? kv('Hari kerja vs akhir pekan', `${fmt(r.weekdayAvg)} vs ${fmt(r.weekendAvg)}`) : null,
      kv('Sarapan', `${r.breakfastDays} dari ${n} hari`),
      kv('Makan di atas jam 21.00', `${r.lateDays} hari`),
      kv('Air sesuai target', `${r.waterOkDays} dari ${n} hari`),
      r.weightChange != null ? kv('Perubahan berat', `${signed(r.weightChange)} kg`) : null));
  }
  if (r.topByKcal.length) {
    root.append(section('🏆 Penyumbang kalori terbesar', ...r.topByKcal.slice(0, 6).map((f, i) => h('div', { class: 'row' },
      h('span', { class: 'grow ellipsis', text: `${i + 1}. ${f.name}` }), h('span', { class: 'small muted', text: `${f.count}x · ${fmt(f.kcal)} kkal` })))));
  }
  root.append(insightSection('✅ Yang sudah baik', r.good), insightSection('⚠️ Perlu diperbaiki', r.improve),
    h('div', { class: 'small muted', text: 'Rekomendasi lengkap & analisis AI ada di tab Saran AI.' }));
}

// ======================================================================= Gizi
function nutritionTab(root, r, ctx) {
  const s = r.settings; const nd = r.needs;
  const twIn = h('input', { type: 'text', inputmode: 'decimal', value: s.targetWeight > 0 ? dec(s.targetWeight) : '', placeholder: 'mis. 58' });
  twIn.addEventListener('input', () => { twIn.value = numOnly(twIn.value); });
  root.append(section('👤 Profil',
    !nd.profileComplete ? h('div', { class: 'small over', text: 'Lengkapi profil (jenis kelamin, umur, tinggi) dan catat berat badan agar kebutuhan gizi bisa dihitung.' }) : null,
    kv('Jenis kelamin', s.gender === 'P' ? 'Pria' : s.gender === 'W' ? 'Wanita' : '–'),
    kv('Umur', s.age > 0 ? `${s.age} tahun` : '–'),
    kv('Tinggi badan', s.heightCm > 0 ? `${s.heightCm} cm` : '–'),
    kv('Berat terakhir', nd.weight != null ? `${dec(nd.weight)} kg` : '– (catat di tab Progres)'),
    kv('Aktivitas', ACTIVITY[Math.min(3, Math.max(0, s.activity))][1]),
    kv('Tujuan', GOALS[Math.min(2, Math.max(0, s.goal))][1]),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', { text: 'Berat target (kg)' }), twIn),
      h('button', { class: 'btn tonal', style: { alignSelf: 'flex-end' }, text: 'Simpan', onclick: async () => {
        const v = toNum(twIn.value);
        if (twIn.value && (v < 30 || v > 300)) { toast('Masukkan berat target yang valid'); return; }
        await saveSettings({ targetWeight: v }); toast(v ? 'Berat target disimpan' : 'Berat target dihapus');
      } })),
    h('button', { class: 'btn tonal', text: '✏️ Ubah profil & hitung target', onclick: async () => { if (await openCalculator()) ctx.render(); } })));

  const b = nd.bmi;
  root.append(section('📏 Indeks Massa Tubuh (IMT)', ...(b ? [
    h('div', { class: 'row', style: { gap: '12px' } }, h('div', { class: 'bold', style: { fontSize: '2rem', color: bmiColor(b.level) }, text: dec(b.value) }),
      h('div', {}, h('div', { class: 'bold', style: { color: bmiColor(b.level) }, text: b.category }), h('div', { class: 'tiny muted', text: 'Klasifikasi Asia-Pasifik (WHO)' }))),
    bmiGauge(b.value),
    nd.idealMin != null && nd.weight != null ? h('div', { class: 'small', text: `Berat ideal untuk tinggi ${s.heightCm} cm: ${dec(nd.idealMin)}–${dec(nd.idealMax)} kg.` +
      (nd.weight > nd.idealMax ? ` Kamu ${dec(nd.weight - nd.idealMax)} kg di atas batas atas.` : nd.weight < nd.idealMin ? ` Kamu ${dec(nd.idealMin - nd.weight)} kg di bawah batas bawah.` : ' Beratmu sudah dalam rentang ideal.') }) : null,
    s.targetWeight > 0 && bmiOf(s.targetWeight, s.heightCm) ? h('div', { class: 'small muted', text: `Target ${dec(s.targetWeight)} kg → IMT ${dec(bmiOf(s.targetWeight, s.heightCm).value)} (${bmiOf(s.targetWeight, s.heightCm).category}).` }) : null,
  ] : [h('div', { class: 'small muted', text: 'Isi tinggi badan (Ubah profil) dan catat berat di tab Progres untuk menghitung IMT.' })])));

  const energy = [];
  if (nd.bmr == null || nd.tdee == null) energy.push(h('div', { class: 'small muted', text: 'Lengkapi profil untuk menghitung kebutuhan energi (rumus Mifflin-St Jeor).' }));
  else {
    energy.push(kv('Energi basal (BMR)', `${fmt(nd.bmr)} kkal`, 'energi saat tubuh istirahat total'),
      kv('Kebutuhan jaga berat (TDEE)', `${fmt(nd.tdee)} kkal`, `BMR × ${dec(ACTIVITY[Math.min(3, Math.max(0, s.activity))][0], 3)} (faktor aktivitas)`),
      nd.recommendedKcal != null ? kv('Dianjurkan sesuai tujuan', `${fmt(nd.recommendedKcal)} kkal`, GOALS[Math.min(2, Math.max(0, s.goal))][1]) : null,
      kv('Target yang kamu pakai', `${fmt(s.targetKcal)} kkal`),
      nd.weeklyAtTarget != null ? h('div', { class: 'small', text: `Jika makan tepat sesuai target, berat berubah ±${signed(nd.weeklyAtTarget, 2)} kg/minggu.` }) : null);
    if (nd.recommendedKcal != null && Math.abs(nd.recommendedKcal - s.targetKcal) >= 100) {
      energy.push(h('button', { class: 'btn tonal', text: `Pakai ${fmt(nd.recommendedKcal)} kkal sebagai target`, onclick: async () => { await saveSettings({ targetKcal: nd.recommendedKcal }); toast(`Target diubah ke ${fmt(nd.recommendedKcal)} kkal`); } }));
    }
  }
  if (s.targetKcal < nd.floorKcal) energy.push(h('div', { class: 'small over', text: `Target di bawah ${fmt(nd.floorKcal)} kkal sebaiknya didampingi dokter/ahli gizi.` }));
  root.append(section('🔥 Kebutuhan energi', ...energy));

  const kcal = Math.max(1, s.targetKcal);
  root.append(section('🥗 Target gizi harian',
    h('div', { class: 'small muted', text: `Dari target ${fmt(s.targetKcal)} kkal${nd.weight != null ? ` dan berat ${dec(nd.weight)} kg` : ''}. Angka kiri = ${r.period.type === 'D' ? 'aktual hari itu' : 'rata-rata per hari di periode ini'}.` }),
    nutrientRow('Protein', r.avgProtein, nd.proteinG, 'g', 'var(--protein)', `${Math.round((nd.proteinG * 4 / kcal) * 100)}% energi${nd.weight != null ? ` · ${dec(nd.proteinG / nd.weight)} g/kg berat` : ''} · telur, tempe, tahu, ikan, ayam`),
    nutrientRow('Karbohidrat', r.avgCarbs, nd.carbsG, 'g', 'var(--carb)', `${Math.round((nd.carbsG * 4 / kcal) * 100)}% energi · utamakan nasi merah, ubi, jagung, oat`),
    nutrientRow('Lemak', r.avgFat, nd.fatG, 'g', 'var(--fat)', '25% energi · batasi gorengan & santan')));

  const [pp, cc, ff] = r.split;
  const splitRow = (label, pct, lo, hi, color) => h('div', { class: 'row small' }, h('i', { class: 'dotc', style: { background: color } }), h('span', { class: 'grow', text: `${label} ${Math.round(pct)}%` }),
    h('span', { class: 'tiny ' + (pct < lo ? 'over' : pct > hi ? 'over' : 'ok'), text: `anjuran ${lo}–${hi}% · ${pct < lo ? 'kurang' : pct > hi ? 'berlebih' : 'pas'}` }));
  root.append(section('⚖️ Komposisi energi', ...(pp + cc + ff <= 0 ? [h('div', { class: 'small muted', text: 'Belum ada data protein/karbo/lemak di periode ini.' })] : [
    stackedBar([[pp, 'var(--protein)'], [cc, 'var(--carb)'], [ff, 'var(--fat)']]),
    splitRow('Protein', pp, 10, 35, 'var(--protein)'), splitRow('Karbohidrat', cc, 45, 65, 'var(--carb)'), splitRow('Lemak', ff, 20, 35, 'var(--fat)')])));

  root.append(section('🍽️ Pembagian kalori per waktu makan', ...MEALS.map((m) => kv(`${mealEmoji(m)} ${m}`, `±${fmt(s.targetKcal * MEAL_SHARE[m])} kkal`, `${Math.round(MEAL_SHARE[m] * 100)}% dari target`))));

  root.append(section('💧 Kebutuhan air',
    h('div', { text: `±${nd.waterGlasses} gelas (${fmt(nd.waterGlasses * GLASS_ML)} ml) per hari${nd.weight != null ? ` — 30 ml × ${dec(nd.weight)} kg.` : ' — anjuran umum.'} Target kamu: ${s.targetWater} gelas.` }),
    nd.weight != null && nd.waterGlasses !== s.targetWater ? h('button', { class: 'btn tonal', text: `Pakai ${nd.waterGlasses} gelas sebagai target`, onclick: () => saveSettings({ targetWater: nd.waterGlasses }) }) : null));

  const proj = [];
  if (r.kgPerWeek == null && nd.weeklyAtTarget == null) proj.push(h('div', { class: 'small muted', text: 'Butuh profil lengkap & catatan makan untuk menghitung proyeksi.' }));
  else {
    if (r.kgPerWeek != null) proj.push(kv('Dari rata-rata asupan periode ini', `${signed(r.kgPerWeek, 2)} kg/minggu`), kv('Perkiraan 4 minggu ke depan', `${signed(r.kgPerWeek * 4)} kg`));
    if (nd.weeklyAtTarget != null) proj.push(kv('Jika tepat sesuai target', `${signed(nd.weeklyAtTarget, 2)} kg/minggu`));
    if (r.weeksToGoal != null) proj.push(kv(`Target ${dec(s.targetWeight)} kg tercapai`, `±${dec(r.weeksToGoal, 0)} minggu`, `sekitar ${fmtDate(addDays(today(), Math.round(r.weeksToGoal * 7)))}`));
    proj.push(h('div', { class: 'small muted', text: 'Rumus: (asupan − kebutuhan) × 7 ÷ 7.700 kkal per kg. Perubahan nyata juga dipengaruhi air tubuh, hormon, dan aktivitas.' }));
  }
  root.append(section('📈 Proyeksi berat', ...proj),
    h('div', { class: 'small muted', text: 'Perhitungan ini adalah perkiraan untuk orang dewasa sehat. Untuk kondisi khusus (hamil, menyusui, diabetes, penyakit ginjal, dll.) konsultasikan dengan dokter/ahli gizi.' }));
}

// ======================================================================= Saran AI
async function loadAi(ctx, key) {
  ctx.aiCache ||= {};
  if (key in ctx.aiCache) return ctx.aiCache[key];
  ctx.aiCache[key] = (await getAi(key)) || null;
  return ctx.aiCache[key];
}

function aiResultView(res, stale) {
  return h('div', { class: 'col', style: { gap: '8px' } },
    h('div', { class: 'tiny muted', text: `Dianalisis ${fmtDateTime(res.at)}` }),
    stale ? h('div', { class: 'small over', text: 'Data berubah sejak analisis ini. Ketuk "Analisis ulang" untuk memperbarui.' }) : null,
    res.score != null ? h('div', { class: 'bold', style: { color: scoreColor(res.score) }, text: `Penilaian AI: ${res.score}/100` }) : null,
    res.summary ? h('div', { text: res.summary }) : null,
    res.good.length ? h('div', {}, h('div', { class: 'bold small', text: '✅ Poin baik' }), ...res.good.map((x) => h('div', { class: 'small', text: '• ' + x }))) : null,
    res.improve.length ? h('div', {}, h('div', { class: 'bold small', text: '⚠️ Perlu perbaikan' }), ...res.improve.map((x) => h('div', { class: 'small', text: '• ' + x }))) : null,
    res.recs.length ? h('div', {}, h('div', { class: 'bold small', text: '💡 Rekomendasi' }), ...res.recs.map((x) => h('div', { class: 'small', style: { marginTop: '4px' } }, x.judul ? h('b', { text: x.judul + ': ' }) : null, x.detail))) : null,
    res.menu.length ? h('div', {}, h('div', { class: 'bold small', text: '🍱 Saran menu' }), ...res.menu.map((m) => h('div', { class: 'row small' }, h('span', { class: 'grow', text: `${m.meal}: ${m.menu}` }), m.kcal > 0 ? h('b', { text: `±${fmt(m.kcal)} kkal` }) : null))) : null,
    res.motivation ? h('div', { class: 'small', style: { fontStyle: 'italic' }, text: '💬 ' + res.motivation }) : null);
}

function aiTab(root, r, ctx) {
  const key = r.period.key;
  root.append(h('div', { class: 'card' }, h('h3', { style: { margin: 0 }, text: '💡 Rekomendasi untukmu' }),
    h('div', { class: 'small muted', text: 'Dibuat otomatis dari catatanmu, tetap jalan tanpa internet.' }),
    ...(r.tips.length ? r.tips.map(insightEl) : [h('div', { text: 'Belum ada rekomendasi untuk periode ini.' })])));

  // ---- Analisis AI
  const aiBox = h('div', { class: 'col', style: { gap: '8px' } });
  root.append(h('div', { class: 'card col' }, h('h3', { style: { margin: 0 }, text: '✨ Analisis AI' }), aiBox));
  const st = (ctx.aiState ||= {});
  const drawAi = (res) => {
    clear(aiBox);
    const url = scriptUrlFor();
    if (!url) { aiBox.append(h('div', { class: 'small muted', text: 'Butuh URL Web App + kunci AI (lihat README).' })); return; }
    if (res) aiBox.append(aiResultView(res, res.sig !== signature(r)));
    if (st.loading === key) aiBox.append(h('div', { class: 'row small' }, h('span', { class: 'spin', style: { display: 'inline-flex' } }, icon('sync')), 'Menganalisis…'));
    if (st.error && st.errorKey === key) aiBox.append(h('div', { class: 'small over', text: st.error }));
    if (!r.hasData) { aiBox.append(h('div', { class: 'small muted', text: 'Catat makanan dulu di periode ini.' })); return; }
    aiBox.append(h('button', {
      class: 'btn tonal', disabled: st.loading === key, text: res ? '🔄 Analisis ulang' : '✨ Analisis dengan AI',
      onclick: async () => {
        if (!navigator.onLine) { st.error = 'Analisis AI butuh internet.'; st.errorKey = key; drawAi(res); return; }
        st.loading = key; st.error = null; drawAi(res);
        try {
          const raw = await online.analyze(url, summary(r), device(), S.user.syncId || '');
          const out = parseAnalysis(raw, Date.now(), signature(r));
          if (!out.summary && !out.recs.length) throw new Error('AI tidak memberi jawaban. Coba lagi sebentar.');
          await putAi(key, out);
          ctx.aiCache[key] = out;
          st.loading = null;
          if (ctx.period.key === key && ctx.aTab === 'ai') ctx.render();
        } catch (e) {
          st.loading = null; st.error = e.message; st.errorKey = key;
          if (ctx.period.key === key && ctx.aTab === 'ai') ctx.render();
        }
      },
    }));
  };
  drawAi(ctx.aiCache?.[key]);
  if (!(ctx.aiCache && key in ctx.aiCache)) loadAi(ctx, key).then((res) => { if (ctx.period.key === key && aiBox.isConnected) drawAi(res); });

  // ---- Tanya ahli gizi AI
  const chat = h('div', { class: 'chat' });
  const q = h('input', { type: 'text', placeholder: 'Tulis pertanyaan seputar diet…', enterkeyhint: 'send', 'aria-label': 'Pertanyaan' });
  const drawChat = () => {
    clear(chat);
    for (const m of S.chat) chat.append(h('div', { class: 'bubble ' + (m.fromUser ? 'me' : 'ai'), text: m.text }));
    if (ctx.asking) chat.append(h('div', { class: 'small muted', text: 'AI sedang menjawab…' }));
  };
  const ask = async (text) => {
    const question = String(text || '').trim();
    if (!question || ctx.asking) return;
    const history = S.chat.slice();
    S.chat.push({ fromUser: true, text: question });
    q.value = '';
    if (!navigator.onLine) { S.chat.push({ fromUser: false, text: '⚠️ Tidak ada internet. Coba lagi saat online.' }); drawChat(); return; }
    ctx.asking = true; drawChat();
    try { S.chat.push({ fromUser: false, text: await online.ask(scriptUrlFor(), question, summary(r), history) }); } catch (e) { S.chat.push({ fromUser: false, text: '⚠️ ' + e.message }); }
    ctx.asking = false;
    if (chat.isConnected) drawChat();
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(q.value); });
  const examples = ['Camilan sehat di bawah 150 kkal?', 'Kenapa beratku belum turun?', 'Menu makan malam dari sisa kaloriku?', 'Cara menambah protein dengan murah?'];
  root.append(h('div', { class: 'card col' }, h('h3', { style: { margin: 0 }, text: '💬 Tanya ahli gizi AI' }),
    !scriptUrlFor() ? h('div', { class: 'small muted', text: 'Butuh URL Web App + kunci AI (lihat README).' }) : null,
    h('div', { class: 'tiny muted bold', text: 'Contoh pertanyaan:' }),
    h('div', { class: 'scroll-x' }, ...examples.map((x) => h('button', { class: 'chip soft', text: x, onclick: () => ask(x) }))),
    chat,
    h('div', { class: 'row' }, h('div', { class: 'grow' }, q), h('button', { class: 'btn', text: 'Kirim', onclick: () => ask(q.value) })),
    h('div', { class: 'row' }, h('button', { class: 'btn text', text: 'Hapus percakapan', onclick: () => { S.chat = []; drawChat(); } }), h('span', { class: 'spacer' }),
      h('span', { class: 'tiny muted', text: 'Jawaban AI bersifat umum, bukan diagnosis medis.' }))));
  drawChat();
}

// ======================================================================= Laporan
async function makePdf(r, ai) {
  await loadScript('vendor/jspdf.umd.min.js');
  return reportPdf(window.jspdf.jsPDF, r, ai, S.user?.name || '');
}

function reportTab(root, r, ctx) {
  const key = r.period.key;
  const ai = ctx.aiCache?.[key] || null;
  if (!(ctx.aiCache && key in ctx.aiCache)) loadAi(ctx, key).then((res) => { if (res && ctx.aTab === 'laporan' && root.isConnected) ctx.render(); });
  const text = reportText(r, ai);
  const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Membuat…'; try { await fn(); } catch (e) { toast('Gagal: ' + e.message); } finally { btn.disabled = false; btn.textContent = t; } };
  root.append(section(`📄 Laporan ${r.period.label.toLowerCase()}`,
    h('div', { class: 'small muted', text: 'Kirim ke ahli gizi, dokter, atau keluarga. PDF berisi ringkasan, perhitungan gizi, grafik, tabel harian, rekomendasi' + (ai ? ', dan hasil AI.' : '.') }),
    h('button', { class: 'btn', onclick: () => shareText(text, 'Laporan diet') }, icon('share'), 'Bagikan teks (WhatsApp, dll.)'),
    h('div', { class: 'row' },
      h('button', { class: 'btn tonal grow', text: '📄 Lihat PDF', onclick: (e) => busy(e.currentTarget, async () => {
        const blob = await makePdf(r, ai);
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) downloadBlob(blob, `Laporan_Diet_${fileTag(r)}.pdf`);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }) }),
      h('button', { class: 'btn tonal grow', text: 'Bagikan PDF', onclick: (e) => busy(e.currentTarget, async () => shareFile(await makePdf(r, ai), `Laporan_Diet_${fileTag(r)}.pdf`, 'Laporan diet')) })),
    h('button', { class: 'btn ghost', text: '📊 Ekspor CSV (Excel / Google Sheets)', onclick: () => shareFile(new Blob([reportCsv(r)], { type: 'text/csv' }), `CatatMakan_${fileTag(r)}.csv`, 'Data Catat Makan') })));
  root.append(section('👀 Pratinjau teks', h('pre', { class: 'preview', text })));
}

// Laporan: teks (WhatsApp), CSV, dan PDF (port ReportExporter.kt). PDF memakai jsPDF yang dimuat saat dibutuhkan.
import { MEALS, mealEmoji, total } from './fooddb.js';
import { MEAL_SHARE, GLASS_ML } from './nutrition.js';
import { scoreLabel } from './analyzer.js';
import { fmt, dec, num, signed, shortDate, dayLabel, fmtDate, fmtDateTime, round1, dayShort } from './util.js';

// ------------------------------------------------------------------ teks
export function reportText(r, ai) {
  const s = r.settings;
  const day = r.period.type === 'D';
  let t = `📊 Laporan Diet ${r.period.label}\n🗓️ ${r.period.rangeText()}`;
  if (r.partial) t += ' (sementara)';
  t += '\n';
  if (s.name) t += `👤 ${s.name}\n`;
  if (!r.hasData) return t + '\nBelum ada makanan yang dicatat di periode ini.\n\n— dibuat dengan Catat Makan';
  t += `⭐ Skor: ${r.score}/100 (${scoreLabel(r)})\n\n`;
  if (day) t += `🔥 Kalori: ${fmt(r.totalKcal)} / ${fmt(s.targetKcal)} kkal\n`;
  else {
    t += `🔥 Kalori: rata-rata ${fmt(r.avgKcal)} / ${fmt(s.targetKcal)} kkal per hari\n`;
    t += `📝 Tercatat ${r.statDays.length} dari ${r.period.elapsedDays} hari`;
    if (r.todayExcluded) t += ' (hari ini belum dihitung)';
    t += `\n🎯 Sesuai target ${r.onTargetDays} hari · Lebih ${r.overDays} · Kurang ${r.underDays}\n`;
  }
  const u = day ? '' : ' /hari';
  t += `🥩 Protein ${fmt(r.avgProtein)} g · 🍚 Karbo ${fmt(r.avgCarbs)} g · 🧈 Lemak ${fmt(r.avgFat)} g${u}\n`;
  t += `💧 Air: ${dec(r.avgWater)} / ${s.targetWater} gelas${u}\n`;
  if (r.weightStart != null && r.weightEnd != null && r.weightChange != null) {
    t += `⚖️ Berat: ${dec(r.weightStart)} → ${dec(r.weightEnd)} kg (${signed(r.weightChange)} kg)\n`;
  } else if (r.needs.weight != null) t += `⚖️ Berat terakhir: ${dec(r.needs.weight)} kg\n`;
  if (r.needs.bmi) t += `📏 IMT ${dec(r.needs.bmi.value)} (${r.needs.bmi.category})\n`;
  t += '\n🍽️ Per waktu makan' + (day ? ':\n' : ' (rata-rata):\n');
  for (const m of MEALS) t += `• ${m}: ${fmt(r.mealAvg[m] || 0)} kkal\n`;
  if (r.topByKcal.length) {
    t += '\n🏆 Penyumbang kalori terbesar:\n';
    for (const f of r.topByKcal.slice(0, 5)) t += `• ${f.name} — ${fmt(f.kcal)} kkal (${f.count}x)\n`;
  }
  if (r.good.length) { t += '\n✅ Yang sudah baik:\n'; for (const i of r.good) t += `• ${i.title}: ${i.text}\n`; }
  if (r.improve.length) { t += '\n⚠️ Perlu diperbaiki:\n'; for (const i of r.improve) t += `• ${i.title}: ${i.text}\n`; }
  if (ai) {
    t += `\n✨ Analisis AI:\n${ai.summary}\n`;
    for (const x of ai.recs) t += `• ${x.judul ? x.judul + ': ' : ''}${x.detail}\n`;
    if (ai.motivation) t += `💬 ${ai.motivation}\n`;
  } else {
    const tips = r.tips.filter((i) => i.emoji !== '🍱').slice(0, 4);
    if (tips.length) { t += '\n💡 Rekomendasi:\n'; for (const i of tips) t += `• ${i.title}: ${i.text}\n`; }
  }
  return t + '\nAngka adalah perkiraan, bukan pengganti saran tenaga kesehatan.\n— dibuat dengan Catat Makan';
}

/** Ringkasan satu hari untuk dibagikan (tombol bagikan di Hari Ini). */
export function dayShareText(date, foods, water, s) {
  const dl = dayLabel(date).toLowerCase();
  let t = `📅 Catatan makan ${dl === 'hari ini' || dl === 'kemarin' ? dl + ', ' : ''}${fmtDate(date)}\n\n`;
  for (const meal of MEALS) {
    const items = foods.filter((e) => e.meal === meal);
    if (items.length) t += `${mealEmoji(meal)} ${meal}: ${items.map((e) => `${e.name} (${fmt(total(e))})`).join(', ')}\n`;
  }
  if (!foods.length) t += 'Belum ada makanan dicatat.\n';
  t += `\n🔥 Total: ${fmt(foods.reduce((a, e) => a + total(e), 0))} / ${fmt(s.targetKcal)} kkal`;
  t += `\n💧 Air: ${water} / ${s.targetWater} gelas`;
  return t + '\n\n— dicatat dengan Catat Makan';
}

// ------------------------------------------------------------------ CSV
const csvCell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s; // cegah formula Excel
  return /[",\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
};

export function reportCsv(r) {
  let t = '﻿' + 'tanggal,jam,waktu_makan,nama,porsi,kkal_per_porsi,total_kkal,protein_g,karbo_g,lemak_g,catatan\n';
  const foods = [...r.foods].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  for (const e of foods) {
    t += [e.date, e.time, e.meal, e.name, num(e.portion), num(e.kcal), String(Math.round(total(e))),
      num(round1(e.protein * e.portion)), num(round1(e.carbs * e.portion)), num(round1(e.fat * e.portion)), e.note].map(csvCell).join(',') + '\n';
  }
  t += '\ntanggal,total_kkal,protein_g,karbo_g,lemak_g,air_gelas,jumlah_makanan\n';
  for (const d of r.days) {
    t += [d.date, Math.round(d.kcal), Math.round(d.protein), Math.round(d.carbs), Math.round(d.fat), d.water, d.items].join(',') + '\n';
  }
  return t;
}

export function fileTag(r) {
  if (r.period.type === 'D') return `Harian_${r.period.start}`;
  if (r.period.type === 'W') return `Mingguan_${r.period.start}`;
  return `Bulanan_${r.period.start.slice(0, 7)}`;
}

// ------------------------------------------------------------------ PDF
/** Hapus emoji & karakter di luar Latin-1/WinAnsi yang tidak didukung font standar PDF. */
export function pdfSafe(s) {
  return String(s ?? '')
    .replace(/[−]/g, '-').replace(/[½]/g, '1/2').replace(/[¼]/g, '1/4').replace(/[¾]/g, '3/4')
    .replace(/[→]/g, '->').replace(/[±]/g, '+/-')
    .replace(/[^\u0009\u000A\u000D -~ -ÿ–—‘’“”•…€]/gu, '')
    .replace(/ {2,}/g, ' ').trim();
}

class PdfWriter {
  constructor(jsPDF, footerName) {
    this.doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this.pw = 595; this.ph = 842; this.m = 40; this.y = this.m; this.no = 1;
    this.green = [46, 125, 50]; this.dark = [27, 31, 27]; this.grey = [95, 107, 95]; this.light = [232, 240, 230];
    this.made = fmtDateTime(Date.now());
    this.footerName = footerName;
  }
  font(style = 'normal', size = 10, color = this.dark) { this.doc.setFont('helvetica', style); this.doc.setFontSize(size); this.doc.setTextColor(...color); }
  footer() {
    const d = this.doc;
    d.setDrawColor(204, 213, 202); d.setLineWidth(0.6); d.line(this.m, this.ph - 32, this.pw - this.m, this.ph - 32);
    this.font('normal', 8.5, this.grey);
    d.text(pdfSafe(`Catat Makan · dibuat ${this.made}${this.footerName ? ' · ' + this.footerName : ''}`), this.m, this.ph - 20);
    d.text(`Hal. ${this.no}`, this.pw - this.m, this.ph - 20, { align: 'right' });
  }
  newPage() { this.footer(); this.doc.addPage(); this.no++; this.y = this.m; }
  ensure(h) { if (this.y + h > this.ph - 48) this.newPage(); }
  wrap(text, width) { return this.doc.splitTextToSize(pdfSafe(text), width); }
  header(title, subtitle) {
    const d = this.doc;
    d.setFillColor(...this.green); d.roundedRect(this.m, this.y, this.pw - 2 * this.m, 62, 10, 10, 'F');
    this.font('bold', 18, [255, 255, 255]); d.text(pdfSafe(title), this.m + 16, this.y + 27);
    this.font('normal', 10.5, [232, 245, 233]); d.text(this.wrap(subtitle, this.pw - 2 * this.m - 32)[0] || '', this.m + 16, this.y + 46);
    this.y += 76;
  }
  heading(text) {
    this.ensure(40); this.y += 10;
    this.font('bold', 13, this.green); this.doc.text(pdfSafe(text), this.m, this.y + 13);
    this.y += 19; this.doc.setDrawColor(204, 213, 202); this.doc.setLineWidth(0.6); this.doc.line(this.m, this.y, this.pw - this.m, this.y); this.y += 7;
  }
  sub(text) { this.ensure(20); this.y += 3; this.font('bold', 10); this.doc.text(pdfSafe(text), this.m, this.y + 10); this.y += 15; }
  para(text, { small = false, italic = false } = {}) {
    const size = small ? 8.5 : 10;
    this.font(italic ? 'italic' : 'normal', size, small || italic ? this.grey : this.dark);
    for (const raw of String(text).split('\n')) {
      for (const l of this.wrap(raw, this.pw - 2 * this.m)) { this.ensure(size + 4); this.doc.text(l, this.m, this.y + size); this.y += size + 4; }
    }
    this.y += 3;
  }
  bullet(text) {
    this.font('normal', 10);
    const lines = this.wrap(text, this.pw - 2 * this.m - 12);
    lines.forEach((l, i) => {
      this.ensure(14);
      if (i === 0) { this.font('bold', 10); this.doc.text('•', this.m + 2, this.y + 10); this.font('normal', 10); }
      this.doc.text(l, this.m + 12, this.y + 10); this.y += 14;
    });
    this.y += 2;
  }
  table(weights, rows, headerRow = false) {
    const width = this.pw - 2 * this.m;
    const tot = weights.reduce((a, b) => a + b, 0);
    const ws = weights.map((w) => (w / tot) * width);
    rows.forEach((row, ri) => {
      const head = headerRow && ri === 0;
      this.font(head ? 'bold' : 'normal', 10);
      const cells = row.map((v, i) => this.wrap(v, ws[i] - 8));
      const h = Math.max(...cells.map((c) => c.length)) * 13 + 8;
      this.ensure(h);
      if (head || ri % 2 === 1) { this.doc.setFillColor(...(head ? this.light : [246, 249, 245])); this.doc.rect(this.m, this.y, width, h, 'F'); }
      this.font(head ? 'bold' : 'normal', 10);
      let x = this.m;
      cells.forEach((ls, i) => { ls.forEach((l, li) => this.doc.text(l, x + 4, this.y + 14 + li * 13)); x += ws[i]; });
      this.y += h;
    });
    this.y += 4;
  }
  barChart(values, target, labels) {
    const h = 120; this.ensure(h + 28);
    const top = this.y + 6; const width = this.pw - 2 * this.m;
    const maxV = Math.max(...values, target, 1) * 1.15;
    const slot = width / values.length; const bw = slot * 0.62;
    values.forEach((v, i) => {
      const bh = v <= 0 ? 2 : h * (v / maxV);
      this.doc.setFillColor(...(v <= 0 ? [221, 227, 218] : v > target * 1.05 ? [230, 81, 0] : this.green));
      const left = this.m + i * slot + (slot - bw) / 2;
      this.doc.rect(left, top + h - bh, bw, bh, 'F');
      if (values.length <= 10 || i % 3 === 0 || i === values.length - 1) { this.font('normal', 8, this.grey); this.doc.text(pdfSafe(labels[i] || ''), left + bw / 2, top + h + 11, { align: 'center' }); }
    });
    if (target > 0) {
      const ty = top + h - h * (target / maxV);
      this.doc.setDrawColor(...this.grey); this.doc.setLineWidth(1); this.doc.setLineDashPattern([5, 4], 0);
      this.doc.line(this.m, ty, this.pw - this.m, ty); this.doc.setLineDashPattern([], 0);
      this.font('normal', 8, this.grey); this.doc.text(`target ${fmt(target)}`, this.pw - this.m, ty - 3, { align: 'right' });
    }
    this.y = top + h + 22;
  }
  save() { this.footer(); return this.doc.output('blob'); }
}

/** Buat PDF laporan → Blob. jsPDF = konstruktor dari window.jspdf.jsPDF. */
export function reportPdf(jsPDF, r, ai, userName = '') {
  const p = new PdfWriter(jsPDF, userName);
  const s = r.settings;
  const day = r.period.type === 'D';
  p.header(`Laporan Diet ${r.period.label}`, r.period.rangeText() + (r.partial ? ' (sementara)' : '') + (s.name ? `  ·  ${s.name}` : ''));
  if (!r.hasData) { p.para('Belum ada makanan yang dicatat di periode ini.'); return p.save(); }

  p.heading('Ringkasan');
  const [pp, cc, ff] = r.split;
  p.table([0.55, 0.45], [
    ['Skor diet', `${r.score}/100 (${scoreLabel(r)})`],
    day ? ['Total kalori', `${fmt(r.totalKcal)} dari ${fmt(s.targetKcal)} kkal`] : ['Rata-rata kalori', `${fmt(r.avgKcal)} kkal/hari (target ${fmt(s.targetKcal)})`],
    day ? null : ['Hari tercatat', `${r.statDays.length} dari ${r.period.elapsedDays} hari` + (r.todayExcluded ? ' (hari ini belum dihitung)' : '')],
    day ? null : ['Sesuai / lebih / kurang target', `${r.onTargetDays} / ${r.overDays} / ${r.underDays} hari`],
    ['Protein · Karbo · Lemak' + (day ? '' : ' (rata-rata)'), `${fmt(r.avgProtein)} g · ${fmt(r.avgCarbs)} g · ${fmt(r.avgFat)} g`],
    pp + cc + ff > 0 ? ['Komposisi energi', `Protein ${Math.round(pp)}% · Karbo ${Math.round(cc)}% · Lemak ${Math.round(ff)}%`] : null,
    ['Air minum' + (day ? '' : ' (rata-rata)'), `${dec(r.avgWater)} dari ${s.targetWater} gelas`],
    r.weightChange != null && r.weightStart != null && r.weightEnd != null ? ['Berat badan', `${dec(r.weightStart)} -> ${dec(r.weightEnd)} kg (${signed(r.weightChange)} kg)`] : null,
    r.kgPerWeek != null ? ['Proyeksi dari pola makan', `${signed(r.kgPerWeek, 2)} kg/minggu`] : null,
  ].filter(Boolean));

  const nd = r.needs;
  p.heading('Perhitungan gizi');
  p.table([0.55, 0.45], [
    nd.bmi ? ['Indeks Massa Tubuh (IMT)', `${dec(nd.bmi.value)} — ${nd.bmi.category}`] : null,
    nd.idealMin != null && nd.idealMax != null ? ['Berat ideal (IMT 18,5–22,9)', `${dec(nd.idealMin)} – ${dec(nd.idealMax)} kg`] : null,
    nd.bmr != null ? ['Energi basal (BMR)', `${fmt(nd.bmr)} kkal`] : null,
    nd.tdee != null ? ['Kebutuhan untuk jaga berat (TDEE)', `${fmt(nd.tdee)} kkal`] : null,
    nd.recommendedKcal != null ? ['Target dianjurkan sesuai tujuan', `${fmt(nd.recommendedKcal)} kkal`] : null,
    ['Target yang dipakai', `${fmt(s.targetKcal)} kkal/hari`],
    ['Target protein · karbo · lemak', `${fmt(nd.proteinG)} g · ${fmt(nd.carbsG)} g · ${fmt(nd.fatG)} g`],
    ['Kebutuhan air', `±${nd.waterGlasses} gelas (${nd.waterGlasses * GLASS_ML} ml)`],
  ].filter(Boolean));

  if (!day && r.days.length > 1) {
    p.heading('Kalori harian');
    p.barChart(r.days.map((d) => d.kcal), s.targetKcal, r.days.map((d) => (r.days.length <= 7 ? `${dayShort(d.date)} ${Number(d.date.slice(8))}` : String(Number(d.date.slice(8))))));
    p.table([0.26, 0.15, 0.12, 0.12, 0.12, 0.1, 0.13], [['Tanggal', 'Kkal', 'Protein', 'Karbo', 'Lemak', 'Air', 'Status'],
      ...r.days.map((d) => {
        const ratio = d.kcal / Math.max(1, s.targetKcal);
        return [shortDate(d.date), fmt(d.kcal), `${fmt(d.protein)} g`, `${fmt(d.carbs)} g`, `${fmt(d.fat)} g`, String(d.water),
          d.items === 0 ? '-' : ratio > 1.05 ? 'Lebih' : ratio < 0.8 ? 'Kurang' : 'Sesuai'];
      })], true);
  }
  if (day && r.foods.length) {
    p.heading('Daftar makanan');
    p.table([0.11, 0.19, 0.4, 0.1, 0.2], [['Jam', 'Waktu', 'Makanan', 'Porsi', 'Kalori'],
      ...[...r.foods].sort((a, b) => a.time.localeCompare(b.time)).map((e) => [e.time, e.meal, e.name, num(e.portion), `${fmt(total(e))} kkal`])], true);
  }
  p.heading('Kalori per waktu makan' + (day ? '' : ' (rata-rata per hari)'));
  p.table([0.4, 0.3, 0.3], [['Waktu makan', 'Aktual', 'Anjuran'],
    ...MEALS.map((m) => [m, `${fmt(r.mealAvg[m] || 0)} kkal`, `±${fmt(s.targetKcal * MEAL_SHARE[m])} kkal (${Math.round(MEAL_SHARE[m] * 100)}%)`])], true);
  if (r.topByKcal.length) {
    p.heading('Penyumbang kalori terbesar');
    p.table([0.6, 0.15, 0.25], [['Makanan', 'Kali', 'Total kalori'], ...r.topByKcal.slice(0, 8).map((f) => [f.name, `${f.count}x`, `${fmt(f.kcal)} kkal`])], true);
  }
  if (r.good.length) { p.heading('Yang sudah baik'); r.good.forEach((i) => p.bullet(`${i.title}: ${i.text}`)); }
  if (r.improve.length) { p.heading('Perlu diperbaiki'); r.improve.forEach((i) => p.bullet(`${i.title}: ${i.text}`)); }
  if (r.tips.length) { p.heading('Rekomendasi'); r.tips.forEach((i) => p.bullet(`${i.title}: ${i.text.replaceAll('\n• ', '; ').replaceAll('• ', '')}`)); }
  if (ai) {
    p.heading(`Analisis AI (${fmtDateTime(ai.at)})`);
    if (ai.summary) p.para(ai.summary);
    if (ai.good.length) { p.sub('Poin baik'); ai.good.forEach((x) => p.bullet(x)); }
    if (ai.improve.length) { p.sub('Perlu perbaikan'); ai.improve.forEach((x) => p.bullet(x)); }
    if (ai.recs.length) { p.sub('Rekomendasi'); ai.recs.forEach((x) => p.bullet(x.judul ? `${x.judul}: ${x.detail}` : x.detail)); }
    if (ai.menu.length) { p.sub('Saran menu'); ai.menu.forEach((x) => p.bullet(`${x.meal}: ${x.menu} (±${fmt(x.kcal)} kkal)`)); }
    if (ai.motivation) p.para(ai.motivation, { italic: true });
  }
  p.y += 10;
  p.para('Catatan: semua angka adalah perkiraan dari catatan pengguna dan bukan pengganti saran dokter atau ahli gizi.', { small: true });
  return p.save();
}

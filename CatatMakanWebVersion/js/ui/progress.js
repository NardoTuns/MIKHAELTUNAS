// Tab "Progres" (port StatsScreen.kt + kalender bulanan, target berat, lencana).
import { h, iconBtn, toast, confirmDialog } from './dom.js';
import { barChart, lineChart, hbar } from './charts.js';
import { settings, allFoods, weights, saveWeight, deleteWeight, watersBetween } from '../state.js';
import { frequent, streak, loggedDates, dailyTotals, badges } from '../core/stats.js';
import { fmt, kg, dec, today, addDays, dayShort, shortDate, toNum, numOnly, monthYear, addMonths, daysInMonth, isoDow, dayMonth } from '../core/util.js';

export function renderProgress(root, ctx) {
  const s = settings();
  const days = ctx.progressDays || 7;
  const foods = allFoods();
  const totals = dailyTotals(foods);
  const series = [];
  for (let back = days - 1; back >= 0; back--) { const d = addDays(today(), -back); series.push([d, totals.get(d) || 0]); }
  const logged = series.filter(([, v]) => v > 0);
  const avg = logged.length ? logged.reduce((a, [, v]) => a + v, 0) / logged.length : 0;
  const onTarget = logged.filter(([, v]) => v <= s.targetKcal).length;
  const st = streak(loggedDates(foods));

  root.append(h('h2', { text: 'Progres' }),
    h('div', { class: 'row' }, ...[7, 30].map((n) => h('button', { class: 'chip' + (days === n ? ' on' : ''), text: `${n} hari`, onclick: () => { ctx.progressDays = n; ctx.render(); } }))),
    h('div', { class: 'tiles' },
      tile('🔥', `${st} hari`, 'Beruntun'), tile('📊', fmt(avg), 'Rata-rata kkal'), tile('🎯', `${onTarget}/${logged.length}`, 'Hari sesuai target')),
    h('div', { class: 'card col' },
      h('h3', { text: 'Kalori harian' }),
      h('div', { class: 'small muted', text: `Garis putus-putus = target ${fmt(s.targetKcal)} kkal. Batang oranye = melebihi target. Ketuk batang untuk membuka harinya.` }),
      barChart(series.map(([, v]) => v), s.targetKcal, series.map(([d], i) => (days === 7 ? dayShort(d) : (i % 5 === 0 || i === series.length - 1 ? String(Number(d.slice(8))) : ''))),
        { onBar: (i) => ctx.openDay(series[i][0]) })));

  // ---- berat badan
  const ws = weights();
  const kgIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'mis. 62,5', 'aria-label': 'Berat hari ini (kg)' });
  kgIn.addEventListener('input', () => { kgIn.value = numOnly(kgIn.value); });
  const saveKg = async () => {
    const val = toNum(kgIn.value);
    if (val < 20 || val > 350) { toast('Masukkan berat yang valid'); return; }
    await saveWeight(today(), val);
    toast('Berat tersimpan');
  };
  kgIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKg(); });
  const wCard = h('div', { class: 'card col' }, h('h3', { text: '⚖️ Berat badan' }),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', { text: 'Berat hari ini (kg)' }), kgIn), h('button', { class: 'btn', style: { alignSelf: 'flex-end' }, text: 'Simpan', onclick: saveKg })));
  if (!ws.length) {
    wCard.append(h('div', { class: 'small muted', text: 'Belum ada data berat. Catat seminggu sekali agar terlihat perkembangannya.' }));
  } else {
    const first = ws[0].kg; const last = ws[ws.length - 1].kg; const diff = last - first;
    wCard.append(h('div', { class: 'bold', text: ws.length < 2 ? `Sekarang ${kg(last)} kg` : diff < 0 ? `Sekarang ${kg(last)} kg · turun ${kg(Math.abs(diff))} kg sejak catatan pertama` : diff > 0 ? `Sekarang ${kg(last)} kg · naik ${kg(diff)} kg sejak catatan pertama` : `Sekarang ${kg(last)} kg · stabil` }));
    if (s.targetWeight > 0 && ws.length) {
      const span = first - s.targetWeight;
      const frac = span !== 0 ? (first - last) / span : 1;
      wCard.append(h('div', { class: 'col', style: { gap: '4px' } },
        h('div', { class: 'row small' }, h('span', { class: 'grow', text: `Menuju target ${dec(s.targetWeight)} kg` }), h('b', { text: Math.abs(last - s.targetWeight) < 0.05 ? 'tercapai 🎉' : `sisa ${dec(Math.abs(last - s.targetWeight))} kg` })),
        hbar(frac, 'var(--secondary)')));
    }
    const recent = ws.slice(-30);
    wCard.append(lineChart(recent.map((w) => w.kg), { goal: s.targetWeight > 0 ? s.targetWeight : null, labels: recent.map((w) => dayMonth(w.date)) }));
    for (const w of ws.slice(-5).reverse()) {
      wCard.append(h('div', { class: 'row' }, h('span', { class: 'grow', text: shortDate(w.date) }), h('b', { text: `${kg(w.kg)} kg` }),
        iconBtn('trash', 'Hapus', async () => { if (await confirmDialog('Hapus catatan berat?', `${shortDate(w.date)} · ${kg(w.kg)} kg`, 'Hapus')) await deleteWeight(w.date); })));
    }
  }
  root.append(wCard);

  // ---- kalender bulanan
  root.append(calendar(ctx, s, totals));

  // ---- lencana
  const b = badges({ foods, waters: watersBetween('0000-00-00', '9999-12-31'), weights: ws, settings: s });
  root.append(h('div', { class: 'card col' },
    h('h3', { text: `🏅 Pencapaian (${b.filter((x) => x.done).length}/${b.length})` }),
    h('div', { class: 'badges' }, ...b.map((x) => h('div', { class: 'bdg' + (x.done ? ' done' : ''), title: x.desc },
      h('div', { class: 'e', text: x.emoji }), h('div', { class: 't', text: x.title }),
      h('div', { class: 'p', text: x.done ? 'tercapai' : `${x.progress}/${x.goal}` }))))));

  // ---- favorit
  const fr = frequent(foods);
  if (fr.length) {
    root.append(h('div', { class: 'card col', style: { gap: '6px' } }, h('h3', { text: '🍽️ Paling sering dimakan' }),
      ...fr.slice(0, 8).map((f) => h('div', { class: 'row' }, h('span', { class: 'grow', text: f.name }), h('span', { class: 'small muted', text: `${f.cnt}x · ${fmt(f.kcal)} kkal` })))));
  }
}

function tile(e, v, l) { return h('div', { class: 'tile' }, h('div', { class: 'e', text: e }), h('div', { class: 'v', text: v }), h('div', { class: 'l', text: l })); }

function calendar(ctx, s, totals) {
  const month = ctx.calMonth || today().slice(0, 8) + '01';
  const n = daysInMonth(month);
  const lead = isoDow(month) - 1;
  const t = today();
  const grid = h('div', { class: 'cal' }, ...['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => h('div', { class: 'h', text: d })));
  for (let i = 0; i < lead; i++) grid.append(h('div'));
  let ok = 0; let over = 0; let under = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(month, i);
    const v = totals.get(d) || 0;
    const r = v / Math.max(1, s.targetKcal);
    let cls = '';
    if (v > 0) { if (r > 1.05) { cls = 'over'; over++; } else if (r < 0.8) { cls = 'under'; under++; } else { cls = 'ok'; ok++; } }
    grid.append(h('button', {
      class: `d ${cls}${d === t ? ' today' : ''}${d > t ? ' future' : ''}`, text: String(i + 1), disabled: d > t,
      title: v > 0 ? `${shortDate(d)}: ${fmt(v)} kkal` : shortDate(d), onclick: () => ctx.openDay(d),
    }));
  }
  const canNext = addMonths(month, 1) <= t;
  return h('div', { class: 'card col' },
    h('div', { class: 'row' }, h('h3', { class: 'grow', style: { margin: 0 }, text: '🗓️ Kalender catatan' }),
      iconBtn('left', 'Bulan sebelumnya', () => { ctx.calMonth = addMonths(month, -1); ctx.render(); }),
      h('span', { class: 'bold small', text: monthYear(month) }),
      iconBtn('right', 'Bulan berikutnya', () => { ctx.calMonth = addMonths(month, 1); ctx.render(); }, { disabled: !canNext })),
    grid,
    h('div', { class: 'row wrap small muted' },
      h('span', {}, h('i', { class: 'dotc', style: { background: '#66bb6a' } }), ` sesuai ${ok}`),
      h('span', {}, h('i', { class: 'dotc', style: { background: '#ff8a50' } }), ` lebih ${over}`),
      h('span', {}, h('i', { class: 'dotc', style: { background: '#ffd54f' } }), ` kurang ${under}`),
      h('span', { text: '· ketuk tanggal untuk membuka' })));
}

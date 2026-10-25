// Tab "Hari Ini" (port HomeScreen.kt + Catat cepat & penghitung puasa).
import { h, icon, iconBtn, toast, dialog, shareText } from './dom.js';
import { ring, hbar } from './charts.js';
import { S, settings, foodsOn, allFoods, waterOn, weights, addWater, saveFoods, copyDay, scriptUrlFor, serverInfo } from '../state.js';
import { MEALS, mealEmoji, mealForHour, total } from '../core/fooddb.js';
import { Period } from '../core/period.js';
import { buildReport } from '../core/analyzer.js';
import { dayShareText } from '../core/report.js';
import { splitQuick, matchLocal } from '../core/quicklog.js';
import { frequent, streak, loggedDates, lastEntry } from '../core/stats.js';
import { fmt, num, today, addDays, dayLabel, fmtDate, nowTime, nowHour } from '../core/util.js';
import * as online from '../core/online.js';
import { openFoodForm, saveMenuDialog } from './foodform.js';

function agoText(mins) {
  const hh = Math.floor(mins / 60); const m = mins % 60;
  if (mins < 1) return 'baru saja';
  if (hh === 0) return `${m} menit lalu`;
  if (m === 0) return `${hh} jam lalu`;
  return `${hh} jam ${m} menit lalu`;
}

export function renderHome(root, ctx) {
  const s = settings();
  const date = S.date;
  const foods = foodsOn(date);
  const water = waterOn(date);
  const all = allFoods();
  const st = streak(loggedDates(all));
  const isToday = date === today();
  const tot = foods.reduce((a, e) => a + total(e), 0);
  const report = buildReport(Period.of('D', date), foods, [{ date, glasses: water }], weights(), s);

  // ---- salam
  root.append(h('div', { class: 'row' },
    h('div', { class: 'grow' },
      h('h2', { text: s.name ? `Halo, ${s.name} 👋` : 'Halo 👋' }),
      h('div', { class: 'muted small', text: st > 0 ? `🔥 ${st} hari berturut-turut mencatat` : 'Yuk mulai catat hari ini' })),
    iconBtn('share', 'Bagikan ringkasan', () => shareText(dayShareText(date, foods, water, s), 'Catatan makan'))));

  if (ctx.installCard) root.append(ctx.installCard());

  // ---- tanggal
  const dateIn = h('input', { type: 'date', value: date, max: today(), style: { position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' } });
  dateIn.addEventListener('change', () => { if (dateIn.value) ctx.setDate(dateIn.value > today() ? today() : dateIn.value); });
  root.append(h('div', { class: 'row' },
    iconBtn('left', 'Hari sebelumnya', () => ctx.setDate(addDays(date, -1))),
    h('button', {
      class: 'grow center', style: { border: 0, background: 'none', cursor: 'pointer', padding: '4px', position: 'relative' },
      onclick: () => { try { dateIn.showPicker(); } catch { dateIn.focus(); dateIn.click(); } },
    }, h('div', { class: 'bold', text: dayLabel(date) }), h('div', { class: 'muted small', text: fmtDate(date) }), dateIn),
    iconBtn('right', 'Hari berikutnya', () => ctx.setDate(addDays(date, 1)), { disabled: isToday }),
    !isToday ? h('button', { class: 'chip', text: 'Hari ini', onclick: () => ctx.setDate(today()) }) : null));

  // ---- kalori
  const over = tot > s.targetKcal;
  const color = over ? 'var(--over)' : 'var(--primary)';
  const macro = (label, g, c) => h('div', { class: 'row small' }, h('i', { class: 'dotc', style: { background: c } }), h('span', { text: label }), h('b', { text: `${fmt(g)} g` }));
  root.append(h('div', { class: 'card row', style: { gap: '18px' } },
    ring(tot / Math.max(1, s.targetKcal), { color, label: h('div', {}, h('div', { class: 'bold', style: { fontSize: '1.45rem' }, text: fmt(tot) }), h('div', { class: 'muted tiny', text: `dari ${fmt(s.targetKcal)} kkal` })) }),
    h('div', { class: 'col', style: { gap: '6px' } },
      h('div', { class: 'bold', style: { color, fontSize: '1.1rem' }, text: over ? `Lebih ${fmt(tot - s.targetKcal)} kkal` : `Sisa ${fmt(s.targetKcal - tot)} kkal` }),
      macro('Protein', foods.reduce((a, e) => a + e.protein * e.portion, 0), 'var(--protein)'),
      macro('Karbo', foods.reduce((a, e) => a + e.carbs * e.portion, 0), 'var(--carb)'),
      macro('Lemak', foods.reduce((a, e) => a + e.fat * e.portion, 0), 'var(--fat)'))));

  // ---- air
  const glasses = h('div', { class: 'glasses' });
  for (let i = 0; i < Math.max(s.targetWater, water); i++) glasses.append(h('div', { class: 'glass' + (i < water ? ' full' : '') + (i === water - 1 && ctx.justAddedWater ? ' pop' : '') }));
  root.append(h('div', { class: 'card col' },
    h('div', { class: 'row' }, h('div', { class: 'bold grow', text: '💧 Air minum' }),
      h('span', { class: 'small ' + (water >= s.targetWater ? 'ok bold' : 'muted'), text: `${water} / ${s.targetWater} gelas` })),
    glasses,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', text: '− 1', disabled: water <= 0, onclick: () => addWater(date, -1) }),
      h('button', { class: 'btn water grow', text: '+ 1 gelas', onclick: async () => { ctx.justAddedWater = true; const n = await addWater(date, 1); if (n === s.targetWater) toast('🎉 Target air minum tercapai!'); } }))));
  ctx.justAddedWater = false;

  // ---- terakhir makan & puasa
  const last = lastEntry(all);
  if (last && isToday) {
    const at = new Date(`${last.date}T${last.time}:00`);
    const mins = Math.floor((Date.now() - at.getTime()) / 60000);
    if (mins >= 0 && mins <= 48 * 60) {
      root.append(h('div', { class: 'row small muted', style: { padding: '0 4px' } }, '⏱️', h('span', { class: 'ellipsis', text: `Terakhir makan ${agoText(mins)} · ${last.name}` })));
      if (s.fastingHours > 0) {
        const goal = s.fastingHours * 60;
        const done = mins >= goal;
        root.append(h('div', { class: 'card col ' + (done ? 'soft' : '') },
          h('div', { class: 'row' }, h('span', { class: 'bold grow', text: done ? `✅ Target puasa ${s.fastingHours} jam tercapai` : `⏳ Puasa ${Math.floor(mins / 60)} j ${mins % 60} m` }),
            h('span', { class: 'muted small', text: done ? 'boleh makan lagi' : `sisa ${Math.floor((goal - mins) / 60)} j ${(goal - mins) % 60} m` })),
          hbar(mins / goal, done ? 'var(--primary)' : 'var(--secondary)')));
      }
    }
  }

  // ---- catat cepat (fitur web)
  root.append(quickLogCard(date));

  // ---- saran hari ini
  if (foods.length) {
    const tip = report.improve[0] || report.tips.find((t) => t.emoji !== '👤') || report.good[0];
    if (tip) {
      root.append(h('div', { class: 'card flat clickable row', style: { alignItems: 'flex-start' }, onclick: () => ctx.openAnalysis(report.period.key) },
        h('span', { style: { fontSize: '1.4rem' }, text: tip.emoji }),
        h('div', { class: 'col grow', style: { gap: '2px' } },
          h('div', { class: 'bold', text: tip.title }),
          h('div', { class: 'small muted', style: { display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }, text: tip.text }),
          h('div', { class: 'small bold ok', text: `Skor ${report.partial ? 'sementara ' : ''}${report.score}/100 · Lihat analisis ›` }))));
    }
  } else {
    root.append(h('div', { class: 'card flat col' },
      h('div', { text: 'Belum ada catatan di hari ini.' }),
      h('div', { class: 'small muted', text: 'Makan menu yang sama seperti kemarin? Salin sekaligus, lalu ubah yang perlu.' }),
      h('div', {}, h('button', {
        class: 'btn tonal small', text: 'Salin menu hari sebelumnya',
        onclick: async () => { const n = await copyDay(addDays(date, -1), date); toast(n === 0 ? 'Hari sebelumnya juga kosong' : `${n} makanan disalin`); },
      }))));
  }

  // ---- waktu makan
  for (const meal of MEALS) {
    const items = foods.filter((e) => e.meal === meal);
    const card = h('div', { class: 'card tight' },
      h('div', { class: 'meal-head' },
        h('span', { class: 'meal-emoji', text: mealEmoji(meal) }),
        h('div', { class: 'grow' }, h('div', { class: 'bold', text: meal }), items.length ? h('div', { class: 'small muted', text: `${fmt(items.reduce((a, e) => a + total(e), 0))} kkal` }) : null),
        items.length ? iconBtn('heart', 'Simpan jadi menu favorit', () => saveMenuDialog(`${meal} favorit`, items)) : null,
        h('button', { class: 'icon-btn', style: { color: 'var(--primary)' }, 'aria-label': `Tambah ${meal}`, onclick: () => openFoodForm({ meal, date }) }, icon('addc'))),
      items.length ? null : h('div', { class: 'empty-line', text: 'Belum dicatat' }),
      ...items.map((e) => h('div', { class: 'list-item', onclick: () => ctx.editFood(e) },
        h('div', { class: 'grow' }, h('div', { class: 't', text: e.name }),
          h('div', { class: 's ellipsis', text: `${e.time} · ${num(e.portion)} porsi${e.note ? ' · ' + e.note : ''}` })),
        h('span', { class: 'bold small', text: `${fmt(total(e))} kkal` }))));
    root.append(card);
  }
}

let quickDraft = '';

function quickLogCard(date) {
  const input = h('input', { type: 'text', value: quickDraft, placeholder: 'mis. nasi, 2 tempe goreng, teh tawar', autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Catat cepat' });
  input.addEventListener('input', () => { quickDraft = input.value; });
  const meal = h('select', { 'aria-label': 'Waktu makan', style: { width: 'auto', minWidth: '130px' } },
    ...MEALS.map((m) => h('option', { value: m, text: `${mealEmoji(m)} ${m}`, selected: m === mealForHour(nowHour()) })));
  const btn = h('button', { class: 'btn', text: 'Catat' });
  const go = async () => {
    const items = splitQuick(input.value);
    if (!items.length) { toast('Tulis makanan, pisahkan dengan koma'); return; }
    btn.disabled = true; btn.textContent = 'Mencari…';
    try {
      const matched = matchLocal(items, frequent(allFoods(), 200));
      const s = settings();
      if (s.onlineSuggest && navigator.onLine) {
        await Promise.race([
          Promise.all(matched.map(async (m) => {
            if (m.ref) return;
            try {
              const r = (await online.suggest(m.name, { scriptUrl: scriptUrlFor(), server: serverInfo() }))[0];
              if (r) m.ref = { name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, note: r.info };
            } catch { /* lewati */ }
          })),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      }
      const entries = matched.map((m) => ({
        date, time: date === today() ? nowTime() : '12:00', meal: meal.value, portion: m.portion,
        name: m.ref?.name || m.name, kcal: m.ref?.kcal || 0, protein: m.ref?.protein || 0, carbs: m.ref?.carbs || 0, fat: m.ref?.fat || 0,
        note: m.ref ? m.ref.note || '' : 'kalori belum diisi',
      }));
      const ok = await dialog('Catat makanan ini?', h('div', { class: 'col' },
        ...entries.map((e) => h('div', { class: 'row' }, h('span', { class: 'grow', text: `${num(e.portion)} × ${e.name}` }),
          h('b', { class: e.kcal ? '' : 'over', text: e.kcal ? `${fmt(e.kcal * e.portion)} kkal` : 'kkal ?' }))),
        entries.some((e) => !e.kcal) ? h('p', { class: 'small muted', style: { margin: 0 }, text: 'Kalori yang belum diketahui bisa diisi nanti dengan mengetuk makanannya.' }) : null),
      [{ label: 'Batal', value: false }, { label: 'Simpan', value: true, kind: 'tonal' }]);
      if (ok) {
        quickDraft = '';
        input.value = '';
        await saveFoods(entries);
        toast(`${entries.length} makanan tercatat`);
      }
    } finally { btn.disabled = false; btn.textContent = 'Catat'; }
  };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'card col' },
    h('div', { class: 'row' }, h('span', { class: 'bold grow' }, '⚡ Catat cepat'), meal),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, input), btn),
    h('div', { class: 'tiny muted', text: 'Tulis beberapa makanan sekaligus. Kalori diambil dari catatanmu, database bawaan, atau AI bila online.' }));
}

// Tab "Riwayat" (port HistoryScreen.kt): 90 hari terakhir, cari makanan, makan lagi hari ini.
import { h, icon, iconBtn, toast, clear } from './dom.js';
import { settings, allFoods, saveFood } from '../state.js';
import { mealEmoji, total } from '../core/fooddb.js';
import { fmt, num, today, addDays, dayLabel, shortDate, nowTime } from '../core/util.js';

export function renderHistory(root, ctx) {
  const s = settings();
  const input = h('input', { type: 'search', value: ctx.historyQuery || '', placeholder: 'Cari makanan yang pernah dicatat', 'aria-label': 'Cari' });
  const list = h('div', { class: 'col', style: { gap: '12px' } });
  const draw = () => {
    clear(list);
    const q = input.value.trim().toLowerCase();
    const from = addDays(today(), -89);
    const foods = allFoods()
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : e.date >= from))
      .sort((a, b) => (b.date === a.date ? a.time.localeCompare(b.time) : b.date.localeCompare(a.date)))
      .slice(0, q ? 300 : 5000);
    const groups = new Map();
    for (const e of foods) { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); }
    if (!groups.size) {
      list.append(h('p', { class: 'muted', text: q ? `Tidak ada makanan yang cocok dengan "${input.value.trim()}".` : 'Belum ada catatan dalam 90 hari terakhir. Catatan baru akan muncul di sini.' }));
      return;
    }
    let shown = 0;
    for (const [d, items] of groups) {
      if (shown++ > 120) break;
      const tot = items.reduce((a, e) => a + total(e), 0);
      const over = !q && tot > s.targetKcal;
      list.append(h('div', { class: 'card tight' },
        h('div', { class: 'list-item', style: { borderTop: 0 }, onclick: () => ctx.openDay(d) },
          h('div', { class: 'grow' }, h('div', { class: 'bold', text: dayLabel(d) }), h('div', { class: 's', text: shortDate(d) })),
          h('span', { class: 'bold ' + (over ? 'over' : 'ok'), text: `${fmt(tot)} kkal` })),
        ...items.map((e) => h('div', { class: 'list-item', onclick: () => ctx.editFood(e) },
          h('span', { text: mealEmoji(e.meal) }),
          h('div', { class: 'grow' }, h('div', { class: 't', text: e.name }), h('div', { class: 's', text: `${e.time} · ${num(e.portion)} porsi · ${fmt(total(e))} kkal` })),
          iconBtn('plus', 'Makan lagi hari ini', async (ev) => {
            ev.stopPropagation();
            await saveFood({ ...e, id: null, date: today(), time: nowTime() });
            toast(`${e.name} ditambahkan ke hari ini`);
          })))));
    }
  };
  input.addEventListener('input', () => { ctx.historyQuery = input.value; draw(); });
  root.append(h('h2', { text: 'Riwayat' }), h('div', { class: 'input-wrap' }, icon('search', 'lead'), input), list);
  draw();
}

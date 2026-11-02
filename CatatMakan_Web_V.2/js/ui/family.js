// Rekap keluarga: perbandingan semua anggota (tanpa internet) + menu keluarga, pembagian porsi & daftar belanja dari AI.
import { h, iconBtn, sheet, toast, clear, shareText } from './dom.js';
import { ring } from './charts.js';
import { S, userBundle, scriptUrlFor, device, getFamilyPlan, putFamilyPlan, isLocked } from '../state.js';
import { Period } from '../core/period.js';
import { buildReport } from '../core/analyzer.js';
import { familyMember, parseFamily, familyShareText } from '../core/aicoach.js';
import * as online from '../core/online.js';
import { mealEmoji } from '../core/fooddb.js';
import { trySwitch } from './users.js';
import { fmt, dec, today, fmtDateTime } from '../core/util.js';

const scoreColor = (v) => (v >= 70 ? 'var(--primary)' : v >= 50 ? 'var(--carb)' : 'var(--over)');

export function openFamily(ctx) {
  sheet((body, close) => {
    let period = Period.of('W', today());
    let rows = [];
    let loadingRows = true;
    let plan = null;
    let loadingPlan = false;
    let error = null;
    let token = 0;
    const checked = new Set();
    const content = h('div', { class: 'col', style: { gap: '12px' } });
    body.append(h('h3', { text: '👨‍👩‍👧 Rekap keluarga' }), content);

    async function load() {
      const my = ++token;
      loadingRows = true; plan = null; error = null; checked.clear(); draw();
      const out = [];
      for (const u of S.users) {
        const b = await userBundle(u);
        const foods = b.foods.filter((e) => e.date >= period.start && e.date <= period.end);
        const waters = b.waters.filter((w) => w.date >= period.start && w.date <= period.end);
        out.push({ user: u, settings: b.settings, report: buildReport(period, foods, waters, b.weights, b.settings) });
      }
      if (my !== token) return;
      rows = out;
      loadingRows = false;
      plan = (await getFamilyPlan(period.key)) || null;
      if (my === token) draw();
    }

    async function makePlan() {
      const url = scriptUrlFor();
      if (!url) { toast('Isi URL Web App dulu di Pengaturan'); return; }
      if (!navigator.onLine) { error = 'Menu keluarga AI butuh internet.'; draw(); return; }
      const my = token;
      loadingPlan = true; error = null; draw();
      try {
        const summary = {
          periode: period.fullText(), tanggal_hari_ini: today(),
          anggota: rows.map((x) => familyMember({ name: x.user.name, settings: x.settings, report: x.report })),
        };
        const res = parseFamily(await online.family(url, summary, device()));
        if (!res.menu.length && !res.summary) throw new Error('AI tidak memberi jawaban. Coba lagi sebentar.');
        await putFamilyPlan(period.key, res);
        if (my === token) { plan = res; checked.clear(); }
      } catch (e) { error = e.message; }
      loadingPlan = false;
      if (my === token) draw();
    }

    function memberCard(x) {
      const r = x.report; const u = x.user;
      const day = r.period.type === 'D';
      const kcal = day ? r.totalKcal : r.avgKcal;
      const target = x.settings.targetKcal;
      const ratio = target > 0 ? kcal / target : 0;
      const over = ratio > 1.1;
      return h('div', { class: 'card clickable row', onclick: async () => { if (await trySwitch(u)) { close(); ctx.go('analisis'); } } },
        ring(Math.min(1, ratio), { size: 56, stroke: 6, color: over ? 'var(--over)' : u.color, label: h('span', { text: u.emoji }) }),
        h('div', { class: 'col grow', style: { gap: '2px' } },
          h('div', { class: 'bold', text: `${isLocked(u) ? '🔒 ' : ''}${u.name}${r.needs.child ? ' · anak' : ''}` }),
          !r.hasData ? h('div', { class: 'small muted', text: 'Belum ada catatan di periode ini' }) : h('div', { class: 'col', style: { gap: '2px' } },
            h('div', { class: over ? 'over' : '', text: `${fmt(kcal)} / ${fmt(target)} kkal${day ? '' : ' per hari'}` }),
            h('div', { class: 'small muted', text: `Protein ${fmt(r.avgProtein)}/${fmt(r.needs.proteinG)} g · 💧 ${dec(r.avgWater)}/${x.settings.targetWater}${day ? '' : ` · ${r.statDays.length} hari tercatat`}` }),
            r.improve[0] ? h('div', { class: 'tiny over', text: `${r.improve[0].emoji} ${r.improve[0].title}` }) : null)),
        r.hasData ? h('div', { class: 'center' }, h('div', { class: 'bold', style: { fontSize: '1.3rem', color: scoreColor(r.score) }, text: String(r.score) }), h('div', { class: 'tiny muted', text: 'skor' })) : null);
    }

    function planView(p) {
      return h('div', { class: 'col', style: { gap: '10px' } },
        h('div', { class: 'tiny muted', text: `Dibuat ${fmtDateTime(p.at)}` }),
        p.summary ? h('div', { text: p.summary }) : null,
        ...p.members.map((m) => h('div', { class: 'card flat col', style: { gap: '2px' } }, h('b', { text: m.name }), h('div', { class: 'small', text: m.text }))),
        p.menu.length ? h('div', { class: 'col', style: { gap: '6px' } }, h('b', { text: '🍱 Menu bersama' }),
          ...p.menu.map((m) => h('div', { class: 'row', style: { alignItems: 'flex-start' } }, h('span', { text: mealEmoji(m.meal) }),
            h('div', { class: 'grow' }, h('div', { class: 'tiny muted', text: m.meal }), h('div', { text: m.menu }), m.portions ? h('div', { class: 'small ok', text: `Porsi: ${m.portions}` }) : null)))) : null,
        p.shopping.length ? h('div', { class: 'col', style: { gap: '0' } }, h('b', { text: '🛒 Daftar belanja' }),
          ...p.shopping.map((b) => {
            const on = checked.has(b.item);
            const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': b.item });
            const row = h('label', { class: 'shop' + (on ? ' done' : '') }, cb, h('span', { class: 'grow it', text: b.item }), b.qty ? h('span', { class: 'small muted', text: b.qty }) : null);
            cb.addEventListener('change', () => { if (cb.checked) checked.add(b.item); else checked.delete(b.item); row.classList.toggle('done', cb.checked); });
            return row;
          })) : null,
        p.tips.length ? h('div', { class: 'col', style: { gap: '2px' } }, h('b', { text: '💡 Tips' }), ...p.tips.map((t) => h('div', { class: 'small', text: '• ' + t }))) : null,
        h('button', { class: 'btn ghost', text: '📲 Bagikan menu & daftar belanja', onclick: () => shareText(familyShareText(p), 'Rekap gizi keluarga') }));
    }

    function draw() {
      clear(content);
      const setType = (t) => { if (period.type !== t) { period = Period.of(t, period.effectiveEnd); load(); } };
      content.append(
        h('div', { class: 'seg sm' }, ...[['D', 'Harian'], ['W', 'Mingguan'], ['M', 'Bulanan']].map(([t, l]) => h('button', { class: period.type === t ? 'on' : '', text: l, onclick: () => setType(t) }))),
        h('div', { class: 'row' },
          iconBtn('left', 'Periode sebelumnya', () => { period = period.shift(-1); load(); }),
          h('div', { class: 'grow center' }, h('div', { class: 'bold', text: period.title() }), h('div', { class: 'small muted', text: period.rangeText() })),
          iconBtn('right', 'Periode berikutnya', () => { period = period.shift(1); load(); }, { disabled: !period.canGoNext() })));
      if (loadingRows) { content.append(h('p', { class: 'muted center', text: 'Memuat…' })); return; }
      content.append(...rows.map(memberCard), h('div', { class: 'tiny muted', text: 'Ketuk anggota untuk berpindah & melihat analisis lengkapnya.' }));

      const url = scriptUrlFor();
      content.append(h('div', { class: 'card col' }, h('h3', { style: { margin: 0 }, text: '✨ Menu keluarga & daftar belanja (AI)' }),
        h('div', { class: 'small muted', text: 'AI ahli gizi membaca pola makan semua anggota, lalu menyusun menu bersama untuk besok dengan pembagian porsi sesuai kebutuhan tiap orang (dewasa & anak), lengkap dengan daftar belanja.' }),
        !url ? h('div', { class: 'small over', text: 'Butuh URL Web App + kunci AI (Code.gs 2.1, lihat README).' })
          : h('button', { class: 'btn', disabled: loadingPlan, text: loadingPlan ? 'Menyusun menu…' : plan ? '🔄 Buat ulang' : '✨ Buat menu keluarga', onclick: makePlan }),
        error ? h('div', { class: 'small over', text: error }) : null,
        plan ? planView(plan) : null));
      content.append(h('div', { class: 'tiny muted', text: 'Saran AI bersifat umum, bukan pengganti saran dokter/ahli gizi.' }));
    }

    load();
  });
}

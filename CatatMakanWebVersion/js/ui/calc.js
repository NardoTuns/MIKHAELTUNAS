// Dialog "Hitung target kalori" (Mifflin-St Jeor dengan batas bawah aman), port TargetCalculatorDialog.
import { h, dialog, toast, clear } from './dom.js';
import { ACTIVITY, GOALS, calcTarget } from '../core/nutrition.js';
import { settings, weights, saveSettings, saveWeight } from '../state.js';
import { fmt, num, toNum, today } from '../core/util.js';

export async function openCalculator() {
  const s = settings();
  const ws = weights();
  const latest = ws.length ? ws[ws.length - 1].kg : null;
  const v = { gender: s.gender, age: s.age || '', height: s.heightCm || '', weight: latest != null ? num(latest) : '', activity: Math.min(3, Math.max(0, s.activity)), goal: Math.min(2, Math.max(0, s.goal)) };
  let result = null;
  const res = await dialog('Hitung target kalori', () => {
    const out = h('div', { class: 'card soft col', style: { gap: '4px' } });
    const chips = (list, key) => {
      const box = h('div', { class: 'col', style: { gap: '6px' } });
      const draw = () => { clear(box); list.forEach(([, label], i) => box.append(h('button', { class: 'chip' + (v[key] === i ? ' on' : ''), style: { justifyContent: 'flex-start', whiteSpace: 'normal' }, text: label, onclick: () => { v[key] = i; draw(); update(); } }))); };
      draw();
      return box;
    };
    const genderBox = h('div', { class: 'row' });
    const drawGender = () => { clear(genderBox); for (const [g, l] of [['P', 'Pria'], ['W', 'Wanita']]) genderBox.append(h('button', { class: 'chip' + (v.gender === g ? ' on' : ''), text: l, onclick: () => { v.gender = g; drawGender(); update(); } })); };
    drawGender();
    const num3 = (label, key, mode = 'numeric') => {
      const inp = h('input', { type: 'text', inputmode: mode, value: v[key] });
      inp.addEventListener('input', () => { v[key] = inp.value; update(); });
      return h('label', { class: 'field grow' }, h('span', { text: label }), inp);
    };
    function update() {
      clear(out);
      const age = parseInt(v.age, 10) || 0;
      result = calcTarget({ gender: v.gender, age, heightCm: parseInt(v.height, 10) || 0, weightKg: toNum(v.weight), activity: v.activity, goal: v.goal });
      if (result) {
        out.append(h('div', { class: 'bold ok', style: { fontSize: '1.15rem' }, text: `Target: ${fmt(result.target)} kkal/hari` }),
          h('div', { class: 'small muted', text: `Kebutuhan untuk menjaga berat ±${fmt(result.maintain)} kkal. Angka ini perkiraan; target tidak dibuat di bawah ${fmt(result.floor)} kkal agar gizi tetap cukup.` }));
      } else {
        out.append(h('div', { class: 'small muted', text: age > 0 && age < 18 ? 'Kalkulator ini untuk usia dewasa (18+).' : 'Lengkapi data di atas untuk melihat hasilnya.' }));
      }
    }
    update();
    return h('div', { class: 'col' }, genderBox,
      h('div', { class: 'row' }, num3('Umur', 'age'), num3('Tinggi cm', 'height'), num3('Berat kg', 'weight', 'decimal')),
      h('div', { class: 'bold small', text: 'Aktivitas' }), chips(ACTIVITY, 'activity'),
      h('div', { class: 'bold small', text: 'Tujuan' }), chips(GOALS, 'goal'),
      out);
  }, [{ label: 'Batal', value: false }, { label: 'Pakai target ini', value: true, kind: 'tonal' }]);
  if (!res) return false;
  if (!result) { toast('Data belum lengkap'); return false; }
  await saveSettings({ targetKcal: result.target, gender: v.gender, age: parseInt(v.age, 10), heightCm: parseInt(v.height, 10), activity: v.activity, goal: v.goal });
  const kg = toNum(v.weight);
  if (kg > 0 && (latest == null || Math.abs(kg - latest) > 0.01)) await saveWeight(today(), kg);
  toast(`Target diubah ke ${fmt(result.target)} kkal`);
  return true;
}

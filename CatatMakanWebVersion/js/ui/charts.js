// Grafik SVG ringan (tanpa pustaka).
import { h } from './dom.js';
import { fmt } from '../core/util.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  for (const k of kids) if (k) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

/** Cincin progres. fraction 0..1, label = elemen/teks di tengah. */
export function ring(fraction, { size = 132, stroke = 12, color = 'var(--primary)', label } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  const fg = s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c });
  const svg = s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': stroke }), fg);
  requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', String(c * (1 - f))));
  return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, svg, h('div', { class: 'lbl' }, label));
}

export function hbar(fraction, color = 'var(--primary)') {
  return h('div', { class: 'hbar' }, h('i', { style: { width: Math.max(0, Math.min(1, fraction || 0)) * 100 + '%', background: color } }));
}

export function stackedBar(parts) {
  const tot = parts.reduce((a, p) => a + p[0], 0) || 1;
  return h('div', { class: 'stack' }, ...parts.map(([v, color]) => h('i', { style: { width: (v / tot) * 100 + '%', background: color } })));
}

/** Grafik batang dengan garis target putus-putus. Batang melebihi target berwarna oranye. */
export function barChart(values, target, labels = [], { height = 170, onBar } = {}) {
  const W = 340; const H = height; const top = 8; const bottom = 18;
  const maxV = Math.max(...values, target, 1) * 1.15;
  const slot = W / Math.max(1, values.length);
  const bw = slot * 0.62;
  const ch = H - top - bottom;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Grafik kalori harian' });
  values.forEach((v, i) => {
    const bh = v <= 0 ? 2 : ch * (v / maxV);
    const color = v <= 0 ? 'var(--surface-3)' : v > target * 1.05 ? 'var(--over)' : 'var(--primary)';
    const x = i * slot + (slot - bw) / 2;
    const rect = s('rect', { x, y: top + ch - bh, width: bw, height: bh, rx: Math.min(4, bw / 3), fill: color },
      s('title', {}, `${labels[i] || ''}: ${fmt(v)} kkal`));
    if (onBar) { rect.style.cursor = 'pointer'; rect.addEventListener('click', () => onBar(i)); }
    svg.append(rect);
    const show = values.length <= 10 || i % 5 === 0 || i === values.length - 1;
    if (show && labels[i]) svg.append(s('text', { x: x + bw / 2, y: H - 4, 'text-anchor': 'middle' }, labels[i]));
  });
  if (target > 0) {
    const ty = top + ch - ch * (target / maxV);
    svg.append(s('line', { x1: 0, x2: W, y1: ty, y2: ty, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
    svg.append(s('text', { x: W, y: ty - 3, 'text-anchor': 'end' }, `target ${fmt(target)}`));
  }
  return h('div', { class: 'chart' }, svg);
}

/** Grafik garis (berat badan). goal = garis target berat (opsional). */
export function lineChart(values, { height = 140, goal, labels = [] } = {}) {
  const W = 340; const H = height; const pad = 14;
  const all = goal ? [...values, goal] : values;
  let lo = Math.min(...all); let hi = Math.max(...all);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const span = hi - lo;
  const x = (i) => (values.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (values.length - 1));
  const y = (v) => pad + (H - 2 * pad - 12) * (1 - (v - lo) / span);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Grafik berat badan' });
  if (goal) {
    svg.append(s('line', { x1: 0, x2: W, y1: y(goal), y2: y(goal), stroke: 'var(--secondary)', 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
    svg.append(s('text', { x: W, y: y(goal) - 3, 'text-anchor': 'end' }, `target ${String(goal).replace('.', ',')} kg`));
  }
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  svg.append(s('path', { d, fill: 'none', stroke: 'var(--primary)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  values.forEach((v, i) => svg.append(s('circle', { cx: x(i), cy: y(v), r: 3.5, fill: 'var(--surface)', stroke: 'var(--primary)', 'stroke-width': 2 },
    s('title', {}, `${labels[i] || ''} ${String(v).replace('.', ',')} kg`))));
  if (labels.length) {
    svg.append(s('text', { x: x(0), y: H - 2, 'text-anchor': 'start' }, labels[0]));
    if (values.length > 1) svg.append(s('text', { x: x(values.length - 1), y: H - 2, 'text-anchor': 'end' }, labels[labels.length - 1]));
  }
  return h('div', { class: 'chart' }, svg);
}

/** Gauge IMT dengan rentang klasifikasi Asia-Pasifik. */
export function bmiGauge(value) {
  const W = 340; const H = 44; const lo = 15; const hi = 35;
  const X = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * W;
  const bands = [[15, 18.5, '#64b5f6'], [18.5, 23, '#66bb6a'], [23, 25, '#ffd54f'], [25, 30, '#ffa726'], [30, 35, '#ef5350']];
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Skala IMT' });
  bands.forEach(([a, b, c]) => svg.append(s('rect', { x: X(a), y: 14, width: X(b) - X(a), height: 10, fill: c })));
  [18.5, 23, 25, 30].forEach((t) => svg.append(s('text', { x: X(t), y: 38, 'text-anchor': 'middle' }, String(t).replace('.', ','))));
  svg.append(s('path', { d: `M${X(value)},12 l-6,-9 h12 z`, fill: 'var(--ink)' }));
  return h('div', { class: 'chart' }, svg);
}

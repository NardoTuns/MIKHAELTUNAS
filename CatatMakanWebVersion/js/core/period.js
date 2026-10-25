// Rentang analisis harian/mingguan/bulanan (port dari Period.kt). Minggu dimulai Senin.
import {
  today, addDays, addMonths, isoDow, daysInMonth, epochDay, minDate, isValidDate,
  dayLabel, fmtDate, dayMonth, monthYear,
} from './util.js';

export const PERIOD_TYPES = {
  D: { code: 'D', label: 'Harian' },
  W: { code: 'W', label: 'Mingguan' },
  M: { code: 'M', label: 'Bulanan' },
};

export class Period {
  constructor(type, start, end) {
    this.type = type; // 'D' | 'W' | 'M'
    this.start = start;
    this.end = end;
  }

  static of(type, anchor) {
    if (type === 'D') return new Period('D', anchor, anchor);
    if (type === 'W') {
      const s = addDays(anchor, -(isoDow(anchor) - 1));
      return new Period('W', s, addDays(s, 6));
    }
    const s = anchor.slice(0, 8) + '01';
    return new Period('M', s, addDays(s, daysInMonth(s) - 1));
  }

  static fromKey(key) {
    const m = /^([DWM]):(\d{4}-\d{2}-\d{2})$/.exec(String(key || ''));
    if (!m || !isValidDate(m[2])) return null;
    return Period.of(m[1], m[2]);
  }

  get key() { return `${this.type}:${this.start}`; }
  get label() { return PERIOD_TYPES[this.type].label; }
  /** Hari terakhir yang sudah dilewati (tidak melewati hari ini). */
  get effectiveEnd() { return minDate(this.end, today()); }
  get elapsedDays() { return this.start > today() ? 0 : epochDay(this.effectiveEnd) - epochDay(this.start) + 1; }
  get totalDays() { return epochDay(this.end) - epochDay(this.start) + 1; }
  get isCurrent() { const t = today(); return t >= this.start && t <= this.end; }

  shift(n) {
    if (this.type === 'D') return Period.of('D', addDays(this.start, n));
    if (this.type === 'W') return Period.of('W', addDays(this.start, 7 * n));
    return Period.of('M', addMonths(this.start, n));
  }

  canGoNext() { return this.end < today(); }

  equals(o) { return !!o && o.type === this.type && o.start === this.start && o.end === this.end; }

  title() {
    if (this.type === 'D') return dayLabel(this.start);
    if (this.type === 'W') {
      if (this.isCurrent) return 'Minggu ini';
      if (this.start === addDays(Period.of('W', today()).start, -7)) return 'Minggu lalu';
      return 'Minggu';
    }
    return this.isCurrent ? 'Bulan ini' : 'Bulan';
  }

  rangeText() {
    if (this.type === 'D') return fmtDate(this.start);
    if (this.type === 'W') return `${dayMonth(this.start)} – ${dayMonth(this.end)} ${this.end.slice(0, 4)}`;
    return monthYear(this.start);
  }

  fullText() { return `${this.label} · ${this.rangeText()}`; }

  days() {
    const out = [];
    for (let i = 0; i < this.elapsedDays; i++) out.push(addDays(this.start, i));
    return out;
  }

  allDays() {
    const out = [];
    for (let i = 0; i < this.totalDays; i++) out.push(addDays(this.start, i));
    return out;
  }
}

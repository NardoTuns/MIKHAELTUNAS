// Utilitas format angka & tanggal (setara Format.kt di aplikasi Android).
// Tanggal disimpan sebagai teks lokal "YYYY-MM-DD", jam "HH:mm".

/** Jam aplikasi — dapat diganti saat pengujian. */
export const clock = {
  now: () => new Date(),
};

const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => ymd(clock.now());
export const nowTime = () => { const d = clock.now(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const nowHour = () => clock.now().getHours();

function parts(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return { y, m, d };
}
/** Hari ke-n sejak 1970-01-01 (tanpa zona waktu). */
export function epochDay(s) {
  const { y, m, d } = parts(s);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function fromEpochDay(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const addDays = (s, n) => fromEpochDay(epochDay(s) + n);
/** 1 = Senin … 7 = Minggu */
export function isoDow(s) {
  const w = new Date(epochDay(s) * 86400000).getUTCDay();
  return w === 0 ? 7 : w;
}
export function addMonths(s, n) {
  const { y, m } = parts(s);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}
export function daysInMonth(s) {
  const { y, m } = parts(s);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const minDate = (a, b) => (a < b ? a : b);
export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && fromEpochDay(epochDay(s)) === s;
export const isValidTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI3 = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const jsDow = (s) => isoDow(s) % 7;

export const dayName = (s) => HARI[jsDow(s)];
export const dayShort = (s) => HARI3[jsDow(s)];
export const monthName = (m) => BULAN[m - 1];
/** "22 Oktober 2026" */
export function fmtDate(s) { const { y, m, d } = parts(s); return `${d} ${BULAN[m - 1]} ${y}`; }
/** "Kam, 22 Okt" */
export function shortDate(s) { const { m, d } = parts(s); return `${dayShort(s)}, ${d} ${BULAN3[m - 1]}`; }
/** "22 Okt" */
export function dayMonth(s) { const { m, d } = parts(s); return `${d} ${BULAN3[m - 1]}`; }
/** "Oktober 2026" */
export function monthYear(s) { const { y, m } = parts(s); return `${BULAN[m - 1]} ${y}`; }
export function dayLabel(s) {
  const t = today();
  if (s === t) return 'Hari ini';
  if (s === addDays(t, -1)) return 'Kemarin';
  return dayName(s);
}
export function fmtDateTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${d.getDate()} ${BULAN3[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- angka
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** Bilangan bulat gaya Indonesia: 1.234 */
export function fmt(v) {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? '-' : '') + group(Math.abs(n));
}
/** Angka porsi: 1 / 1.5 (titik, maksimal 1 desimal) */
export function num(v) {
  const n = Number(v) || 0;
  return n % 1 === 0 ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}
/** Desimal gaya Indonesia: 1,5 */
export function dec(v, digits = 1) {
  const n = Number(v) || 0;
  const [i, f] = Math.abs(n).toFixed(digits).split('.');
  return (n < 0 && Number(Math.abs(n).toFixed(digits)) !== 0 ? '-' : '') + group(i) + (f ? ',' + f : '');
}
/** Berat/angka ringkas gaya Indonesia: 62 / 62,5 */
export function kg(v) {
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return n % 1 === 0 ? fmt(n) : dec(n, 1);
}
/** Selisih bertanda: +0,4 / −1,2 */
export function signed(v, digits = 1) {
  const n = Number(v) || 0;
  return (n > 0 ? '+' : n < 0 ? '−' : '') + dec(Math.abs(n), digits);
}
export const toNum = (s) => { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const numOnly = (s) => String(s ?? '').replace(/[^0-9.,]/g, '').slice(0, 7);
export const round1 = (v) => Math.round(v * 10) / 10;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

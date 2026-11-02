// Pengingat. Web/PWA tidak bisa menjadwalkan alarm tepat waktu saat aplikasi tertutup (terutama iPhone),
// jadi ada dua cara: (1) pengingat dalam aplikasi saat terbuka/di latar, (2) ekspor ke Kalender HP (.ics)
// yang berbunyi andal di Android & iPhone walau aplikasi ditutup.
import { isoDow } from './util.js';

const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');

/**
 * Pengingat yang jatuh tempo sekarang.
 * ctx: { date, minutes (menit sejak 00:00), settings, mealsLogged:Set, water, hasWeightToday, fired:Set, totalKcal }
 */
export function dueReminders(ctx) {
  const { date, minutes, settings: s, fired } = ctx;
  const out = [];
  const once = (key, r) => { if (!fired.has(key)) out.push({ key, ...r }); };
  if (s.remindMeals) {
    for (const [meal, time, emoji, label] of [['Sarapan', s.breakfastTime, '🍳', 'sarapan'], ['Makan Siang', s.lunchTime, '🍛', 'makan siang'], ['Makan Malam', s.dinnerTime, '🍲', 'makan malam']]) {
      const t = toMin(time);
      if (minutes >= t && minutes < t + 90 && !ctx.mealsLogged.has(meal)) {
        once(`meal:${meal}:${date}`, { type: 'meal', meal, title: `${emoji} Waktunya ${label}`, body: `Jangan lupa catat ${label}mu ya.` });
      }
    }
  }
  if (s.remindWater && ctx.water < s.targetWater && minutes >= 8 * 60 && minutes <= 21 * 60) {
    const slot = Math.floor((minutes - 8 * 60) / (Math.max(1, s.waterEveryHours) * 60));
    if (slot > 0) once(`water:${date}:${slot}`, { type: 'water', title: '💧 Waktunya minum air', body: `Baru ${ctx.water} dari ${s.targetWater} gelas hari ini.` });
  }
  if (s.remindSummary) {
    const t = toMin(s.summaryTime);
    if (minutes >= t && minutes < t + 120) once(`summary:${date}`, { type: 'summary', title: '📊 Ringkasan hari ini', body: `Total ${Math.round(ctx.totalKcal)} / ${s.targetKcal} kkal · air ${ctx.water}/${s.targetWater} gelas.` });
  }
  const monday = isoDow(date) === 1;
  if (s.remindWeight && monday && !ctx.hasWeightToday && minutes >= 7 * 60 && minutes < 12 * 60) {
    once(`weight:${date}`, { type: 'weight', title: '⚖️ Timbang badan hari Senin', body: 'Catat berat badanmu agar progres terlihat.' });
  }
  if (s.remindWeekly && monday && minutes >= 8 * 60 && minutes < 13 * 60) {
    once(`weekly:${date}`, { type: 'weekly', title: '📈 Laporan minggu lalu siap', body: 'Lihat skor & saran untuk minggu lalu.' });
  }
  return out;
}

// ------------------------------------------------------------------ .ics
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

/** Lipat baris > 75 byte UTF-8 sesuai RFC 5545, tanpa memotong karakter/emoji. */
export function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * Buat isi file kalender berisi pengingat berulang.
 * startDate "YYYY-MM-DD"; appUrl dipakai sebagai tautan di catatan acara.
 */
export function buildIcs(s, { startDate, userName = '', appUrl = '', uidSeed = 'catatmakan' } = {}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = startDate.replace(/-/g, '');
  const events = [];
  const who = userName ? ` (${userName})` : '';
  const ev = (id, time, title, desc, rrule) => {
    const [h, m] = time.split(':');
    events.push([
      'BEGIN:VEVENT',
      `UID:${uidSeed}-${id}@catatmakan`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${pad(h)}${pad(m)}00`,
      'DURATION:PT5M',
      `RRULE:${rrule}`,
      fold(`SUMMARY:${icsEscape(title + who)}`),
      fold(`DESCRIPTION:${icsEscape(desc + (appUrl ? `\nBuka: ${appUrl}` : ''))}`),
      appUrl ? fold(`URL:${appUrl}`) : null,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', fold(`DESCRIPTION:${icsEscape(title)}`), 'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n'));
  };
  if (s.remindMeals) {
    ev('sarapan', s.breakfastTime, '🍳 Catat sarapan', 'Waktunya sarapan — catat di Catat Makan.', 'FREQ=DAILY');
    ev('siang', s.lunchTime, '🍛 Catat makan siang', 'Waktunya makan siang — catat di Catat Makan.', 'FREQ=DAILY');
    ev('malam', s.dinnerTime, '🍲 Catat makan malam', 'Waktunya makan malam — catat di Catat Makan.', 'FREQ=DAILY');
  }
  if (s.remindWater) {
    const step = Math.max(1, s.waterEveryHours);
    for (let h = 8 + step; h <= 21; h += step) ev(`air${h}`, `${pad(h)}:00`, '💧 Minum air', `Minum 1 gelas air, target ${s.targetWater} gelas per hari.`, 'FREQ=DAILY');
  }
  if (s.remindSummary) ev('ringkasan', s.summaryTime, '📊 Cek ringkasan hari ini', 'Lihat total kalori & air hari ini, lengkapi catatan yang terlewat.', 'FREQ=DAILY');
  if (s.remindWeight) ev('timbang', '07:00', '⚖️ Timbang badan', 'Catat berat badan mingguan.', 'FREQ=WEEKLY;BYDAY=MO');
  if (s.remindWeekly) ev('laporan', '08:00', '📈 Laporan mingguan', 'Lihat analisis minggu lalu di tab Analisis.', 'FREQ=WEEKLY;BYDAY=MO');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Catat Makan//Pengingat//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsEscape('Pengingat Catat Makan' + who)}`), ...events, 'END:VCALENDAR', ''].join('\r\n');
}

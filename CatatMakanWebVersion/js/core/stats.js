// Statistik dari catatan pengguna: makanan favorit, beruntun, total harian, lencana pencapaian.
import { total } from './fooddb.js';
import { addDays, today, epochDay } from './util.js';

const alive = (foods) => foods.filter((e) => !e.deleted);

/** Makanan yang sering dicatat (nilai gizi dari catatan terbaru), seperti FoodDao.frequent(). */
export function frequent(foods, limit = 40) {
  const g = new Map();
  for (const e of alive(foods)) {
    const k = String(e.name).trim().toLowerCase();
    if (!k) continue;
    const cur = g.get(k);
    if (!cur) g.set(k, { name: e.name.trim(), meal: e.meal, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, cnt: 1, lastUsed: e.updatedAt || 0 });
    else {
      cur.cnt++;
      if ((e.updatedAt || 0) >= cur.lastUsed) Object.assign(cur, { name: e.name.trim(), meal: e.meal, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, lastUsed: e.updatedAt || 0 });
    }
  }
  return [...g.values()].sort((a, b) => b.cnt - a.cnt || b.lastUsed - a.lastUsed).slice(0, limit);
}

export const loggedDates = (foods) => new Set(alive(foods).map((e) => e.date));

/** Hari beruntun mencatat sampai hari ini (atau kemarin bila hari ini belum mencatat). */
export function streak(dates) {
  let d = today();
  if (!dates.has(d)) d = addDays(d, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function longestStreak(dates) {
  const sorted = [...dates].sort();
  let best = 0; let run = 0; let prev = null;
  for (const d of sorted) {
    run = prev != null && epochDay(d) - epochDay(prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function lastEntry(foods) {
  let best = null;
  for (const e of alive(foods)) if (!best || e.date + e.time > best.date + best.time) best = e;
  return best;
}

export function dailyTotals(foods) {
  const m = new Map();
  for (const e of alive(foods)) m.set(e.date, (m.get(e.date) || 0) + total(e));
  return m;
}

/** Lencana pencapaian (fitur baru versi web). */
export function badges({ foods, waters, weights, settings }) {
  const f = alive(foods);
  const dates = loggedDates(f);
  const longest = longestStreak(dates);
  const totals = dailyTotals(f);
  const target = Math.max(1, settings.targetKcal);
  const onTarget = [...totals.values()].filter((v) => v / target >= 0.8 && v / target <= 1.05).length;
  const waterDays = waters.filter((w) => w.glasses >= settings.targetWater).length;
  const breakfastDays = new Set(f.filter((e) => e.meal === 'Sarapan').map((e) => e.date)).size;
  const variety = new Set(f.map((e) => e.name.trim().toLowerCase())).size;
  const ws = weights.filter((w) => !w.deleted);
  const lastW = ws.length ? ws[ws.length - 1].kg : null;
  const firstW = ws.length ? ws[0].kg : null;
  const goalReached = settings.targetWeight > 0 && lastW != null && firstW != null &&
    (settings.goal > 0 ? lastW <= settings.targetWeight && firstW > settings.targetWeight : Math.abs(lastW - settings.targetWeight) <= 0.5);
  const B = (id, emoji, title, desc, progress, goal) => ({ id, emoji, title, desc, done: progress >= goal, progress: Math.min(progress, goal), goal });
  return [
    B('first', '🌱', 'Langkah pertama', 'Catat makanan pertamamu', f.length, 1),
    B('streak3', '🔥', 'Tiga hari beruntun', 'Mencatat 3 hari berturut-turut', longest, 3),
    B('streak7', '🏅', 'Seminggu penuh', 'Mencatat 7 hari berturut-turut', longest, 7),
    B('streak30', '🏆', 'Sebulan konsisten', 'Mencatat 30 hari berturut-turut', longest, 30),
    B('target10', '🎯', 'Tepat sasaran', '10 hari kalori sesuai target', onTarget, 10),
    B('water7', '💧', 'Raja hidrasi', '7 hari minum air sesuai target', waterDays, 7),
    B('breakfast7', '🍳', 'Sarapan juara', 'Sarapan tercatat di 7 hari', breakfastDays, 7),
    B('weigh4', '⚖️', 'Rajin menimbang', 'Catat berat badan 4 kali', ws.length, 4),
    B('variety20', '🥗', 'Menu beragam', '20 jenis makanan berbeda', variety, 20),
    B('foods100', '📒', 'Pencatat setia', '100 catatan makanan', f.length, 100),
    B('goal', '🌟', 'Target tercapai', 'Mencapai berat target', goalReached ? 1 : 0, 1),
  ];
}

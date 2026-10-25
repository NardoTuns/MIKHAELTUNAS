// "Catat cepat": teks bebas → catatan makanan (port QuickLog.kt, dulu dari balasan notifikasi).
// Contoh: "2 tempe goreng, nasi, teh tawar" atau "setengah mangkuk bakso dan 1/2 piring capcay".
import { FOOD_DB } from './fooddb.js';

const NUM_WORDS = {
  '½': 0.5, setengah: 0.5, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
  sepiring: 1, semangkuk: 1, semangkok: 1, segelas: 1, secangkir: 1,
  sebuah: 1, sepotong: 1, sebutir: 1, sebungkus: 1, seporsi: 1,
};
const UNITS = new Set([
  'porsi', 'piring', 'mangkuk', 'mangkok', 'gelas', 'cangkir', 'buah', 'potong', 'butir', 'bungkus',
  'x', 'kali', 'cup', 'sendok', 'biji', 'tusuk', 'lembar', 'ekor', 'bks', 'pcs',
]);

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function parse(raw) {
  const words = raw.split(/\s+/);
  let portion = 1;
  const first = words[0].toLowerCase();
  let n;
  if (/^\d+x$/.test(first)) n = Number(first.slice(0, -1));
  else if (first === '1/2') n = 0.5;
  else {
    const v = Number(first.replace(',', '.'));
    n = first !== '' && Number.isFinite(v) ? v : NUM_WORDS[first];
  }
  if (n != null && words.length > 1) {
    portion = Math.min(10, Math.max(0.25, n));
    words.shift();
    if (words.length > 1 && UNITS.has(words[0].toLowerCase())) words.shift();
  }
  return { portion, name: cap(words.join(' ').trim()) };
}

export function splitQuick(text) {
  return String(text || '')
    .split(/[,;+\n]|\s+dan\s+|\s+&\s+/i)
    .map((x) => x.trim().replace(/\.+$/, ''))
    .filter((x) => x.length >= 2)
    .slice(0, 8)
    .map(parse)
    .filter((i) => i.name);
}

/**
 * Cocokkan tiap item dengan catatan sendiri (frequent), lalu database bawaan.
 * Item yang tidak dikenal dikembalikan dengan ref = null (bisa dicari online oleh pemanggil).
 */
export function matchLocal(items, frequent) {
  return items.map((i) => {
    const q = i.name.toLowerCase();
    const mine = frequent.find((f) => f.name.toLowerCase() === q)
      || frequent.find((f) => f.name.toLowerCase().startsWith(q))
      || frequent.find((f) => f.name.length >= q.length * 0.6 && q.includes(f.name.toLowerCase()));
    if (mine) return { ...i, ref: { name: mine.name, kcal: mine.kcal, protein: mine.protein, carbs: mine.carbs, fat: mine.fat, note: '' } };
    const db = FOOD_DB.find((f) => f.name.toLowerCase() === q)
      || FOOD_DB.find((f) => f.name.toLowerCase().startsWith(q))
      || FOOD_DB.find((f) => f.name.toLowerCase().includes(q));
    if (db) return { ...i, ref: { name: db.name, kcal: db.kcal, protein: db.protein, carbs: db.carbs, fat: db.fat, note: db.portion } };
    return { ...i, ref: null };
  });
}

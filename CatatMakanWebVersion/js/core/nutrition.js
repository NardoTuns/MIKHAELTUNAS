// Perhitungan gizi (port dari Nutrition.kt): IMT Asia-Pasifik, Mifflin-St Jeor, target makro.

export const ACTIVITY = [
  [1.2, 'Jarang bergerak (kerja duduk)'],
  [1.375, 'Ringan (olahraga 1–3x/minggu)'],
  [1.55, 'Sedang (olahraga 3–5x/minggu)'],
  [1.725, 'Aktif (olahraga hampir tiap hari)'],
];
export const GOALS = [
  [0, 'Jaga berat badan'],
  [-250, 'Turun pelan (±¼ kg/minggu)'],
  [-500, 'Turun (±½ kg/minggu)'],
];

/** Pembagian kalori per waktu makan (pola gizi seimbang). */
export const MEAL_SHARE = { Sarapan: 0.25, 'Makan Siang': 0.35, 'Makan Malam': 0.25, Camilan: 0.15 };

export const KCAL_PER_KG = 7700;
export const GLASS_ML = 250;

/** Pengaturan bawaan satu pengguna (setara data class Settings Android). */
export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  targetKcal: 1800,
  targetWater: 8,
  onlineSuggest: true,
  remindMeals: true,
  breakfastTime: '07:00',
  lunchTime: '12:00',
  dinnerTime: '18:30',
  remindWater: true,
  waterEveryHours: 2,
  remindSummary: true,
  summaryTime: '20:30',
  remindWeight: true,
  remindWeekly: true,
  gender: '', // "P" pria, "W" wanita
  age: 0,
  heightCm: 0,
  activity: 1,
  goal: 1,
  targetWeight: 0,
  fastingHours: 0, // 0 = penghitung puasa tidak ditampilkan (fitur web)
});

export const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

export const minSafeKcal = (gender) => (gender === 'P' ? 1500 : 1200);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** level 0 kurang, 1 normal, 2 berisiko, 3 obesitas I, 4 obesitas II */
export function bmiOf(kg, heightCm) {
  if (!(kg > 0) || !(heightCm >= 100)) return null;
  const m = heightCm / 100;
  const value = kg / (m * m);
  let category; let level;
  if (value < 18.5) { category = 'Berat badan kurang'; level = 0; }
  else if (value < 23) { category = 'Normal'; level = 1; }
  else if (value < 25) { category = 'Berlebih (berisiko)'; level = 2; }
  else if (value < 30) { category = 'Obesitas I'; level = 3; }
  else { category = 'Obesitas II'; level = 4; }
  return { value, category, level };
}

export function needs(s, latestKg) {
  const w = latestKg != null && latestKg >= 25 && latestKg <= 350 ? latestKg : null;
  const bmi = w != null ? bmiOf(w, s.heightCm) : null;
  const h = s.heightCm / 100;
  const idealMin = s.heightCm >= 100 ? 18.5 * h * h : null;
  const idealMax = s.heightCm >= 100 ? 22.9 * h * h : null;
  const complete = !!s.gender && s.age >= 18 && s.age <= 90 && s.heightCm >= 120 && s.heightCm <= 230 && w != null;
  const male = s.gender === 'P';
  const floor = minSafeKcal(s.gender);
  let bmr = null; let tdee = null; let rec = null;
  if (complete) {
    bmr = 10 * w + 6.25 * s.heightCm - 5 * s.age + (male ? 5 : -161);
    tdee = bmr * ACTIVITY[clamp(s.activity, 0, 3)][0];
    const raw = tdee + GOALS[clamp(s.goal, 0, 2)][0];
    rec = Math.round(Math.max(raw, floor) / 50) * 50;
  }
  const kcal = Math.max(s.targetKcal, 800);
  const proteinRaw = w != null ? w * (s.goal > 0 ? 1.2 : 1.0) : (kcal * 0.18) / 4;
  const protein = clamp(proteinRaw, (kcal * 0.12) / 4, (kcal * 0.3) / 4);
  const fat = (kcal * 0.25) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const water = w != null ? clamp(Math.ceil((w * 30) / GLASS_ML), 6, 14) : s.targetWater;
  return {
    profileComplete: complete, weight: w, bmi, idealMin, idealMax, bmr, tdee, recommendedKcal: rec,
    targetKcal: s.targetKcal, proteinG: protein, carbsG: carbs, fatG: fat, waterGlasses: water, floorKcal: floor,
    /** Perkiraan perubahan berat per minggu bila makan tepat sesuai target (negatif = turun). */
    weeklyAtTarget: tdee != null ? ((s.targetKcal - tdee) * 7) / KCAL_PER_KG : null,
  };
}

/** Persentase energi dari protein/karbo/lemak → [p, c, f]. */
export function energySplit(protein, carbs, fat) {
  const p = protein * 4; const c = carbs * 4; const f = fat * 9;
  const t = p + c + f;
  if (t <= 0) return [0, 0, 0];
  return [(p / t) * 100, (c / t) * 100, (f / t) * 100];
}

/** Kalkulator target (dialog "Hitung target otomatis"). Mengembalikan null bila data belum lengkap. */
export function calcTarget({ gender, age, heightCm, weightKg, activity, goal }) {
  const valid = !!gender && age >= 18 && age <= 90 && heightCm >= 120 && heightCm <= 230 && weightKg >= 30 && weightKg <= 300;
  if (!valid) return null;
  const male = gender === 'P';
  const floor = male ? 1500 : 1200;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (male ? 5 : -161);
  const maintain = Math.trunc(bmr * ACTIVITY[activity][0]);
  const raw = maintain + GOALS[goal][0];
  return { target: Math.round(Math.max(raw, floor) / 50) * 50, maintain, floor };
}

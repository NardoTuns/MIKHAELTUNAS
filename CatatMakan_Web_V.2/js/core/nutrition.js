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

/** Anak & remaja 1–17 tahun: kebutuhan memakai AKG, bukan rumus dewasa. */
export const isChild = (s) => s.age >= 1 && s.age <= 17;

const akg = (group, kcal, protein, fat, carbs, fiber, waterMl) => ({ group, kcal, protein, fat, carbs, fiber, waterMl });

/** Angka Kecukupan Gizi per hari (Permenkes RI No. 28 Tahun 2019), sama dengan aplikasi Android. */
export function akgOf(gender, age) {
  const male = gender === 'P';
  if (!(age >= 1)) return null;
  if (age <= 3) return akg('anak 1–3 tahun', 1350, 20, 45, 215, 19, 1150);
  if (age <= 6) return akg('anak 4–6 tahun', 1400, 25, 50, 220, 20, 1450);
  if (age <= 9) return akg('anak 7–9 tahun', 1650, 40, 55, 250, 23, 1650);
  if (!gender) return null;
  if (male) {
    if (age <= 12) return akg('laki-laki 10–12 tahun', 2000, 50, 65, 300, 28, 1850);
    if (age <= 15) return akg('laki-laki 13–15 tahun', 2400, 70, 80, 350, 34, 2100);
    if (age <= 18) return akg('laki-laki 16–18 tahun', 2650, 75, 85, 400, 37, 2300);
    if (age <= 29) return akg('laki-laki 19–29 tahun', 2650, 65, 75, 430, 37, 2500);
    if (age <= 49) return akg('laki-laki 30–49 tahun', 2550, 65, 70, 415, 36, 2500);
    if (age <= 64) return akg('laki-laki 50–64 tahun', 2150, 65, 60, 340, 30, 2500);
    if (age <= 80) return akg('laki-laki 65–80 tahun', 1800, 64, 50, 275, 25, 1800);
    return akg('laki-laki 80+ tahun', 1600, 64, 45, 235, 22, 1600);
  }
  if (age <= 12) return akg('perempuan 10–12 tahun', 1900, 55, 65, 280, 27, 1850);
  if (age <= 15) return akg('perempuan 13–15 tahun', 2050, 65, 70, 300, 29, 2100);
  if (age <= 18) return akg('perempuan 16–18 tahun', 2100, 65, 70, 300, 29, 2150);
  if (age <= 29) return akg('perempuan 19–29 tahun', 2250, 60, 65, 360, 32, 2350);
  if (age <= 49) return akg('perempuan 30–49 tahun', 2150, 60, 60, 340, 30, 2350);
  if (age <= 64) return akg('perempuan 50–64 tahun', 1800, 60, 50, 280, 25, 2350);
  if (age <= 80) return akg('perempuan 65–80 tahun', 1550, 58, 45, 230, 22, 1550);
  return akg('perempuan 80+ tahun', 1400, 58, 40, 200, 20, 1400);
}

/** Energi basal anak & remaja (rumus Schofield/WHO, berdasarkan berat). */
export function schofieldBmr(male, age, kg) {
  if (age < 3) return male ? 59.512 * kg - 30.4 : 58.317 * kg - 31.1;
  if (age < 10) return male ? 22.706 * kg + 504.3 : 20.315 * kg + 485.9;
  return male ? 17.686 * kg + 658.2 : 13.384 * kg + 692.6;
}

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

/** Anak & remaja: energi, protein & air dari AKG 2019; tidak ada target turun berat. */
function childNeeds(s, latestKg) {
  const w = latestKg != null && latestKg >= 5 && latestKg <= 200 ? latestKg : null;
  const a = akgOf(s.gender, s.age);
  const complete = !!a && !!s.gender && s.heightCm >= 50 && s.heightCm <= 220 && w != null;
  const bmr = w != null && s.gender ? schofieldBmr(s.gender === 'P', s.age, w) : null;
  const tdee = a ? a.kcal : null;
  const rec = a ? Math.round(a.kcal / 50) * 50 : null;
  const floor = a ? Math.round((a.kcal * 0.8) / 50) * 50 : 1000;
  const kcal = Math.max(s.targetKcal, 800);
  const protein = a ? a.protein : (kcal * 0.15) / 4;
  const fat = (kcal * 0.3) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const water = a ? Math.ceil(a.waterMl / GLASS_ML) : s.targetWater;
  const childBmi = w != null && s.heightCm >= 50 ? w / ((s.heightCm / 100) ** 2) : null;
  return {
    profileComplete: complete, weight: w, bmi: null, idealMin: null, idealMax: null, bmr, tdee, recommendedKcal: rec,
    targetKcal: s.targetKcal, proteinG: protein, carbsG: carbs, fatG: fat, waterGlasses: water, floorKcal: floor,
    weeklyAtTarget: null, child: true, akg: a, childBmi,
  };
}

export function needs(s, latestKg) {
  if (isChild(s)) return childNeeds(s, latestKg);
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
    child: false, akg: akgOf(s.gender, s.age), childBmi: null,
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
  if (age >= 1 && age <= 17) {
    const a = akgOf(gender, age);
    const ok = !!a && !!gender && heightCm >= 50 && heightCm <= 220 && weightKg >= 5 && weightKg <= 200;
    if (!ok) return null;
    return { target: Math.round(a.kcal / 50) * 50, maintain: a.kcal, floor: Math.round((a.kcal * 0.8) / 50) * 50, child: true, akg: a, waterGlasses: Math.ceil(a.waterMl / GLASS_ML) };
  }
  const valid = !!gender && age >= 18 && age <= 90 && heightCm >= 120 && heightCm <= 230 && weightKg >= 30 && weightKg <= 300;
  if (!valid) return null;
  const male = gender === 'P';
  const floor = male ? 1500 : 1200;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (male ? 5 : -161);
  const maintain = Math.trunc(bmr * ACTIVITY[activity][0]);
  const raw = maintain + GOALS[goal][0];
  return { target: Math.round(Math.max(raw, floor) / 50) * 50, maintain, floor };
}

// Analisis pola makan offline (port setia dari Analyzer.kt Android).
import { MEALS, total } from './fooddb.js';
import { needs as calcNeeds, energySplit, KCAL_PER_KG, MEAL_SHARE } from './nutrition.js';
import { today, isoDow, epochDay, nowHour, fmt, dec, signed } from './util.js';

const inRange = (v, lo, hi) => v >= lo && v <= hi;
const avgOf = (arr, f) => (arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const firstMax = (arr, f) => arr.reduce((b, x) => (b == null || f(x) > f(b) ? x : b), null);
const firstMin = (arr, f) => arr.reduce((b, x) => (b == null || f(x) < f(b) ? x : b), null);

export function isLate(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!m) return false;
  const h = Number(m[1]);
  return h >= 21 || h < 3;
}

const insight = (emoji, title, text, tone = 'INFO') => ({ emoji, title, text, tone });

/**
 * Bangun laporan periode.
 * foods: catatan makan (tidak terhapus) di periode; waters: [{date, glasses}];
 * weights: [{date, kg}] terurut tanggal (semua, tidak terhapus); s: pengaturan pengguna.
 */
export function buildReport(period, foods, waters, weights, s, { dayFinished = false } = {}) {
  const t = today();
  const byDate = new Map();
  for (const f of foods) { if (!byDate.has(f.date)) byDate.set(f.date, []); byDate.get(f.date).push(f); }
  const waterBy = new Map(waters.map((w) => [w.date, w.glasses]));

  const days = period.days().map((d) => {
    const list = byDate.get(d) || [];
    const meals = {};
    for (const m of MEALS) meals[m] = sum(list.filter((e) => e.meal === m), total);
    return {
      date: d,
      kcal: sum(list, total),
      protein: sum(list, (e) => e.protein * e.portion),
      carbs: sum(list, (e) => e.carbs * e.portion),
      fat: sum(list, (e) => e.fat * e.portion),
      water: waterBy.get(d) || 0,
      items: list.length,
      meals,
      late: list.some((e) => isLate(e.time)),
      get logged() { return this.items > 0; },
    };
  });
  const logged = days.filter((d) => d.items > 0);
  const statDays = period.type !== 'D' && logged.some((d) => d.date !== t) ? logged.filter((d) => d.date !== t) : logged;
  const todayExcluded = statDays.length < logged.length;
  const partial = period.type === 'D' && period.start === t && !dayFinished;

  const eff = period.effectiveEnd;
  const latest = [...weights].reverse().find((w) => w.date <= eff) || weights[weights.length - 1];
  const nd = calcNeeds(s, latest ? latest.kg : null);
  const target = Math.max(s.targetKcal, 1);

  const n = statDays.length;
  const avg = (f) => (n === 0 ? 0 : sum(statDays, f) / n);
  const avgKcal = avg((d) => d.kcal);
  const avgP = avg((d) => d.protein);
  const avgC = avg((d) => d.carbs);
  const avgF = avg((d) => d.fat);
  const avgW = avg((d) => d.water);

  const onTarget = statDays.filter((d) => inRange(d.kcal / target, 0.8, 1.05)).length;
  const over = statDays.filter((d) => d.kcal / target > 1.05).length;
  const under = statDays.filter((d) => d.kcal / target < 0.8).length;
  const waterOk = statDays.filter((d) => d.water >= s.targetWater).length;

  const mealAvg = {};
  for (const m of MEALS) mealAvg[m] = avg((d) => d.meals[m] || 0);

  const groups = new Map();
  for (const f of foods) {
    const k = String(f.name).trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, { name: String(f.name).trim(), count: 0, kcal: 0 });
    const g = groups.get(k); g.count++; g.kcal += total(f);
  }
  const gl = [...groups.values()];
  const topByKcal = [...gl].sort((a, b) => b.kcal - a.kcal).slice(0, 8);
  const topByCount = [...gl].sort((a, b) => b.count - a.count || b.kcal - a.kcal).slice(0, 8);

  const highest = n >= 2 ? firstMax(statDays, (d) => d.kcal) : null;
  const lowest = n >= 2 ? firstMin(statDays, (d) => d.kcal) : null;

  const weekend = statDays.filter((d) => isoDow(d.date) >= 6);
  const weekday = statDays.filter((d) => isoDow(d.date) < 6);
  const weekendAvg = weekend.length && weekday.length ? avgOf(weekend, (d) => d.kcal) : null;
  const weekdayAvg = weekendAvg != null ? avgOf(weekday, (d) => d.kcal) : null;

  const breakfastDays = statDays.filter((d) => (d.meals.Sarapan || 0) > 0).length;
  const lateDays = statDays.filter((d) => d.late).length;

  // Berat dalam periode (dibanding catatan terakhir sebelum periode)
  const inR = weights.filter((w) => w.date >= period.start && w.date <= eff);
  const before = [...weights].reverse().find((w) => w.date < period.start);
  const wStart = (before || inR[0])?.kg ?? null;
  const wEnd = inR.length ? inR[inR.length - 1].kg : null;
  const wChange = wStart != null && wEnd != null && (before || inR.length >= 2) ? wEnd - wStart : null;

  const kgPerWeek = nd.tdee != null && !(n === 0 || partial) ? ((avgKcal - nd.tdee) * 7) / KCAL_PER_KG : null;
  let weeksToGoal = null;
  if (nd.weight != null && s.targetWeight > 0) {
    const rate = kgPerWeek ?? nd.weeklyAtTarget;
    if (rate != null) {
      const diff = s.targetWeight - nd.weight;
      if (!(Math.abs(diff) < 0.3 || rate === 0 || diff / rate <= 0)) weeksToGoal = diff / rate;
    }
  }

  // ---------- Skor 0–100 ----------
  const parts = [];
  if (n > 0) {
    const cal = avgOf(statDays, (d) => {
      const r = d.kcal / target;
      if (inRange(r, 0.85, 1.05)) return 1;
      if (inRange(r, 0.75, 1.15)) return 0.6;
      return 0.25;
    });
    parts.push({ label: 'Kalori sesuai target', got: cal * 40, max: 40 });
    parts.push({ label: 'Protein cukup', got: Math.min(1, Math.max(0, avgP / nd.proteinG)) * 20, max: 20 });
    const [, cPct, fPct] = energySplit(avgP, avgC, avgF);
    const band = (v, lo, hi) => (inRange(v, lo, hi) ? 1 : Math.min(1, Math.max(0, 1 - Math.min(Math.abs(v - lo), Math.abs(v - hi)) / 15)));
    const macro = avgP + avgC + avgF <= 0 ? 0.5 : (band(cPct, 45, 65) + band(fPct, 20, 35)) / 2;
    parts.push({ label: 'Komposisi makro seimbang', got: macro * 15, max: 15 });
    parts.push({ label: 'Minum air', got: Math.min(1, Math.max(0, avgW / Math.max(s.targetWater, 1))) * 15, max: 15 });
    let consist;
    if (period.type === 'D') {
      const d = statDays[0];
      consist = ['Sarapan', 'Makan Siang', 'Makan Malam'].filter((m) => (d.meals[m] || 0) > 0).length / 3;
    } else {
      const base = Math.max(1, period.elapsedDays - (todayExcluded ? 1 : 0));
      consist = Math.min(1, Math.max(0, n / base));
    }
    parts.push({ label: period.type === 'D' ? 'Makan teratur' : 'Rajin mencatat', got: consist * 10, max: 10 });
  }
  const score = Math.min(100, Math.max(0, Math.round(sum(parts, (p) => p.got))));

  const r = {
    period, settings: s, needs: nd, days, foods, statDays, todayExcluded, partial,
    totalKcal: sum(days, (d) => d.kcal), avgKcal, avgProtein: avgP, avgCarbs: avgC, avgFat: avgF, avgWater: avgW,
    waterOkDays: waterOk, onTargetDays: onTarget, overDays: over, underDays: under, mealAvg, topByKcal, topByCount,
    highestDay: highest, lowestDay: lowest, weekdayAvg, weekendAvg, breakfastDays, lateDays,
    weightStart: wStart, weightEnd: wEnd, weightChange: wChange, kgPerWeek, weeksToGoal,
    score, scoreParts: parts, good: [], improve: [], tips: [], menuIdeas: [],
  };
  r.loggedDays = logged.length;
  r.hasData = statDays.length > 0;
  r.split = energySplit(avgP, avgC, avgF);
  r.remainingToday = period.type === 'D' && period.start === t ? s.targetKcal - r.totalKcal : null;
  r.menuIdeas = menuIdeas(r);
  const [good, improve, tips] = insights(r, r.menuIdeas);
  r.good = good; r.improve = improve; r.tips = tips;
  return r;
}

export function scoreLabel(r) {
  if (!r.hasData) return 'Belum ada data';
  if (r.score >= 85) return 'Sangat baik';
  if (r.score >= 70) return 'Baik';
  if (r.score >= 50) return 'Cukup';
  return 'Perlu perbaikan';
}

// ------------------------------------------------------------------
// Insight & rekomendasi berbasis aturan (offline)
// ------------------------------------------------------------------
const SWAPS = [
  [['teh manis', 'es teh', 'kopi susu', 'jus', 'sirup', 'boba', 'soda', 'milk tea', 'es jeruk', 'thai tea', 'minuman', 'cokelat', 'coklat', 'susu kental'],
    'minta gula setengah atau pilih tawar. Teh manis ±90 kkal, teh tawar hanya ±2 kkal.'],
  [['gorengan', 'goreng', 'bakwan', 'tahu isi', 'risol', 'cireng', 'kerupuk', 'keripik', 'tempura', 'crispy', 'geprek'],
    'pilih versi bakar, rebus, kukus, atau pepes — hemat ±80–150 kkal per porsi.'],
  [['santan', 'rendang', 'gulai', 'opor', 'lodeh', 'kari', 'nasi uduk', 'nasi padang', 'nasi lemak'],
    'ambil kuah santannya sedikit, atau ganti dengan sayur bening/sayur asem.'],
  [['martabak', 'donat', 'kue', 'roti manis', 'es krim', 'biskuit', 'cake', 'brownies', 'bolu', 'wafer', 'coklat batang', 'permen'],
    'ganti dengan buah potong, yogurt plain, atau ubi/jagung rebus (<150 kkal).'],
  [['mie', 'mi ', 'indomie', 'bakmi', 'kwetiau', 'bihun'],
    'batasi 2–3x seminggu, tambah sayur & telur, pakai bumbu/minyak setengah saja.'],
  [['nasi'], 'kurangi ¼ piring dan ganti dengan sayur — hemat ±50 kkal tiap makan, tetap kenyang.'],
];

export function swapFor(name) {
  const n = ' ' + String(name).toLowerCase() + ' ';
  const sw = SWAPS.find(([keys]) => keys.some((k) => n.includes(k)));
  return sw ? sw[1] : null;
}

function insights(r, ideas) {
  const good = []; const bad = []; const tips = [];
  const s = r.settings; const nd = r.needs;
  const n = r.statDays.length;
  const day = r.period.type === 'D';
  const unit = day ? '' : '/hari';

  if (!nd.profileComplete) {
    tips.push(insight('👤', 'Lengkapi profil',
      'Isi jenis kelamin, umur, tinggi, dan catat berat badan agar kebutuhan kalori, IMT, dan proyeksi berat bisa dihitung.'));
  }
  if (n === 0) {
    tips.push(insight('📝', 'Belum ada catatan', day
      ? 'Belum ada makanan yang dicatat di hari ini. Catat setiap makan agar analisis & saran muncul.'
      : 'Belum ada makanan yang dicatat di periode ini. Analisis muncul setelah ada catatan.'));
    if (ideas.length) tips.push(menuTip(r, ideas));
    return [good, bad, tips];
  }

  const target = s.targetKcal;
  const [pPct, cPct, fPct] = r.split;
  const hasMacro = r.avgProtein + r.avgCarbs + r.avgFat > 0;

  // ----- Kalori -----
  if (r.partial) {
    const left = target - r.totalKcal;
    if (left >= 0) good.push(insight('🎯', 'Masih dalam target', `Sudah ${fmt(r.totalKcal)} kkal, sisa ${fmt(left)} kkal untuk hari ini.`, 'GOOD'));
    else bad.push(insight('🔥', 'Melewati target hari ini', `Sudah ${fmt(r.totalKcal)} kkal, lebih ${fmt(-left)} kkal dari target ${fmt(target)} kkal.`, 'WARN'));
  } else if (r.avgKcal > target * 1.1) {
    bad.push(insight('🔥', 'Kalori melebihi target',
      (day ? `Total ${fmt(r.avgKcal)} kkal` : `Rata-rata ${fmt(r.avgKcal)} kkal/hari`) + `, lebih ±${fmt(r.avgKcal - target)} kkal dari target ${fmt(target)} kkal.`, 'WARN'));
  } else if (!day && n >= 2 && r.onTargetDays >= n * 0.7) {
    good.push(insight('🎯', 'Konsisten dengan target', `${r.onTargetDays} dari ${n} hari kalori sesuai target (80–105%).`, 'GOOD'));
  } else if (day && inRange(r.avgKcal / target, 0.8, 1.05)) {
    good.push(insight('🎯', 'Kalori pas dengan target', `Total ${fmt(r.avgKcal)} dari ${fmt(target)} kkal.`, 'GOOD'));
  }
  if (!r.partial && r.avgKcal < nd.floorKcal) {
    bad.push(insight('⚠️', 'Asupan terlalu rendah',
      (day ? `Hanya ${fmt(r.avgKcal)} kkal` : `Rata-rata hanya ${fmt(r.avgKcal)} kkal/hari`) +
      `, di bawah batas aman ${fmt(nd.floorKcal)} kkal. Makan terlalu sedikit bisa membuat lemas, kehilangan otot, ` +
      'dan metabolisme melambat. Jika ada makanan yang belum dicatat, lengkapi dulu agar analisis akurat.', 'WARN'));
    tips.push(insight('🍽️', 'Naikkan asupan bertahap',
      'Pastikan tiap makan utama ada nasi/karbo ½–¾ piring + lauk protein + sayur. Tambah camilan sehat seperti buah atau yogurt.'));
  }

  // ----- Protein & makro -----
  if (hasMacro) {
    if (r.avgProtein >= nd.proteinG * 0.9 && !r.partial) {
      good.push(insight('💪', 'Protein tercukupi', `Rata-rata ${fmt(r.avgProtein)} g${unit} (target ±${fmt(nd.proteinG)} g). Bagus untuk menjaga otot saat diet.`, 'GOOD'));
    } else if (r.avgProtein < nd.proteinG * 0.8 && !r.partial) {
      bad.push(insight('🥚', 'Protein kurang', `Rata-rata ${fmt(r.avgProtein)} g${unit}, target ±${fmt(nd.proteinG)} g.`, 'WARN'));
      tips.push(insight('🥚', 'Tambah lauk protein di tiap makan',
        'Telur 1 butir (6 g), tempe 2 potong (12 g), tahu 2 potong (10 g), dada ayam 100 g (31 g), ikan 1 potong (±20 g). ' +
        'Tempe & tahu murah dan tinggi protein.'));
    }
    if (fPct > 35) bad.push(insight('🧈', 'Lemak terlalu tinggi', `${Math.round(fPct)}% energi dari lemak (anjuran 20–35%).`, 'WARN'));
    if (cPct > 65) bad.push(insight('🍚', 'Karbohidrat dominan', `${Math.round(cPct)}% energi dari karbohidrat (anjuran 45–65%). Tambah lauk & sayur, kurangi nasi/gula.`, 'WARN'));
    if (inRange(fPct, 20, 35) && inRange(cPct, 45, 65) && pPct >= 10) {
      good.push(insight('🥗', 'Komposisi gizi seimbang', `Protein ${Math.round(pPct)}% · Karbo ${Math.round(cPct)}% · Lemak ${Math.round(fPct)}% dari energi.`, 'GOOD'));
    }
  } else {
    tips.push(insight('🔬', 'Isi detail gizi',
      'Protein/karbo/lemak belum diisi di catatanmu. Gunakan saran AI atau isi "Detail gizi" agar analisis gizi lebih lengkap.'));
  }

  // ----- Air -----
  if (!r.partial || r.avgWater >= s.targetWater) {
    if (r.avgWater >= s.targetWater) {
      good.push(insight('💧', 'Minum air cukup', `Rata-rata ${dec(r.avgWater)} gelas${unit} (target ${s.targetWater}).`, 'GOOD'));
    } else if (r.avgWater < s.targetWater * 0.75) {
      bad.push(insight('💧', 'Kurang minum air', `Rata-rata ${dec(r.avgWater)} dari ${s.targetWater} gelas${unit}.`, 'WARN'));
      tips.push(insight('💧', 'Biasakan minum terjadwal',
        'Minum 1 gelas saat bangun, sebelum tiap makan, dan setelah ke kamar mandi. Aktifkan pengingat air dan ketuk +1 gelas.'));
    }
  }

  // ----- Pola makan -----
  if (!day && n >= 3) {
    if (r.breakfastDays < n * 0.5) {
      bad.push(insight('🍳', 'Sering melewatkan sarapan', `Sarapan hanya ${r.breakfastDays} dari ${n} hari.`, 'WARN'));
      tips.push(insight('🍳', 'Sarapan sederhana ±300 kkal', 'Oatmeal + pisang, roti gandum + telur, atau nasi ½ piring + telur + sayur. Sarapan membantu tidak kalap saat siang.'));
    } else if (r.breakfastDays >= n * 0.8) {
      good.push(insight('🍳', 'Rutin sarapan', `Sarapan ${r.breakfastDays} dari ${n} hari.`, 'GOOD'));
    }
  } else if (day && !r.partial && (r.statDays[0].meals.Sarapan || 0) <= 0) {
    bad.push(insight('🍳', 'Tidak sarapan', 'Tidak ada sarapan yang tercatat di hari ini.', 'WARN'));
  }
  if (r.lateDays > 0 && (day || r.lateDays >= 2)) {
    bad.push(insight('🌙', 'Makan larut malam', day ? 'Ada makanan yang dicatat di atas jam 21.00.' : `${r.lateDays} hari ada makan di atas jam 21.00.`, 'WARN'));
    tips.push(insight('🌙', 'Tutup dapur lebih awal', 'Usahakan makan terakhir 2–3 jam sebelum tidur. Jika lapar malam, pilih buah, susu rendah lemak, atau telur rebus.'));
  }
  const snack = r.mealAvg.Camilan || 0;
  if (r.avgKcal > 0 && snack / r.avgKcal > 0.25) {
    bad.push(insight('🍪', 'Camilan cukup banyak', `${Math.round((snack / r.avgKcal) * 100)}% kalori dari camilan (anjuran ±10–15%).`, 'WARN'));
    tips.push(insight('🍎', 'Siapkan camilan <150 kkal', 'Buah potong, yogurt plain, jagung/ubi rebus, atau kacang 1 genggam kecil. Simpan camilan manis di tempat yang tidak terlihat.'));
  }
  if (r.weekendAvg != null && r.weekdayAvg != null && r.weekendAvg > r.weekdayAvg * 1.15) {
    bad.push(insight('📅', 'Akhir pekan lebih boros', `Rata-rata akhir pekan ${fmt(r.weekendAvg)} kkal vs hari kerja ${fmt(r.weekdayAvg)} kkal.`, 'WARN'));
    tips.push(insight('📅', 'Rencanakan akhir pekan', 'Saat makan di luar pilih menu bakar/kukus, bagi porsi, dan hindari minuman manis. Tidak apa sesekali — kembali ke pola biasa esoknya.'));
  }
  if (!day) {
    const base = Math.max(1, r.period.elapsedDays - (r.todayExcluded ? 1 : 0));
    if (base >= 3 && n < base * 0.6) bad.push(insight('📝', 'Banyak hari belum tercatat', `Tercatat ${n} dari ${base} hari. Data yang lengkap membuat analisis lebih tepat.`, 'WARN'));
    else if (base >= 3 && n >= base * 0.85) good.push(insight('📝', 'Rajin mencatat', `Tercatat ${n} dari ${base} hari. Pertahankan!`, 'GOOD'));
  }

  // ----- Berat badan -----
  if (r.weightChange != null) {
    const d = r.weightChange;
    if (d <= -0.2) good.push(insight('⚖️', 'Berat turun', `${signed(d)} kg di periode ini (${dec(r.weightStart ?? 0)} → ${dec(r.weightEnd ?? 0)} kg).`, 'GOOD'));
    else if (d >= 0.3 && s.goal > 0) bad.push(insight('⚖️', 'Berat naik', `${signed(d)} kg di periode ini. Cek lagi porsi & camilan, atau kemungkinan retensi air.`, 'WARN'));
  }

  // ----- Penyumbang kalori terbesar → saran tukar -----
  const used = new Set();
  for (const f of r.topByKcal.slice(0, 5)) {
    const tip = swapFor(f.name);
    if (!tip) continue;
    if (used.size < 2 && !used.has(tip)) {
      used.add(tip);
      tips.push(insight('🔁', `Tukar: ${f.name}`, `Menyumbang ${fmt(f.kcal)} kkal (${f.count}x). Saran: ${tip}`));
    }
  }
  if (!r.partial && r.avgKcal > target * 1.1 && used.size === 0) {
    tips.push(insight('✂️', `Kurangi ±${fmt(r.avgKcal - target)} kkal/hari`, 'Kecilkan porsi nasi, kurangi gorengan & minuman manis, dan perbanyak sayur agar tetap kenyang.'));
  }

  // ----- Proyeksi -----
  if (r.kgPerWeek != null) {
    const k = r.kgPerWeek;
    const txt = k <= -0.05 ? `Dengan pola ini, berat diperkirakan turun ±${dec(-k, 2)} kg/minggu.`
      : k >= 0.05 ? `Dengan pola ini, berat diperkirakan naik ±${dec(k, 2)} kg/minggu.`
        : 'Dengan pola ini, berat diperkirakan stabil.';
    const goal = r.weeksToGoal != null ? ` Target ${dec(s.targetWeight)} kg tercapai ±${dec(r.weeksToGoal, 0)} minggu lagi.` : '';
    tips.push(insight('📈', 'Proyeksi berat', txt + goal + (k < -1 ? ' Penurunan >1 kg/minggu terlalu cepat; tambah asupan sedikit.' : '')));
  }

  if (ideas.length) tips.push(menuTip(r, ideas));
  if (bad.length === 0 && good.length > 0) {
    tips.push(insight('🌟', 'Pertahankan!', 'Pola makanmu sudah baik. Lanjutkan konsistensi mencatat dan variasikan sayur & buah.'));
  }
  return [good, bad, tips];
}

function menuTip(r, ideas) {
  const left = r.remainingToday;
  const title = left != null && left > 0 ? `Ide menu · sisa ${fmt(left)} kkal` : 'Ide menu seimbang';
  return insight('🍱', title, ideas.map((i) => `• ${i.meal}: ${i.menu} (±${fmt(i.kcal)} kkal)`).join('\n'));
}

// ------------------------------------------------------------------
// Ide menu (makanan Indonesia sehari-hari)
// ------------------------------------------------------------------
const I = (meal, menu, kcal) => ({ meal, menu, kcal });
export const IDEAS = [
  I('Sarapan', 'Oatmeal + pisang + telur rebus', 315),
  I('Sarapan', 'Roti gandum 2 lembar + telur dadar + teh tawar', 245),
  I('Sarapan', 'Nasi merah ½ piring + telur rebus + tumis sayur', 270),
  I('Sarapan', 'Bubur ayam ½ porsi tanpa kerupuk + teh tawar', 180),
  I('Sarapan', 'Ubi rebus + susu rendah lemak', 200),
  I('Makan Siang', 'Nasi ¾ piring + ikan bakar + sayur asem + tempe', 520),
  I('Makan Siang', 'Gado-gado tanpa kerupuk + ½ lontong', 400),
  I('Makan Siang', 'Nasi ¾ piring + ayam bakar + lalapan + sambal', 500),
  I('Makan Siang', 'Nasi merah + pepes ikan + tumis kangkung', 450),
  I('Makan Siang', 'Soto ayam bening + nasi ½ piring', 350),
  I('Makan Malam', 'Sup ayam sayur + tahu kukus + nasi ½ piring', 380),
  I('Makan Malam', 'Pepes ikan + tumis kangkung + nasi merah ½ piring', 360),
  I('Makan Malam', 'Capcay kuah + dada ayam rebus', 320),
  I('Makan Malam', 'Tempe & tahu bacem + sayur bening bayam + nasi ½', 400),
  I('Makan Malam', 'Ikan bakar + salad sayur + kentang rebus', 380),
  I('Camilan', 'Buah potong (pepaya/semangka) 1 mangkuk', 80),
  I('Camilan', 'Yogurt plain + buah', 140),
  I('Camilan', 'Jagung rebus 1 tongkol', 90),
  I('Camilan', 'Telur rebus 1 butir', 75),
  I('Camilan', 'Kacang almond 1 genggam kecil', 160),
];

const dayOfYear = (s) => epochDay(s) - epochDay(s.slice(0, 4) + '-01-01') + 1;

function menuIdeas(r) {
  const target = r.settings.targetKcal;
  const left = r.remainingToday;
  const seed = dayOfYear(r.period.start);
  const byKcalDesc = (a, b) => b.kcal - a.kcal;
  if (left != null) {
    if (left < 60) return [];
    const todayMeals = r.days[0]?.meals || {};
    const h = nowHour();
    const open = MEALS.filter((m) => (todayMeals[m] || 0) <= 0 && (m === 'Sarapan' ? h < 11 : m === 'Makan Siang' ? h < 16 : true));
    if (!open.length) return [];
    const mainOpen = open.filter((m) => m !== 'Camilan');
    const out = [];
    let budget = left;
    for (const m of open) {
      const share = m === 'Camilan' ? Math.min(150, budget) : budget / Math.max(1, mainOpen.length);
      const l = IDEAS.filter((x) => x.meal === m && x.kcal <= share * 1.1).sort(byKcalDesc);
      if (l.length) { const pick = l[seed % Math.min(2, l.length)]; out.push(pick); budget -= pick.kcal; }
    }
    return out;
  }
  return MEALS.map((m) => {
    const budget = target * (MEAL_SHARE[m] || 0.25);
    const l = IDEAS.filter((x) => x.meal === m && x.kcal <= budget * 1.15).sort(byKcalDesc);
    return l.length ? l[seed % Math.min(3, l.length)] : null;
  }).filter(Boolean);
}

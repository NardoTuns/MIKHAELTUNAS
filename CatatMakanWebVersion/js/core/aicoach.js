// Ringkasan data untuk AI & pembaca hasil analisis AI (port AiCoach.kt).
import { ACTIVITY, GOALS } from './nutrition.js';
import { total } from './fooddb.js';
import { today } from './util.js';

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const ri = (v) => Math.round(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ringkasan (tanpa data yang tidak perlu) untuk dikirim ke AI. */
export function summary(r) {
  const s = r.settings; const nd = r.needs;
  const [pPct, cPct, fPct] = r.split;
  const day = r.period.type === 'D';
  const profil = {};
  if (s.name) profil.nama_panggilan = s.name;
  profil.jenis_kelamin = s.gender === 'P' ? 'pria' : s.gender === 'W' ? 'wanita' : 'belum diisi';
  if (s.age > 0) profil.umur = s.age;
  if (s.heightCm > 0) profil.tinggi_cm = s.heightCm;
  if (nd.weight != null) profil.berat_kg = r1(nd.weight);
  if (s.targetWeight > 0) profil.berat_target_kg = r1(s.targetWeight);
  profil.aktivitas = ACTIVITY[clamp(s.activity, 0, 3)][1];
  profil.tujuan = GOALS[clamp(s.goal, 0, 2)][1];
  if (nd.bmi) { profil.imt = r1(nd.bmi.value); profil.kategori_imt = nd.bmi.category; }
  if (nd.bmr != null) profil.bmr_kkal = ri(nd.bmr);
  if (nd.tdee != null) profil.kebutuhan_jaga_berat_kkal = ri(nd.tdee);

  const hasil = { hari_dalam_periode: r.period.elapsedDays, hari_dianalisis: r.statDays.length };
  if (r.todayExcluded) hasil.catatan = 'hari ini belum selesai sehingga tidak dihitung dalam rata-rata';
  hasil[day ? 'total_kkal' : 'rata_kkal_per_hari'] = ri(r.avgKcal);
  hasil.rata_protein_g = ri(r.avgProtein);
  hasil.rata_karbo_g = ri(r.avgCarbs);
  hasil.rata_lemak_g = ri(r.avgFat);
  if (r.avgProtein + r.avgCarbs + r.avgFat > 0) hasil.persen_energi = { protein: ri(pPct), karbo: ri(cPct), lemak: ri(fPct) };
  hasil.rata_air_gelas = r1(r.avgWater);
  hasil.hari_sesuai_target = r.onTargetDays;
  hasil.hari_lebih_target = r.overDays;
  hasil.hari_kurang_80persen = r.underDays;
  hasil.hari_dengan_sarapan = r.breakfastDays;
  hasil.hari_makan_di_atas_jam_21 = r.lateDays;
  if (r.weekdayAvg != null) hasil.rata_kkal_hari_kerja = ri(r.weekdayAvg);
  if (r.weekendAvg != null) hasil.rata_kkal_akhir_pekan = ri(r.weekendAvg);
  if (r.weightStart != null) hasil.berat_awal_kg = r1(r.weightStart);
  if (r.weightEnd != null) hasil.berat_akhir_kg = r1(r.weightEnd);
  if (r.weightChange != null) hasil.perubahan_berat_kg = r1(r.weightChange);
  if (r.kgPerWeek != null) hasil.proyeksi_perubahan_kg_per_minggu = Math.round(r.kgPerWeek * 100) / 100;
  hasil.skor_aplikasi = r.score;

  const o = {
    periode: r.period.fullText() + (r.partial ? ' (hari ini, belum selesai)' : ''),
    jenis_periode: r.period.label,
    tanggal_hari_ini: today(),
    profil,
    target_harian: {
      kkal: s.targetKcal, protein_g: ri(nd.proteinG), karbo_g: ri(nd.carbsG), lemak_g: ri(nd.fatG),
      air_gelas: s.targetWater, batas_bawah_aman_kkal: nd.floorKcal,
    },
    hasil,
    rata_kkal_per_waktu_makan: Object.fromEntries(Object.entries(r.mealAvg).map(([k, v]) => [k, ri(v)])),
  };
  if (day) {
    o.daftar_makanan = r.foods.slice(0, 40).map((e) => ({
      jam: e.time, waktu: e.meal, nama: e.name, porsi: e.portion, kkal: ri(total(e)),
      protein_g: r1(e.protein * e.portion), karbo_g: r1(e.carbs * e.portion), lemak_g: r1(e.fat * e.portion),
    }));
    if (r.remainingToday != null) o.sisa_kkal_hari_ini = ri(r.remainingToday);
  } else {
    o.per_hari = r.days.map((d) => ({
      tgl: d.date, kkal: ri(d.kcal), protein: ri(d.protein), karbo: ri(d.carbs), lemak: ri(d.fat), air: d.water, jumlah_makanan: d.items,
    }));
    o.makanan_penyumbang_kalori_terbesar = r.topByKcal.slice(0, 10).map((f) => ({ nama: f.name, kali: f.count, kkal_total: ri(f.kcal) }));
  }
  if (r.improve.length) o.temuan_aplikasi = r.improve.map((i) => `${i.title}: ${i.text}`);
  return o;
}

/** Sidik data untuk mendeteksi "data berubah sejak analisis". */
export function signature(r) {
  const o = summary(r);
  delete o.tanggal_hari_ini;
  const str = JSON.stringify(o);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

/** Buang format markdown sederhana agar rapi di layar. */
export const clean = (s) => String(s ?? '').replaceAll('**', '').replaceAll('__', '').replaceAll('##', '').trim();

/** Normalisasi hasil analisis dari Apps Script. */
export function parseAnalysis(o, at = Date.now(), sig = 0) {
  o = o || {};
  const strings = (k) => (Array.isArray(o[k]) ? o[k] : []).map((x) => clean(x)).filter(Boolean).slice(0, 6);
  const recs = (Array.isArray(o.rekomendasi) ? o.rekomendasi : []).map((x) => {
    if (x && typeof x === 'object') return { judul: clean(x.judul), detail: clean(x.detail) };
    if (typeof x === 'string') return { judul: '', detail: clean(x) };
    return null;
  }).filter((x) => x && (x.judul || x.detail)).slice(0, 6);
  const menu = (Array.isArray(o.menu_besok) ? o.menu_besok : []).map((m) => {
    if (!m || typeof m !== 'object') return null;
    const text = clean(m.menu);
    if (!text) return null;
    const k = Number(m.kkal);
    return { meal: clean(m.waktu ?? 'Menu') || 'Menu', menu: text, kcal: Number.isFinite(k) ? Math.round(k) : 0 };
  }).filter(Boolean).slice(0, 6);
  const sc = Number.isInteger(o.skor) ? o.skor : Math.trunc(Number(o.skor));
  return {
    summary: clean(o.ringkasan), score: sc >= 0 && sc <= 100 ? sc : null,
    good: strings('poin_baik'), improve: strings('perlu_perbaikan'), recs, menu,
    motivation: clean(o.motivasi), at, sig,
  };
}

export function friendlyError(err) {
  const e = String(err || '');
  if (e.includes('NO_KEY')) return 'AI belum aktif. Isi GEMINI_API_KEY di Apps Script (lihat README).';
  if (e.includes('429')) return 'Kuota AI sedang habis, coba lagi sebentar.';
  if (!e.trim()) return 'Gagal menghubungi server';
  return e.slice(0, 160);
}

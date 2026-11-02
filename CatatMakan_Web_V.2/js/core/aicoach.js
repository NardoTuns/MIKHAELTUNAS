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
  if (nd.child) {
    profil.kelompok = 'anak/remaja (masa tumbuh kembang, jangan disarankan diet penurunan berat)';
    profil.tujuan = 'Tumbuh kembang optimal';
    if (nd.childBmi != null) { profil.imt = r1(nd.childBmi); profil.catatan_imt = 'IMT anak dinilai dengan grafik IMT/U WHO, bukan kategori dewasa'; }
  } else {
    profil.tujuan = GOALS[clamp(s.goal, 0, 2)][1];
  }
  if (nd.akg) profil.kelompok_akg_2019 = nd.akg.group;
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

// ======================================================================= Rekap gizi lengkap (AI)
/** Angka ringkas: bulat bila >= 100 atau bulat, selain itu 1 desimal. */
export const n = (v) => (v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

/** Makanan di hari yang dihitung, dikelompokkan per nama (agar AI bisa memperkirakan vitamin & mineral). */
function foodsForRecap(r) {
  const days = new Set(r.statDays.map((d) => d.date));
  const groups = new Map();
  for (const f of r.foods.filter((e) => days.has(e.date))) {
    const k = f.name.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const sumOf = (g, fn) => g.reduce((a, x) => a + fn(x), 0);
  return [...groups.values()]
    .sort((a, b) => sumOf(b, total) - sumOf(a, total))
    .slice(0, 80)
    .map((g) => {
      const o = {
        nama: g[0].name, kali: g.length, total_porsi: r1(sumOf(g, (e) => e.portion)), kkal_total: ri(sumOf(g, total)),
        protein_g_total: r1(sumOf(g, (e) => e.protein * e.portion)), karbo_g_total: r1(sumOf(g, (e) => e.carbs * e.portion)),
        lemak_g_total: r1(sumOf(g, (e) => e.fat * e.portion)),
      };
      const note = g.map((e) => e.note).find((t) => t && t.trim());
      if (note) o.keterangan = note.slice(0, 60);
      return o;
    });
}

export function recapSummary(r) {
  const base = summary(r);
  return {
    periode: base.periode, jenis_periode: base.jenis_periode, hari_tercatat: r.statDays.length, profil: base.profil,
    target_harian: base.target_harian,
    rata_rata_per_hari: { kkal: ri(r.avgKcal), protein_g: ri(r.avgProtein), karbo_g: ri(r.avgCarbs), lemak_g: ri(r.avgFat), air_gelas: r1(r.avgWater) },
    makanan: foodsForRecap(r),
  };
}

export function recapSignature(r) {
  const str = JSON.stringify(recapSummary(r));
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

const statusOf = (s) => {
  const t = String(s || '').toLowerCase();
  if (t.startsWith('kurang') || t.startsWith('rendah')) return 'kurang';
  if (t.startsWith('lebih') || t.startsWith('berlebih') || t.startsWith('tinggi')) return 'berlebih';
  return 'cukup';
};

/** Normalisasi hasil rekap gizi dari Apps Script (toleran terhadap isian AI yang kurang rapi). */
export function parseRecap(o, at = Date.now(), sig = 0) {
  o = o || {};
  const arr = (k) => (Array.isArray(o[k]) ? o[k] : []);
  const nutrients = arr('zat_gizi').map((x) => {
    if (!x || typeof x !== 'object') return null;
    const name = clean(x.nama);
    if (!name) return null;
    const intake = num(x.asupan);
    const need = num(x.kebutuhan) || num(x.akg);
    const pctRaw = Number(x.persen);
    const pct = Math.round(Number.isFinite(pctRaw) ? pctRaw : need > 0 ? (intake / need) * 100 : 0);
    return { name, group: clean(x.kelompok) || 'Lainnya', intake, need, unit: clean(x.satuan), pct, status: statusOf(x.status), source: clean(x.sumber) };
  }).filter(Boolean).slice(0, 40);
  const plate = arr('isi_piringku').map((x) => {
    if (!x || typeof x !== 'object') return null;
    const t = String(x.status || '').toLowerCase();
    return { group: clean(x.kelompok), actual: clean(x.aktual), advice: clean(x.anjuran), status: t.startsWith('kurang') ? 'kurang' : t.includes('lebih') ? 'berlebih' : 'cukup' };
  }).filter((p) => p && p.group).slice(0, 8);
  const tips = (k) => arr(k).map((x) => {
    if (x && typeof x === 'object') return { title: clean(x.zat), why: clean(x.alasan), how: clean(x.makanan || x.tips) };
    if (typeof x === 'string') return { title: '', why: '', how: clean(x) };
    return null;
  }).filter((t) => t && (t.title || t.how)).slice(0, 8);
  const menu = arr('menu_perbaikan').map((m) => {
    if (!m || typeof m !== 'object') return null;
    const text = clean(m.menu);
    if (!text) return null;
    const k = Number(m.kkal);
    return { meal: clean(m.waktu ?? 'Menu') || 'Menu', menu: text, kcal: Number.isFinite(k) ? Math.round(k) : 0 };
  }).filter(Boolean).slice(0, 6);
  const sc = Number.isInteger(o.skor_gizi) ? o.skor_gizi : Math.trunc(Number(o.skor_gizi));
  return {
    summary: clean(o.ringkasan), score: sc >= 0 && sc <= 100 ? sc : null, nutrients, plate, add: tips('perlu_ditambah'), limit: tips('perlu_dibatasi'),
    menu, note: clean(o.catatan), at, sig,
  };
}

/** Teks rekap untuk dibagikan (WhatsApp, dll.). */
export function recapShareText(res, title) {
  let t = `🧪 Rekap gizi lengkap — ${title}\n\n`;
  if (res.summary) t += res.summary + '\n';
  if (res.score != null) t += `Skor gizi: ${res.score}/100\n`;
  const groups = new Map();
  for (const x of res.nutrients) { if (!groups.has(x.group)) groups.set(x.group, []); groups.get(x.group).push(x); }
  for (const [g, list] of groups) {
    t += `\n${g}\n`;
    for (const x of list) t += `${x.status === 'kurang' ? '🔻' : x.status === 'berlebih' ? '🔺' : '✅'} ${x.name}: ${n(x.intake)} / ${n(x.need)} ${x.unit} (${x.pct}%)\n`;
  }
  if (res.add.length) t += '\n➕ Perlu ditambah\n' + res.add.map((x) => `• ${x.title}: ${x.how}\n`).join('');
  if (res.limit.length) t += '\n➖ Perlu dibatasi\n' + res.limit.map((x) => `• ${x.title}: ${x.how}\n`).join('');
  if (res.menu.length) t += '\n🍱 Menu perbaikan\n' + res.menu.map((x) => `• ${x.meal}: ${x.menu}\n`).join('');
  return t + '\nAngka adalah perkiraan AI dari catatan makan, bukan hasil laboratorium.\n— Catat Makan';
}

// ======================================================================= Rekap keluarga (AI)
/** Satu anggota → ringkasan untuk AI. m = {name, settings, report}. */
export function familyMember(m) {
  const r = m.report; const nd = r.needs; const s = m.settings;
  const o = {
    nama: m.name || 'Anggota',
    jenis_kelamin: s.gender === 'P' ? 'pria' : s.gender === 'W' ? 'wanita' : 'belum diisi',
  };
  if (s.age > 0) o.umur = s.age;
  o.kelompok = nd.child ? 'anak/remaja' : 'dewasa';
  if (!nd.child) o.tujuan = GOALS[clamp(s.goal, 0, 2)][1];
  Object.assign(o, {
    target_kkal: s.targetKcal, hari_tercatat: r.statDays.length, rata_kkal: ri(r.avgKcal), rata_protein_g: ri(r.avgProtein),
    rata_karbo_g: ri(r.avgCarbs), rata_lemak_g: ri(r.avgFat), rata_air_gelas: r1(r.avgWater),
    makanan_sering: r.topByCount.slice(0, 8).map((f) => f.name),
  });
  if (r.improve.length) o.temuan = r.improve.slice(0, 3).map((i) => i.title);
  return o;
}

export function parseFamily(o, at = Date.now()) {
  o = o || {};
  const arr = (k) => (Array.isArray(o[k]) ? o[k] : []);
  const members = arr('per_anggota').map((x) => {
    if (!x || typeof x !== 'object') return null;
    const name = clean(x.nama);
    const text = [x.catatan, x.penilaian, x.fokus].map(clean).filter(Boolean).join(' ');
    return name ? { name, text } : null;
  }).filter(Boolean);
  const menu = arr('menu_keluarga').map((x) => {
    if (!x || typeof x !== 'object') return null;
    const m = clean(x.menu);
    return m ? { meal: clean(x.waktu ?? 'Menu') || 'Menu', menu: m, portions: clean(x.porsi) } : null;
  }).filter(Boolean).slice(0, 6);
  const shopping = arr('daftar_belanja').map((x) => {
    if (x && typeof x === 'object') { const b = clean(x.bahan); return b ? { item: b, qty: clean(x.jumlah) } : null; }
    if (typeof x === 'string') { const b = clean(x); return b ? { item: b, qty: '' } : null; }
    return null;
  }).filter(Boolean).slice(0, 30);
  const tips = arr('tips').map(clean).filter(Boolean).slice(0, 6);
  return { summary: clean(o.ringkasan), members, menu, shopping, tips, at };
}

export function familyShareText(p) {
  let t = '👨‍👩‍👧 Rekap gizi keluarga\n\n';
  if (p.summary) t += p.summary + '\n';
  if (p.members.length) t += '\n' + p.members.map((m) => `• ${m.name}: ${m.text}\n`).join('');
  if (p.menu.length) t += '\n🍱 Menu keluarga\n' + p.menu.map((m) => `• ${m.meal}: ${m.menu}${m.portions ? ` (${m.portions})` : ''}\n`).join('');
  if (p.shopping.length) t += '\n🛒 Daftar belanja\n' + p.shopping.map((b) => `☐ ${b.item}${b.qty ? ` — ${b.qty}` : ''}\n`).join('');
  if (p.tips.length) t += '\n💡 Tips\n' + p.tips.map((x) => `• ${x}\n`).join('');
  return t + '\n— Catat Makan';
}

export function friendlyError(err) {
  const e = String(err || '');
  if (e.includes('NO_KEY')) return 'AI belum aktif: GEMINI_API_KEY belum diisi di Apps Script. Lihat Pengaturan › 🤖 AI untuk caranya.';
  if (e.includes('429')) return 'Kuota AI sedang habis, coba lagi sebentar.';
  if (!e.trim()) return 'Gagal menghubungi server';
  return e.slice(0, 160);
}

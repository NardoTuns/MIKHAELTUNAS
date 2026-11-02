/**
 * CATAT MAKAN — Backend Google Spreadsheet (versi 1.2)
 *
 * CARA PASANG:
 * 1. Buat Google Spreadsheet baru (mis. "Catatan Diet").
 * 2. Menu Ekstensi → Apps Script → hapus isi Code.gs → tempel seluruh kode ini → Simpan.
 * 3. Pilih fungsi "setup" di toolbar → Jalankan → izinkan akses.
 * 4. Terapkan → Deployment baru → jenis "Aplikasi web"
 *      - Jalankan sebagai : Saya
 *      - Yang memiliki akses : Siapa saja
 *    → Terapkan → salin URL yang berakhiran /exec.
 * 5. Di aplikasi: Pengaturan → URL Web App → tempel → Tes koneksi.
 *
 * Jika kode ini diubah, buat versi baru: Terapkan → Kelola deployment → Edit → Versi baru.
 * (URL tetap sama, tidak perlu diganti di aplikasi.)
 *
 * AKTIFKAN AI (opsional, gratis) — untuk saran kalori, Foto AI, Analisis AI & Tanya AI:
 * a. Buka https://aistudio.google.com/apikey → Create API key → salin.
 * b. Di Apps Script: ⚙️ Setelan project → Properti skrip → Tambahkan properti
 *      Properti: GEMINI_API_KEY   Nilai: (tempel kunci)
 *    (opsional) GEMINI_MODEL          model untuk saran kalori & foto, default: gemini-flash-lite-latest
 *    (opsional) GEMINI_MODEL_ANALISIS model untuk analisis & tanya jawab, default: gemini-flash-latest
 * c. Pilih fungsi "testAI" lalu "testAnalisis" → Jalankan → lihat Log eksekusi.
 *
 * BARU DI 1.2: aksi "analyze" (analisis harian/mingguan/bulanan + rekomendasi + saran menu),
 * aksi "ask" (tanya-jawab ahli gizi AI), dan sheet "Analisis AI" berisi riwayat analisis.
 */

const VERSION = '1.2';

const SHEETS = {
  food: {
    name: 'Makanan', key: 'id', text: ['id', 'tanggal', 'jam'],
    headers: ['id', 'tanggal', 'jam', 'waktu_makan', 'nama', 'porsi', 'kkal_per_porsi', 'total_kkal',
              'protein_g', 'karbo_g', 'lemak_g', 'catatan', 'updatedAt', 'deleted', 'serverTime', 'device']
  },
  water: {
    name: 'Air', key: 'tanggal', text: ['tanggal'],
    headers: ['tanggal', 'gelas', 'updatedAt', 'serverTime', 'device']
  },
  weight: {
    name: 'Berat', key: 'tanggal', text: ['tanggal'],
    headers: ['tanggal', 'kg', 'updatedAt', 'deleted', 'serverTime', 'device']
  }
};

const LOG_SHEET = 'Analisis AI';
const LOG_HEADERS = ['waktu', 'periode', 'skor_aplikasi', 'skor_ai', 'ringkasan', 'rekomendasi', 'device'];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(getSheet_);
  let sum = ss.getSheetByName('Ringkasan');
  if (!sum) sum = ss.insertSheet('Ringkasan');
  sum.getRange('A1').setFormula(
    '=QUERY(Makanan!A:P,"select B, sum(H), count(A) where N = false and B is not null ' +
    'group by B order by B desc label B \'Tanggal\', sum(H) \'Total kkal\', count(A) \'Jumlah makanan\'",1)'
  );
  sum.getRange('E1').setValue('Ringkasan harian otomatis dari sheet Makanan.');
  logSheet_();
  ['Sheet1', 'Lembar1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'ping';
  if (action === 'ping') {
    const ai = !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    return json_({
      ok: true, ai: ai, serverTime: Date.now(), version: VERSION,
      features: ['estimate', 'photo', 'analyze', 'ask'],
      message: 'Terhubung ke "' + SpreadsheetApp.getActiveSpreadsheet().getName() + '" (v' + VERSION + ')' +
        (ai ? ' · AI aktif' : ' · AI belum aktif (isi GEMINI_API_KEY)')
    });
  }
  if (action === 'estimate') {
    try {
      return json_({ ok: true, items: estimate_(String(p.q || '')) });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }
  if (action === 'pull') {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const now = Date.now();
      const since = Number(p.since) || 0;
      const out = { ok: true, serverTime: now };
      Object.keys(SHEETS).forEach(k => out[k] = read_(k, since));
      return json_(out);
    } catch (err) {
      return json_({ ok: false, error: String(err) });
    } finally {
      lock.releaseLock();
    }
  }
  return json_({ ok: false, error: 'Aksi tidak dikenal: ' + action });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Data tidak valid' });
  }
  if (body.action === 'photo') {
    try {
      return json_({ ok: true, items: photo_(body.image, body.mime || 'image/jpeg') });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }
  if (body.action === 'analyze') {
    try {
      return json_({ ok: true, analysis: analyze_(body.summary, body.device || '') });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }
  if (body.action === 'ask') {
    try {
      return json_({ ok: true, answer: ask_(body.question, body.summary, body.history) });
    } catch (err) {
      return json_({ ok: false, error: String(err.message || err) });
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = Date.now();
    const device = body.device || '';
    let n = 0;
    if (body.action === 'push') {
      Object.keys(SHEETS).forEach(k => {
        if (body[k] && body[k].length) n += upsert_(k, body[k], now, device);
      });
    }
    return json_({ ok: true, written: n, serverTime: now });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */

function getSheet_(k) {
  const cfg = SHEETS[k];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) {
    sh = ss.insertSheet(cfg.name);
    sh.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers])
      .setFontWeight('bold').setBackground('#2e7d32').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function txt_(h, v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), h === 'jam' ? 'HH:mm' : 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function bool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function toRow_(k, r, now, device) {
  if (k === 'food') {
    const porsi = Number(r.portion) || 0, kk = Number(r.kcal) || 0;
    return [String(r.id || ''), String(r.date || ''), String(r.time || ''), r.meal || '', r.name || '',
            porsi, kk, Math.round(porsi * kk), Number(r.protein) || 0, Number(r.carbs) || 0, Number(r.fat) || 0,
            r.note || '', Number(r.updatedAt) || 0, !!r.deleted, now, device];
  }
  if (k === 'water') {
    return [String(r.date || ''), Number(r.glasses) || 0, Number(r.updatedAt) || 0, now, device];
  }
  return [String(r.date || ''), Number(r.kg) || 0, Number(r.updatedAt) || 0, !!r.deleted, now, device];
}

function fromRow_(k, r, H) {
  const g = h => r[H.indexOf(h)];
  if (k === 'food') {
    return {
      id: txt_('id', g('id')), date: txt_('tanggal', g('tanggal')), time: txt_('jam', g('jam')),
      meal: String(g('waktu_makan') || ''), name: String(g('nama') || ''),
      portion: Number(g('porsi')) || 1, kcal: Number(g('kkal_per_porsi')) || 0,
      protein: Number(g('protein_g')) || 0, carbs: Number(g('karbo_g')) || 0, fat: Number(g('lemak_g')) || 0,
      note: String(g('catatan') || ''), updatedAt: Number(g('updatedAt')) || 0, deleted: bool_(g('deleted'))
    };
  }
  if (k === 'water') {
    return { date: txt_('tanggal', g('tanggal')), glasses: Number(g('gelas')) || 0, updatedAt: Number(g('updatedAt')) || 0 };
  }
  return { date: txt_('tanggal', g('tanggal')), kg: Number(g('kg')) || 0, updatedAt: Number(g('updatedAt')) || 0, deleted: bool_(g('deleted')) };
}

/** Simpan/perbarui baris berdasarkan kunci; perubahan terbaru (updatedAt) yang menang. */
function upsert_(k, records, now, device) {
  const cfg = SHEETS[k], H = cfg.headers, sh = getSheet_(k);
  const last = sh.getLastRow();
  const data = last > 1 ? sh.getRange(2, 1, last - 1, H.length).getValues() : [];
  const kI = H.indexOf(cfg.key), uI = H.indexOf('updatedAt');
  data.forEach(r => cfg.text.forEach(h => { const i = H.indexOf(h); r[i] = txt_(h, r[i]); }));

  const index = {};
  data.forEach((r, i) => { index[r[kI]] = i; });

  let n = 0;
  records.forEach(rec => {
    const row = toRow_(k, rec, now, device);
    const key = row[kI];
    if (!key) return;
    const i = index[key];
    if (i === undefined) {
      index[key] = data.length; data.push(row); n++;
    } else if (Number(data[i][uI]) < Number(row[uI])) {
      data[i] = row; n++;
    }
  });

  if (n > 0) {
    cfg.text.forEach(h => sh.getRange(2, H.indexOf(h) + 1, data.length, 1).setNumberFormat('@'));
    sh.getRange(2, 1, data.length, H.length).setValues(data);
  }
  return n;
}

function read_(k, since) {
  const cfg = SHEETS[k], H = cfg.headers, sh = getSheet_(k);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const sI = H.indexOf('serverTime');
  return sh.getRange(2, 1, last - 1, H.length).getValues()
    .filter(r => Number(r[sI]) > since)
    .map(r => fromRow_(k, r, H));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= AI (Gemini) ======================= */

const AI_RULES =
  'Jawab HANYA dalam JSON: {"items":[{"name":"...","portion":"...","kcal":0,"protein":0,"carbs":0,"fat":0}]}. ' +
  '"portion" = deskripsi porsi dalam bahasa Indonesia beserta perkiraan gram/ml, mis. "1 piring (250 g)". ' +
  'kcal, protein, carbs, fat = angka untuk porsi tersebut (protein/karbo/lemak dalam gram). ' +
  'Gunakan nilai realistis sesuai cara masak umum di Indonesia (termasuk minyak/santan/gula). ' +
  'Jika bukan makanan atau minuman, kembalikan {"items":[]}.';

function estimate_(q) {
  q = q.trim().slice(0, 80);
  if (q.length < 2) return [];
  const cache = CacheService.getScriptCache();
  const ck = 'est:' + Utilities.base64EncodeWebSafe(q.toLowerCase()).slice(0, 200);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const prompt =
    'Kamu ahli gizi Indonesia. Perkirakan kandungan gizi untuk: "' + q + '". ' +
    'Berikan 1 sampai 3 pilihan: makanan paling cocok dengan teks itu dalam porsi umum, ' +
    'boleh ditambah variasi porsi/cara masak yang sering dimakan. Nama singkat & jelas. ' + AI_RULES;
  const items = gemini_([{ text: prompt }]);
  cache.put(ck, JSON.stringify(items), 21600);
  return items;
}

function photo_(b64, mime) {
  if (!b64) throw new Error('Foto kosong');
  const prompt =
    'Kamu ahli gizi Indonesia. Kenali setiap makanan dan minuman yang terlihat di foto ini ' +
    '(pisahkan per komponen, mis. nasi, lauk, sayur, sambal, minuman). ' +
    'Perkirakan porsi yang TERLIHAT di foto. ' + AI_RULES;
  return gemini_([{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }]);
}

/** Daftar model untuk analisis & tanya jawab (lebih teliti), dengan cadangan. */
function analysisModels_() {
  const props = PropertiesService.getScriptProperties();
  return [props.getProperty('GEMINI_MODEL_ANALISIS'), 'gemini-flash-latest',
          props.getProperty('GEMINI_MODEL'), 'gemini-flash-lite-latest'];
}

/**
 * Panggil Gemini, kembalikan teks jawaban.
 * opt: { json: true/false, temperature: angka, models: [...] }
 * Jika satu model gagal/kuota habis, otomatis mencoba model berikutnya.
 */
function geminiText_(parts, opt) {
  opt = opt || {};
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('NO_KEY');
  const models = (opt.models || [props.getProperty('GEMINI_MODEL'), 'gemini-flash-lite-latest', 'gemini-flash-latest'])
    .filter((m, i, a) => m && a.indexOf(m) === i);
  const cfg = { temperature: opt.temperature === undefined ? 0.2 : opt.temperature };
  if (opt.json !== false) cfg.responseMimeType = 'application/json';
  let lastErr = '';
  for (const m of models) {
    const res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ role: 'user', parts: parts }],
          generationConfig: cfg
        })
      });
    const code = res.getResponseCode();
    if (code === 200) {
      const j = JSON.parse(res.getContentText());
      const c = (j.candidates || [])[0] || {};
      const text = ((c.content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (text.trim()) return text;
      lastErr = 'jawaban kosong (' + (c.finishReason || 'tanpa alasan') + ')';
      continue;
    }
    lastErr = 'HTTP ' + code + ': ' + res.getContentText().slice(0, 200);
    if (code === 400 || code === 401 || code === 403) break; // kunci salah / tidak diizinkan
    // 404 model tidak ada, 429 kuota habis, 5xx server sibuk → coba model berikutnya
  }
  throw new Error('AI gagal (' + lastErr + ')');
}

function gemini_(parts) {
  return parseItems_(geminiText_(parts));
}

function parseItems_(text) {
  text = String(text || '').replace(/```json|```/g, '').trim();
  let o;
  try { o = JSON.parse(text); } catch (e) { return []; }
  const arr = Array.isArray(o) ? o : (o.items || []);
  const n = v => { v = Number(v); return isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0; };
  return arr.slice(0, 6)
    .filter(x => x && x.name)
    .map(x => ({
      name: String(x.name).slice(0, 60), portion: String(x.portion || '1 porsi').slice(0, 60),
      kcal: Math.round(n(x.kcal)), protein: n(x.protein), carbs: n(x.carbs), fat: n(x.fat)
    }));
}

/* ---------- Analisis pola makan (harian / mingguan / bulanan) ---------- */

function analyze_(summary, device) {
  if (!summary || typeof summary !== 'object') throw new Error('Data analisis kosong');
  const data = JSON.stringify(summary);
  if (data.length > 80000) throw new Error('Data terlalu besar');

  const cache = CacheService.getScriptCache();
  const ck = 'an:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, data, Utilities.Charset.UTF_8));
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  const prompt = [
    'Kamu adalah ahli gizi (dietisien) Indonesia yang ramah, jujur, dan praktis di dalam aplikasi pencatat makan "Catat Makan".',
    'Analisis data pola makan pengguna di bawah (JSON). Angka kalori & gizi adalah perkiraan dari catatan pengguna sendiri.',
    '',
    'ATURAN:',
    '- Bahasa Indonesia santai tapi sopan, sapa dengan "kamu" (pakai nama panggilan jika ada).',
    '- Fokus pada pola yang paling berpengaruh; sebut angka dari data (kkal, gram, gelas, hari) agar konkret.',
    '- Saran harus praktis, murah, dan memakai makanan Indonesia sehari-hari (warung, masakan rumah, pasar).',
    '- Pertimbangkan profil (umur, IMT, aktivitas, tujuan, berat target) dan "temuan_aplikasi" bila ada.',
    '- Jangan mendiagnosis penyakit dan jangan menyarankan obat/suplemen/pil diet.',
    '- Jika rata-rata asupan di bawah "batas_bawah_aman_kkal", proyeksi turun > 1 kg/minggu, atau IMT kategori kurang,',
    '  ingatkan dengan lembut untuk tidak makan terlalu sedikit dan sarankan konsultasi tenaga kesehatan.',
    '- Jika hari yang dianalisis sedikit atau data protein/karbo/lemak kosong, sebut keterbatasan itu singkat.',
    '- Untuk periode harian yang belum selesai, arahkan saran ke sisa hari ini (lihat "sisa_kkal_hari_ini").',
    '- "menu_besok": 3–4 menu (Sarapan, Makan Siang, Makan Malam, opsional Camilan) yang totalnya mendekati target kkal',
    '  dan menyesuaikan kebiasaan/makanan favorit pengguna.',
    '',
    'Jawab HANYA JSON dengan struktur persis:',
    '{"ringkasan":"2–3 kalimat penilaian umum","skor":0,"poin_baik":["..."],"perlu_perbaikan":["..."],' +
      '"rekomendasi":[{"judul":"maks 6 kata","detail":"1–2 kalimat konkret"}],' +
      '"menu_besok":[{"waktu":"Sarapan","menu":"...","kkal":0}],"motivasi":"1 kalimat penyemangat"}',
    'skor = 0–100 (kualitas pola makan). poin_baik & perlu_perbaikan masing-masing 2–4 butir singkat.',
    'rekomendasi 3–5 butir, urut dari yang paling berdampak.',
    '',
    'DATA:',
    data
  ].join('\n');

  const a = parseAnalysis_(geminiText_([{ text: prompt }], { temperature: 0.4, models: analysisModels_() }));
  cache.put(ck, JSON.stringify(a), 21600);
  logAnalysis_(summary, a, device);
  return a;
}

function parseAnalysis_(text) {
  text = String(text || '').replace(/```json|```/g, '').trim();
  let o;
  try {
    o = JSON.parse(text);
  } catch (e) {
    const s = text.indexOf('{'), t = text.lastIndexOf('}');
    try { o = JSON.parse(text.slice(s, t + 1)); } catch (e2) { throw new Error('Jawaban AI tidak terbaca, coba lagi.'); }
  }
  const str = (v, n) => String(v === undefined || v === null ? '' : v).trim().slice(0, n);
  const list = (v, n) => (Array.isArray(v) ? v : []).map(x => str(typeof x === 'object' ? (x.teks || x.text || JSON.stringify(x)) : x, 300))
    .filter(Boolean).slice(0, n);
  const skor = Number(o.skor);
  return {
    ringkasan: str(o.ringkasan, 800),
    skor: isFinite(skor) ? Math.max(0, Math.min(100, Math.round(skor))) : -1,
    poin_baik: list(o.poin_baik, 5),
    perlu_perbaikan: list(o.perlu_perbaikan, 5),
    rekomendasi: (Array.isArray(o.rekomendasi) ? o.rekomendasi : []).slice(0, 6).map(r =>
      typeof r === 'object' && r ? { judul: str(r.judul, 80), detail: str(r.detail, 400) } : { judul: '', detail: str(r, 400) }
    ).filter(r => r.judul || r.detail),
    menu_besok: (Array.isArray(o.menu_besok) ? o.menu_besok : []).slice(0, 5).map(m => ({
      waktu: str(m && m.waktu, 20) || 'Menu', menu: str(m && m.menu, 200), kkal: Math.max(0, Math.round(Number(m && m.kkal) || 0))
    })).filter(m => m.menu),
    motivasi: str(o.motivasi, 300)
  };
}

/* ---------- Tanya-jawab ahli gizi AI ---------- */

function ask_(question, summary, history) {
  question = String(question || '').trim().slice(0, 500);
  if (!question) throw new Error('Pertanyaan kosong');
  const hist = (Array.isArray(history) ? history : []).slice(-6)
    .map(h => (h && h.role === 'pengguna' ? 'Pengguna: ' : 'Asisten: ') + String((h && h.text) || '').slice(0, 800))
    .join('\n');
  const prompt = [
    'Kamu adalah asisten ahli gizi Indonesia di aplikasi "Catat Makan". Jawab pertanyaan pengguna dengan ramah,',
    'singkat (maksimal ±150 kata), dan praktis. Gunakan data catatan pengguna di bawah bila relevan (sebut angkanya).',
    'Pakai contoh makanan Indonesia sehari-hari yang mudah didapat & terjangkau.',
    'Tulis teks biasa tanpa format markdown (tanpa **, #). Untuk daftar, awali baris dengan "• ".',
    'Jangan mendiagnosis penyakit dan jangan meresepkan obat/suplemen/pil diet; untuk keluhan medis sarankan ke dokter/ahli gizi.',
    'Jika pertanyaan tidak berhubungan dengan makanan, gizi, diet, olahraga, atau kesehatan umum, tolak dengan sopan.',
    '',
    'DATA PENGGUNA:',
    JSON.stringify(summary || {}),
    hist ? '\nPERCAKAPAN SEBELUMNYA:\n' + hist : '',
    '',
    'PERTANYAAN: ' + question
  ].join('\n');
  return geminiText_([{ text: prompt }], { json: false, temperature: 0.6, models: analysisModels_() }).trim();
}

/* ---------- Riwayat analisis di sheet "Analisis AI" ---------- */

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setBackground('#2e7d32').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 420);
    sh.setColumnWidth(6, 420);
  }
  return sh;
}

function logAnalysis_(summary, a, device) {
  try {
    const recs = (a.rekomendasi || []).map(r => '• ' + (r.judul ? r.judul + ': ' : '') + r.detail).join('\n');
    const hasil = summary.hasil || {};
    logSheet_().appendRow([
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), String(summary.periode || ''),
      hasil.skor_aplikasi === undefined ? '' : hasil.skor_aplikasi, a.skor >= 0 ? a.skor : '',
      a.ringkasan, recs, device || ''
    ]);
  } catch (e) {
    // pencatatan riwayat tidak boleh menggagalkan analisis
  }
}

/* ---------- Tes dari editor ---------- */

/** Jalankan dari editor untuk mengecek kunci AI. */
function testAI() {
  Logger.log(JSON.stringify(estimate_('nasi kuning'), null, 2));
}

/** Jalankan dari editor untuk mengecek analisis AI dengan data contoh. */
function testAnalisis() {
  const contoh = {
    periode: 'Mingguan · contoh', jenis_periode: 'Mingguan',
    profil: { jenis_kelamin: 'wanita', umur: 32, tinggi_cm: 158, berat_kg: 64, tujuan: 'Turun pelan (±¼ kg/minggu)' },
    target_harian: { kkal: 1600, protein_g: 77, karbo_g: 205, lemak_g: 44, air_gelas: 8, batas_bawah_aman_kkal: 1200 },
    hasil: { hari_dianalisis: 6, rata_kkal_per_hari: 1850, rata_protein_g: 48, rata_karbo_g: 260, rata_lemak_g: 62,
             rata_air_gelas: 5, hari_sesuai_target: 2, hari_lebih_target: 4, hari_dengan_sarapan: 2, skor_aplikasi: 55 },
    makanan_penyumbang_kalori_terbesar: [{ nama: 'Nasi putih', kali: 12, kkal_total: 2340 },
      { nama: 'Gorengan', kali: 9, kkal_total: 1260 }, { nama: 'Es teh manis', kali: 8, kkal_total: 720 }]
  };
  Logger.log(JSON.stringify(analyze_(contoh, 'tes editor'), null, 2));
  Logger.log(ask_('Camilan sehat di bawah 150 kkal?', contoh, []));
}

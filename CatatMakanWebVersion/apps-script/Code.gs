/**
 * CATAT MAKAN — Backend Google Spreadsheet (versi 2.0)
 * Untuk aplikasi Android Catat Makan (1.x) DAN Catat Makan versi web (2.x).
 *
 * CARA PASANG (baru):
 * 1. Buat Google Spreadsheet baru (mis. "Catatan Diet").
 * 2. Menu Ekstensi → Apps Script → hapus isi Code.gs → tempel seluruh kode ini → Simpan.
 * 3. Pilih fungsi "setup" di toolbar → Jalankan → izinkan akses.
 * 4. Terapkan → Deployment baru → jenis "Aplikasi web"
 *      - Jalankan sebagai : Saya
 *      - Yang memiliki akses : Siapa saja
 *    → Terapkan → salin URL yang berakhiran /exec.
 * 5. Di aplikasi: Pengaturan → URL Web App → tempel → Tes koneksi.
 *
 * MEMPERBARUI dari versi 1.x (URL tetap sama, data lama aman):
 *   Ganti seluruh isi Code.gs dengan kode ini → Simpan → jalankan "setup" sekali →
 *   Terapkan → Kelola deployment → ✏️ Edit → Versi: "Versi baru" → Terapkan.
 *
 * AKTIFKAN AI (opsional, gratis) — saran kalori, Foto AI, Analisis AI & Tanya AI:
 * a. Buka https://aistudio.google.com/apikey → Create API key → salin.
 * b. Di Apps Script: ⚙️ Setelan project → Properti skrip → Tambahkan properti
 *      Properti: GEMINI_API_KEY   Nilai: (tempel kunci)
 *    (opsional) GEMINI_MODEL          model untuk saran kalori & foto, default: gemini-flash-lite-latest
 *    (opsional) GEMINI_MODEL_ANALISIS model untuk analisis & tanya jawab, default: gemini-flash-latest
 * c. Pilih fungsi "testAI" lalu "testAnalisis" → Jalankan → lihat Log eksekusi.
 *
 * BARU DI 2.0:
 * - Banyak pengguna dalam satu Spreadsheet: kolom "user" (ID sinkron). Baris tanpa user = pengguna utama
 *   (sama dengan data aplikasi Android). Data air & berat kini dibedakan per pengguna.
 * - Sheet "Profil": profil, target & menu favorit tiap pengguna ikut tersinkron antar perangkat.
 * - Aksi "off": pencarian produk Open Food Facts lewat server (untuk browser yang diblokir CORS).
 * - Kolom dibaca berdasarkan judul kolom, jadi kolom tambahan buatan sendiri tidak mengganggu.
 */

const VERSION = '2.0';

const SHEETS = {
  food: {
    name: 'Makanan', keys: ['id'], text: ['id', 'tanggal', 'jam', 'user'],
    headers: ['id', 'tanggal', 'jam', 'waktu_makan', 'nama', 'porsi', 'kkal_per_porsi', 'total_kkal',
              'protein_g', 'karbo_g', 'lemak_g', 'catatan', 'updatedAt', 'deleted', 'serverTime', 'device', 'user']
  },
  water: {
    name: 'Air', keys: ['user', 'tanggal'], text: ['tanggal', 'user'],
    headers: ['tanggal', 'gelas', 'updatedAt', 'serverTime', 'device', 'user']
  },
  weight: {
    name: 'Berat', keys: ['user', 'tanggal'], text: ['tanggal', 'user'],
    headers: ['tanggal', 'kg', 'updatedAt', 'deleted', 'serverTime', 'device', 'user']
  },
  profile: {
    name: 'Profil', keys: ['user'], text: ['user', 'data'],
    headers: ['user', 'nama', 'data', 'updatedAt', 'serverTime', 'device']
  }
};

const LOG_SHEET = 'Analisis AI';
const LOG_HEADERS = ['waktu', 'periode', 'skor_aplikasi', 'skor_ai', 'ringkasan', 'rekomendasi', 'device', 'user'];
const OFF_UA = 'CatatMakan/2.0 (Apps Script; aplikasi catatan diet pribadi)';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(sheetInfo_);
  let sum = ss.getSheetByName('Ringkasan');
  if (!sum) sum = ss.insertSheet('Ringkasan');
  const fi = sheetInfo_('food');
  const col = h => columnLetter_(fi.idx(h) + 1);
  const last = columnLetter_(fi.head.length);
  sum.getRange('A1').setFormula(
    '=QUERY(Makanan!A:' + last + ',"select ' + col('user') + ', ' + col('tanggal') + ', sum(' + col('total_kkal') + '), count(' + col('id') + ') ' +
    'where ' + col('deleted') + ' = false and ' + col('tanggal') + ' is not null ' +
    'group by ' + col('user') + ', ' + col('tanggal') + ' order by ' + col('tanggal') + ' desc ' +
    'label ' + col('user') + ' \'Pengguna\', ' + col('tanggal') + ' \'Tanggal\', sum(' + col('total_kkal') + ') \'Total kkal\', count(' + col('id') + ') \'Jumlah makanan\'",1)'
  );
  sum.getRange('F1').setValue('Ringkasan harian otomatis dari sheet Makanan. Pengguna kosong = pengguna utama.');
  logInfo_();
  ['Sheet1', 'Lembar1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}

function columnLetter_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cleanUser_(u) {
  return String(u === undefined || u === null ? '' : u).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'ping';
  if (action === 'ping') {
    const ai = !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    return json_({
      ok: true, ai: ai, serverTime: Date.now(), version: VERSION,
      features: ['estimate', 'photo', 'analyze', 'ask', 'users', 'profile', 'off'],
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
  if (action === 'off') {
    try {
      return json_({ ok: true, hits: offSearch_(String(p.q || '')) });
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
      // Tanpa parameter user (aplikasi Android / versi lama) = pengguna utama ("").
      const user = cleanUser_(p.user);
      const out = { ok: true, serverTime: now, user: user };
      ['food', 'water', 'weight'].forEach(k => out[k] = read_(k, since, user));
      const prof = read_('profile', since, user);
      out.profile = prof.length ? prof[prof.length - 1] : null;
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
      return json_({ ok: true, analysis: analyze_(body.summary, body.device || '', cleanUser_(body.user)) });
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
    const device = String(body.device || '').slice(0, 80);
    const user = cleanUser_(body.user);
    let n = 0;
    if (body.action === 'push') {
      ['food', 'water', 'weight'].forEach(k => {
        if (body[k] && body[k].length) n += upsert_(k, body[k], now, device, user);
      });
      if (body.profile && body.profile.data) n += upsert_('profile', [body.profile], now, device, user);
    }
    return json_({ ok: true, written: n, serverTime: now });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */

/** Ambil sheet beserta peta kolom; buat sheet / tambahkan kolom yang belum ada (mis. "user" dari versi 1.x). */
function sheetInfo_(k) {
  const cfg = SHEETS[k];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) sh = ss.insertSheet(cfg.name);
  let head = [];
  if (sh.getLastRow() > 0 && sh.getLastColumn() > 0) {
    head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
    while (head.length && head[head.length - 1] === '') head.pop();
  }
  const missing = cfg.headers.filter(h => head.indexOf(h) < 0);
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#2e7d32').setFontColor('#ffffff');
    head = head.concat(missing);
    sh.setFrozenRows(1);
  }
  return { sh: sh, cfg: cfg, head: head, idx: h => head.indexOf(h) };
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

/** Catatan dari aplikasi → objek {judul_kolom: nilai}. */
function toRow_(k, r, now, device, user) {
  if (k === 'food') {
    const porsi = Number(r.portion) || 0, kk = Number(r.kcal) || 0;
    return {
      id: String(r.id || ''), tanggal: String(r.date || ''), jam: String(r.time || ''), waktu_makan: r.meal || '', nama: r.name || '',
      porsi: porsi, kkal_per_porsi: kk, total_kkal: Math.round(porsi * kk),
      protein_g: Number(r.protein) || 0, karbo_g: Number(r.carbs) || 0, lemak_g: Number(r.fat) || 0,
      catatan: r.note || '', updatedAt: Number(r.updatedAt) || 0, deleted: !!r.deleted, serverTime: now, device: device, user: user
    };
  }
  if (k === 'water') {
    return { tanggal: String(r.date || ''), gelas: Number(r.glasses) || 0, updatedAt: Number(r.updatedAt) || 0, serverTime: now, device: device, user: user };
  }
  if (k === 'weight') {
    return { tanggal: String(r.date || ''), kg: Number(r.kg) || 0, updatedAt: Number(r.updatedAt) || 0, deleted: !!r.deleted, serverTime: now, device: device, user: user };
  }
  const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || {});
  let nama = '';
  try { nama = String(JSON.parse(data).name || ''); } catch (e) { /* abaikan */ }
  return { user: user, nama: nama.slice(0, 60), data: data.slice(0, 45000), updatedAt: Number(r.updatedAt) || 0, serverTime: now, device: device };
}

/** Baris sheet → objek untuk aplikasi. */
function fromRow_(k, r, info) {
  const g = h => { const i = info.idx(h); return i < 0 ? '' : r[i]; };
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
  if (k === 'weight') {
    return { date: txt_('tanggal', g('tanggal')), kg: Number(g('kg')) || 0, updatedAt: Number(g('updatedAt')) || 0, deleted: bool_(g('deleted')) };
  }
  return { data: String(g('data') || ''), updatedAt: Number(g('updatedAt')) || 0 };
}

function readAll_(info) {
  const last = info.sh.getLastRow();
  const w = info.head.length;
  const data = last > 1 ? info.sh.getRange(2, 1, last - 1, w).getValues() : [];
  data.forEach(r => info.cfg.text.forEach(h => { const i = info.idx(h); if (i >= 0) r[i] = txt_(h, r[i]); }));
  return data;
}

/** Simpan/perbarui baris berdasarkan kunci; perubahan terbaru (updatedAt) yang menang. */
function upsert_(k, records, now, device, user) {
  const info = sheetInfo_(k);
  const data = readAll_(info);
  const uI = info.idx('updatedAt');
  const keyOf = r => info.cfg.keys.map(h => h === 'user' ? cleanUser_(r[info.idx(h)]) : String(r[info.idx(h)])).join('|');
  const index = {};
  data.forEach((r, i) => { index[keyOf(r)] = i; });

  let n = 0;
  records.forEach(rec => {
    const obj = toRow_(k, rec, now, device, user);
    const row = new Array(info.head.length).fill('');
    info.head.forEach((h, i) => { if (obj[h] !== undefined) row[i] = obj[h]; });
    if (info.cfg.keys.some(h => h !== 'user' && !row[info.idx(h)])) return;
    const key = keyOf(row);
    const i = index[key];
    if (i === undefined) {
      index[key] = data.length; data.push(row); n++;
    } else if (Number(data[i][uI]) < Number(row[uI])) {
      // timpa kolom yang dikenal, pertahankan kolom tambahan buatan pengguna
      info.head.forEach((h, c) => { if (obj[h] !== undefined) data[i][c] = row[c]; });
      n++;
    }
  });

  if (n > 0) {
    info.cfg.text.forEach(h => info.sh.getRange(2, info.idx(h) + 1, data.length, 1).setNumberFormat('@'));
    info.sh.getRange(2, 1, data.length, info.head.length).setValues(data);
  }
  return n;
}

function read_(k, since, user) {
  const info = sheetInfo_(k);
  const sI = info.idx('serverTime');
  const userI = info.idx('user');
  return readAll_(info)
    .filter(r => Number(r[sI]) > since && cleanUser_(r[userI]) === user)
    .map(r => fromRow_(k, r, info));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= Open Food Facts (proksi) ======================= */

function offSearch_(q) {
  q = q.trim().slice(0, 80);
  if (q.length < 2) return [];
  const cache = CacheService.getScriptCache();
  const ck = 'off:' + Utilities.base64EncodeWebSafe(q.toLowerCase()).slice(0, 200);
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://search.openfoodfacts.org/search?q=' + encodeURIComponent(q) +
    '&page_size=8&langs=id,en&fields=code,product_name,product_name_id,product_name_en,brands,nutriments,serving_size', {
      muteHttpExceptions: true, headers: { 'User-Agent': OFF_UA }
    });
  if (res.getResponseCode() !== 200) throw new Error('Open Food Facts HTTP ' + res.getResponseCode());
  const hits = (JSON.parse(res.getContentText()).hits || []).slice(0, 8);
  const text = JSON.stringify(hits);
  if (text.length < 90000) cache.put(ck, text, 21600);
  return hits;
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

function analyze_(summary, device, user) {
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
  logAnalysis_(summary, a, device, user);
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

function logInfo_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setBackground('#2e7d32').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(5, 420);
    sh.setColumnWidth(6, 420);
    return { sh: sh, head: LOG_HEADERS.slice() };
  }
  let head = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim()) : [];
  while (head.length && head[head.length - 1] === '') head.pop();
  const missing = LOG_HEADERS.filter(h => head.indexOf(h) < 0);
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#2e7d32').setFontColor('#ffffff');
    head = head.concat(missing);
  }
  return { sh: sh, head: head };
}

function logAnalysis_(summary, a, device, user) {
  try {
    const info = logInfo_();
    const recs = (a.rekomendasi || []).map(r => '• ' + (r.judul ? r.judul + ': ' : '') + r.detail).join('\n');
    const hasil = summary.hasil || {};
    const obj = {
      waktu: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), periode: String(summary.periode || ''),
      skor_aplikasi: hasil.skor_aplikasi === undefined ? '' : hasil.skor_aplikasi, skor_ai: a.skor >= 0 ? a.skor : '',
      ringkasan: a.ringkasan, rekomendasi: recs, device: device || '', user: user || ''
    };
    info.sh.appendRow(info.head.map(h => obj[h] === undefined ? '' : obj[h]));
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
  Logger.log(JSON.stringify(analyze_(contoh, 'tes editor', ''), null, 2));
  Logger.log(ask_('Camilan sehat di bawah 150 kkal?', contoh, []));
}

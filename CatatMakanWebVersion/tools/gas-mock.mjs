// Tiruan Google Apps Script + Spreadsheet untuk menjalankan apps-script/Code.gs di Node (uji tanpa Google).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DEFAULT_CODE = new URL('../apps-script/Code.gs', import.meta.url);

function A1(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return [Number(m[2]), c];
}

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = this.sh.rows[this.r - 1 + i]?.[this.c - 1 + j]; row.push(v === undefined ? '' : v); }
      out.push(row);
    }
    return out;
  }
  setValues(v) {
    if (v.length !== this.nr) throw new Error(`setValues: ${v.length} baris, rentang ${this.nr}`);
    v.forEach((row, i) => {
      if (row.length !== this.nc) throw new Error(`setValues: ${row.length} kolom, rentang ${this.nc}`);
      row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x));
    });
    return this;
  }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  setFormula(f) { this.sh.set(this.r, this.c, f); return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setNumberFormat() { return this; }
}

export class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some((x) => x !== '' && x != null)) return i; return 0; }
  getLastColumn() { return this.rows.reduce((m, r) => { for (let i = r.length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] != null) return Math.max(m, i); return m; }, 0); }
  getRange(a, b, c, d) { if (typeof a === 'string') { const [r, cc] = A1(a); return new Range(this, r, cc); } return new Range(this, a, b, c, d); }
  appendRow(arr) { const r = this.getLastRow() + 1; arr.forEach((v, i) => this.set(r, i + 1, v)); }
  setFrozenRows() {} setColumnWidth() {}
  /** Baris data sebagai objek {judul: nilai} (untuk pemeriksaan uji). */
  objects() { const [head, ...rest] = this.rows; return rest.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((hd, i) => [hd, r[i] ?? '']))); }
}

/**
 * Buat lingkungan Apps Script tiruan. preset: {namaSheet: [[baris]]}; sel {ymd:[y,m,d]} = tanggal Sheets.
 * opts.code: path Code.gs lain (mis. versi Android 1.2). opts.ai: kembalikan jawaban AI tiruan.
 */
export function makeEnv(preset = {}, opts = {}) {
  const CODE = readFileSync(opts.code || DEFAULT_CODE, 'utf8');
  const sheets = new Map(Object.entries(preset).map(([n, rows]) => { const s = new Sheet(n); s.rows = rows.map((r) => [...r]); return [n, s]; }));
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getName: () => 'Uji', getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheets: () => [...sheets.values()], deleteSheet: (s) => sheets.delete(s.name),
  };
  let now = opts.realTime ? null : 1000;
  const cache = new Map();
  const aiAnswer = (prompt) => {
    if (prompt.includes('Analisis data pola makan')) return JSON.stringify({ ringkasan: 'Pola makanmu cukup baik (jawaban AI tiruan).', skor: 72, poin_baik: ['Rajin mencatat'], perlu_perbaikan: ['Kurang minum'], rekomendasi: [{ judul: 'Tambah air', detail: 'Minum 8 gelas.' }], menu_besok: [{ waktu: 'Sarapan', menu: 'Oatmeal + pisang', kkal: 300 }], motivasi: 'Semangat!' });
    if (prompt.includes('PERTANYAAN:')) return 'Jawaban AI tiruan: pilih buah potong atau yogurt plain.';
    return JSON.stringify({ items: [{ name: 'Nasi kuning (AI)', portion: '1 piring (250 g)', kcal: 380, protein: 9, carbs: 60, fat: 11 }] });
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (opts.ai && k === 'GEMINI_API_KEY' ? 'kunci-tiruan' : null) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: (d, tz, f) => (f === 'HH:mm' ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        : f === 'yyyy-MM-dd HH:mm' ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`),
      base64EncodeWebSafe: (s) => Buffer.from(typeof s === 'string' ? s : Uint8Array.from(s)).toString('base64url'),
      computeDigest: (alg, s) => [...Buffer.from(String(s)).subarray(0, 16)], DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
    },
    UrlFetchApp: {
      fetch: (url, o = {}) => {
        if (String(url).includes('generativelanguage')) {
          const body = JSON.parse(o.payload);
          const text = aiAnswer(body.contents[0].parts[0].text);
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) };
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ hits: [{ product_name: 'Indomie Goreng', brands: 'Indomie', serving_size: '85 g', nutriments: { 'energy-kcal_serving': 380, proteins_serving: 8, carbohydrates_serving: 54, fat_serving: 14 }, url }] }) };
      },
    },
    Logger: { log() {} },
    Date: now === null ? Date : class extends Date { static now() { return now; } },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  for (const s of sheets.values()) s.rows = s.rows.map((r) => r.map((v) => (v && v.ymd ? new ctx.Date(v.ymd[0], v.ymd[1] - 1, v.ymd[2]) : v)));
  const fn = (name) => vm.runInContext(name, ctx);
  return {
    sheets,
    tick: (ms = 1000) => { if (now !== null) now += ms; },
    getRaw: (params) => fn('doGet')({ parameter: params }).s,
    postRaw: (text) => fn('doPost')({ postData: { contents: text } }).s,
    get(params) { return JSON.parse(this.getRaw(params)); },
    post(body) { return JSON.parse(this.postRaw(JSON.stringify(body))); },
    setup: () => fn('setup')(),
  };
}

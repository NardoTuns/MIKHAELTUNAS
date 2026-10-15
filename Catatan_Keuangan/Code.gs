/**
 * =====================================================================
 *  CATATAN KEUANGAN — Backend Google Apps Script
 *  Tempel seluruh isi file ini di: Spreadsheet → Ekstensi → Apps Script
 *  Lihat PANDUAN.md untuk langkah lengkap.
 * =====================================================================
 */

// Kode rahasia (opsional tapi disarankan). Isi juga di aplikasi: Pengaturan → Kode rahasia.
const TOKEN = 'dodotunas';

const SHEET_TRX = 'Transaksi';
const SHEET_SET = 'Pengaturan';
const SHEET_SUM = 'Ringkasan';
const FOLDER_NAME = 'Foto Catatan Keuangan';
const HEADERS = ['ID', 'Tanggal', 'Jam', 'Penginput', 'Jenis', 'Sumber Dana', 'Kategori', 'Uraian', 'Jumlah',
  'Keterangan', 'Foto', 'Grup', 'Dibuat', 'Diubah', 'Perangkat'];

/** Jalankan SEKALI dari editor (pilih fungsi "setup" → Jalankan) untuk memberi izin & membuat sheet. */
function setup() {
  sheet_();
  settingsSheet_();
  summarySheet_();
  folder_();
  Logger.log('Siap! Sekarang Deploy → New deployment → Web app.');
}

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out_({ ok: false, error: 'Data kiriman tidak valid' }); }
  return handle_(body);
}

function handle_(req) {
  try {
    if (TOKEN && req.token !== TOKEN) return out_({ ok: false, error: 'Kode rahasia (token) salah' });
    switch (req.action) {
      case 'ping': return out_({ ok: true, name: SpreadsheetApp.getActive().getName(), time: new Date().toISOString() });
      case 'upsert': return out_(upsert_(req.records || []));
      case 'delete': return out_(remove_(req.ids || []));
      case 'list': return out_(list_());
      case 'saveSettings': return out_(saveSettings_(req.settings, req.updatedAt));
      default: return out_({ ok: false, error: 'Aksi tidak dikenal' });
    }
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------- Sheet ---------------------------- */
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_TRX);
  if (!sh) sh = ss.insertSheet(SHEET_TRX, 0);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:D').setNumberFormat('@');   // ID, Tanggal, Jam, Penginput sebagai teks
    sh.getRange('L:O').setNumberFormat('@');
    sh.getRange('I:I').setNumberFormat('#,##0');
    sh.setColumnWidth(1, 90); sh.setColumnWidth(8, 220); sh.setColumnWidth(10, 180);
  }
  return sh;
}

function settingsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_SET);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SET);
    sh.getRange('A1:B1').setValues([['Data pengaturan aplikasi (jangan diubah manual)', '']]);
  }
  return sh;
}

function summarySheet_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(SHEET_SUM)) return;
  const sh = ss.insertSheet(SHEET_SUM);
  sh.getRange('A1:D1').setValues([['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih']])
    .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
  sh.getRange('A2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(LEFT(Transaksi!B2:B,7),Transaksi!B2:B<>"")),1,FALSE),"")');
  sh.getRange('B2').setFormula('=MAP(A2:A,LAMBDA(m,IF(m="","",SUMIFS(Transaksi!I:I,Transaksi!B:B,m&"*",Transaksi!E:E,"Masuk"))))');
  sh.getRange('C2').setFormula('=MAP(A2:A,LAMBDA(m,IF(m="","",SUMIFS(Transaksi!I:I,Transaksi!B:B,m&"*",Transaksi!E:E,"Keluar"))))');
  sh.getRange('D2').setFormula('=MAP(A2:A,LAMBDA(m,IF(m="","",SUMIFS(Transaksi!I:I,Transaksi!B:B,m&"*",Transaksi!E:E,"Masuk")-SUMIFS(Transaksi!I:I,Transaksi!B:B,m&"*",Transaksi!E:E,"Keluar"))))');
  sh.getRange('B:D').setNumberFormat('#,##0');
  sh.setFrozenRows(1);
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

/* ---------------------------- Simpan ---------------------------- */
function upsert_(records) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
    const index = {};
    ids.forEach(function (id, i) { if (id) index[id] = i + 2; });

    const results = [];
    const appends = [];
    const appendPos = {};
    records.forEach(function (r) {
      if (!r || !r.id) return;
      const row = index[r.id];
      let fotoUrl = r.fotoUrl || '';
      if (r.fotoData) fotoUrl = savePhoto_(r) || fotoUrl;
      else if (!fotoUrl && row) fotoUrl = sh.getRange(row, 11).getDisplayValue(); // pertahankan foto lama

      const values = [
        r.id, r.tanggal, r.jam, r.penginput, r.jenis === 'masuk' ? 'Masuk' : 'Keluar', r.sumber,
        r.kategori || '', r.uraian, Number(r.jumlah) || 0, r.keterangan || '', fotoUrl,
        r.groupId || '', r.createdAt || '', r.updatedAt || '', r.device || ''
      ];
      if (row) sh.getRange(row, 1, 1, values.length).setValues([values]);
      else if (appendPos[r.id] !== undefined) appends[appendPos[r.id]] = values; // ID ganda dalam satu kiriman
      else { appendPos[r.id] = appends.length; appends.push(values); }
      results.push({ id: r.id, fotoUrl: fotoUrl });
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, HEADERS.length).setValues(appends);
    return { ok: true, results: results };
  } finally {
    lock.releaseLock();
  }
}

function savePhoto_(r) {
  try {
    const m = String(r.fotoData).match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (!m) return '';
    const name = (r.tanggal || '') + '_' + String(r.uraian || 'foto').replace(/[^\w\- ]/g, '').slice(0, 40) + '_' + String(r.id).slice(0, 8) + '.jpg';
    const file = folder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain membatasi */ }
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

function remove_(ids) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last < 2) return { ok: true, deleted: 0 };
    const want = {};
    ids.forEach(function (id) { want[id] = true; });
    const col = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    let n = 0;
    for (let i = col.length - 1; i >= 0; i--) {
      if (want[col[i][0]]) { sh.deleteRow(i + 2); n++; }
    }
    return { ok: true, deleted: n };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------- Ambil ---------------------------- */
function list_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const records = [];
  if (last > 1) {
    const rng = sh.getRange(2, 1, last - 1, HEADERS.length);
    const disp = rng.getDisplayValues();
    const raw = rng.getValues();
    const now = new Date().toISOString();
    let fixed = false;
    for (let i = 0; i < disp.length; i++) {
      const d = disp[i];
      // baris yang diketik manual di Spreadsheet (tanpa ID) → beri ID otomatis
      if (!d[0] && d[7] && raw[i][8] !== '') {
        d[0] = Utilities.getUuid();
        sh.getRange(i + 2, 1).setValue(d[0]);
        sh.getRange(i + 2, 14).setValue(now);
        d[13] = now; fixed = true;
      }
      if (!d[0]) continue;
      records.push({
        id: d[0], tanggal: normDate_(raw[i][1], d[1]), jam: normTime_(raw[i][2], d[2]), penginput: d[3],
        jenis: String(d[4]).toLowerCase().indexOf('masuk') === 0 ? 'masuk' : 'keluar',
        sumber: d[5], kategori: d[6], uraian: d[7], jumlah: Number(raw[i][8]) || 0, keterangan: d[9],
        fotoUrl: d[10], groupId: d[11], createdAt: d[12], updatedAt: d[13] || '', device: d[14]
      });
    }
    if (fixed) SpreadsheetApp.flush();
  }
  const set = settingsSheet_();
  let settings = null;
  const json = set.getRange('A2').getValue();
  if (json) {
    try { settings = { data: JSON.parse(json), updatedAt: String(set.getRange('B2').getValue() || '') }; } catch (e) { settings = null; }
  }
  return { ok: true, records: records, settings: settings };
}

function normDate_(raw, disp) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (raw instanceof Date) return Utilities.formatDate(raw, tz, 'yyyy-MM-dd');
  const s = String(disp || raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); // dd/mm/yyyy
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

function normTime_(raw, disp) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (raw instanceof Date) return Utilities.formatDate(raw, tz, 'HH:mm');
  const m = String(disp || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '00:00';
}

/* ---------------------------- Pengaturan ---------------------------- */
function saveSettings_(settings, updatedAt) {
  const sh = settingsSheet_();
  const cur = String(sh.getRange('B2').getValue() || '');
  if (cur && updatedAt && cur > updatedAt) return { ok: true, skipped: true }; // versi server lebih baru
  sh.getRange('A2:B2').setNumberFormat('@').setValues([[JSON.stringify(settings || {}), updatedAt || new Date().toISOString()]]);
  return { ok: true };
}

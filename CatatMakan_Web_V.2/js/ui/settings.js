// Tab "Pengaturan" (port SettingsScreen.kt + pengguna, cadangan file, aplikasi/update).
import { h, icon, toast, confirmDialog, pickFile, downloadBlob, shareFile } from './dom.js';
import { S, settings, saveSettings, saveApp, deleteMenu, menuTotal, syncNow, ensureServer, scriptUrlFor, serverInfo, exportBackup, importBackup, emit, isLocked, isMain } from '../state.js';
import { countUnsynced, requestPersist } from '../core/db.js';
import { clearCache, aiStatus, testAi } from '../core/online.js';
import { buildIcs } from '../core/reminders.js';
import { fmt, fmtDateTime, today } from '../core/util.js';
import { APP_VERSION, DEFAULT_SCRIPT_URL } from '../config.js';
import { openCalculator } from './calc.js';
import { avatar, editUser, trySwitch, pinDialog, deleteUserFlow, addMemberFlow, lockBanner } from './users.js';
import { shareText } from './dom.js';

const section = (title, ...kids) => h('div', { class: 'card col', style: { gap: '10px' } }, h('h3', { style: { margin: 0 }, text: title }), ...kids);
const note = (text) => h('div', { class: 'small muted', style: { whiteSpace: 'pre-line' }, text });

function switchRow(label, checked, onChange, sub) {
  const sw = h('input', { type: 'checkbox', class: 'switch', checked });
  sw.addEventListener('change', () => onChange(sw.checked));
  return h('label', { class: 'switch-row' }, h('div', { class: 'txt' }, h('div', { text: label }), sub ? h('div', { class: 'tiny muted', text: sub }) : null), sw);
}

function timeChip(emoji, value, onChange) {
  const inp = h('input', { type: 'time', value, style: { width: 'auto', minHeight: '38px', padding: '6px 8px' } });
  inp.addEventListener('change', () => { if (inp.value) onChange(inp.value); });
  return h('label', { class: 'row chip soft', style: { padding: '2px 4px 2px 10px' } }, emoji, inp);
}

/** Status & cara mengaktifkan AI (kunci Gemini di Apps Script). */
function aiSection(ctx) {
  const sv = serverInfo();
  let state; let text;
  if (aiStatus.active === true || (aiStatus.active === null && sv?.ai)) { state = 'ok'; text = 'AI aktif — kalori masakan rumahan/warung dicari otomatis.'; }
  else if (aiStatus.active === false && aiStatus.reason === 'BAD_KEY') { state = 'bad'; text = 'Kunci AI ditolak Google. Periksa lagi nilai GEMINI_API_KEY.'; }
  else if (aiStatus.active === false && aiStatus.reason === 'QUOTA') { state = 'warn'; text = 'Kuota AI gratis sedang habis. Coba lagi nanti.'; }
  else if (aiStatus.active === false && aiStatus.reason === 'NETWORK') { state = 'warn'; text = 'Server Spreadsheet tidak terjangkau (cek internet).'; }
  else if ((aiStatus.active === false && aiStatus.reason === 'NO_KEY') || sv?.ai === false) { state = 'bad'; text = 'AI belum aktif: GEMINI_API_KEY belum diisi di Apps Script.'; }
  else { state = 'warn'; text = 'Status AI belum dicek.'; }
  const result = h('div', { class: 'small', style: { whiteSpace: 'pre-line' } });
  const checkBtn = h('button', {
    class: 'btn small', text: '🤖 Cek AI',
    onclick: async () => {
      const url = scriptUrlFor();
      if (!url) { result.textContent = 'Isi URL Web App dulu.'; return; }
      checkBtn.disabled = true; result.textContent = 'Menghubungi AI… (bisa 5–20 detik)';
      try {
        const items = await testAi(url);
        result.textContent = '✅ AI aktif! Contoh: ' + (items.map((i) => `${i.name} (${i.info}) ±${fmt(i.kcal)} kkal`).join('; ') || 'jawaban kosong');
        try { await ensureServer(url, true); } catch { /* abaikan */ }
        toast('AI aktif — kalori dicari otomatis saat mengetik');
        setTimeout(() => ctx.render(), 1500);
      } catch (e) { result.textContent = '⚠️ ' + e.message; } finally { checkBtn.disabled = false; }
    },
  });
  const steps = h('ol', { class: 'step-list small' },
    h('li', {}, 'Buka ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener', text: 'aistudio.google.com/apikey' }),
      ' → masuk dengan akun Google → ', h('b', { text: 'Create API key' }), ' → salin kuncinya (diawali ', h('span', { class: 'kbd', text: 'AIza' }), '). Gratis.'),
    h('li', {}, 'Buka Google Spreadsheet Anda → menu ', h('b', { text: 'Ekstensi › Apps Script' }), '.'),
    h('li', {}, 'Di kiri, klik ikon ', h('b', { text: '⚙️ Setelan project' }), ' → gulir ke bawah ke ', h('b', { text: 'Properti skrip' }), ' → ', h('b', { text: 'Tambahkan properti skrip' }), '.'),
    h('li', {}, 'Properti: ', h('span', { class: 'kbd', text: 'GEMINI_API_KEY' }), ' (huruf besar, persis) · Nilai: tempel kunci → ', h('b', { text: 'Simpan properti skrip' }), '.'),
    h('li', {}, 'Tidak perlu deploy ulang. Kembali ke sini lalu ketuk ', h('b', { text: 'Cek AI' }), '.'));
  const card = section('🤖 AI (Gemini)',
    h('div', { class: 'banner ' + (state === 'ok' ? '' : 'warn') }, h('span', { text: state === 'ok' ? '✅' : state === 'bad' ? '⚠️' : 'ℹ️' }), h('span', { class: 'grow', text: text })),
    h('div', { class: 'row' }, checkBtn), result,
    state === 'ok' ? h('details', {}, h('summary', { class: 'small muted', text: 'Cara mengaktifkan AI' }), steps)
      : h('div', {}, h('div', { class: 'bold small', text: 'Cara mengaktifkan AI (±3 menit, sekali saja):' }), steps),
    note('AI dipakai untuk: saran kalori saat mengetik, Foto AI, Analisis AI, dan Tanya ahli gizi AI. Kunci disimpan di Apps Script milik Anda, bukan di aplikasi.'));
  card.id = 'ai-setup';
  return card;
}

export function renderSettings(root, ctx) {
  const s = settings();
  const locked = isLocked();
  root.append(h('h2', { text: 'Pengaturan' }), ...[lockBanner()].filter(Boolean));

  // ---- pengguna
  root.append(section('👥 Anggota keluarga di HP ini',
    h('div', { class: 'card flat tight' }, ...S.users.map((u, i) => h('div', { class: 'list-item', style: i === 0 ? { borderTop: 0 } : null },
      h('span', { onclick: () => trySwitch(u) }, avatar(u)),
      h('div', { class: 'grow', onclick: () => trySwitch(u) }, h('div', { class: 't bold', text: u.name + (u.id === S.user.id ? ' (aktif)' : '') }),
        h('div', { class: 's', text: [isMain(u) ? (isLocked(u) ? '🔒 Akun utama · hanya bisa dilihat' : 'Pengguna utama') : `ID sinkron: ${u.syncId}`, u.syncEnabled === false ? 'tidak sinkron' : null, u.pinHash ? '🔑 PIN' : null].filter(Boolean).join(' · ') })),
      isLocked(u) ? null : h('button', { class: 'icon-btn', 'aria-label': 'Ubah ' + u.name, onclick: () => editUser(u, ctx) }, icon('edit')),
      h('button', { class: 'icon-btn', 'aria-label': 'PIN ' + u.name, onclick: () => pinDialog(u) }, icon('lock')),
      isMain(u) ? null : h('button', { class: 'icon-btn', 'aria-label': 'Hapus ' + u.name, onclick: () => deleteUserFlow(u) }, icon('trash'))))),
    h('button', { class: 'btn tonal', onclick: () => addMemberFlow(ctx) }, icon('plus'), 'Tambah anggota'),
    note('Ketuk foto profil di kiri atas atau baris "Siapa yang mencatat?" di tab Hari Ini untuk berpindah. Setiap anggota punya catatan, target, menu favorit, dan sinkron sendiri. Akun utama (pemilik) hanya bisa dilihat dari web; ubahlah lewat aplikasi Android.')));

  if (locked) {
    root.append(section('🔒 Akun utama terkunci',
      note('Pada akun ini target, profil, pengingat, dan menu favorit hanya bisa dilihat. Pilih anggota keluarga untuk mengatur dan mencatat. Pengaturan sinkron, AI, tampilan, dan cadangan di bawah berlaku untuk semua anggota.')));
  }

  // ---- profil & target (anggota keluarga saja)
  if (!locked) {
  const kcalIn = h('input', { type: 'number', inputmode: 'numeric', min: 800, max: 6000, value: s.targetKcal });
  const waterIn = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 30, value: s.targetWater });
  const warn = h('div', { class: 'small' });
  const drawWarn = () => {
    const k = parseInt(kcalIn.value, 10) || 0;
    warn.className = 'small ' + (k > 0 && k < 1200 ? 'over' : 'muted');
    warn.textContent = k > 0 && k < 1200 ? 'Target di bawah 1.200 kkal umumnya perlu pendampingan dokter atau ahli gizi agar kebutuhan gizi tetap tercukupi.' : 'Atur sesuai saran ahli gizi atau kebutuhanmu. Bisa diubah kapan saja.';
  };
  kcalIn.addEventListener('input', drawWarn);
  kcalIn.addEventListener('change', () => { const v = parseInt(kcalIn.value, 10); if (v >= 500 && v <= 8000) saveSettings({ targetKcal: v }); });
  waterIn.addEventListener('change', () => { const v = parseInt(waterIn.value, 10); if (v >= 1 && v <= 30) saveSettings({ targetWater: v }); });
  drawWarn();
  root.append(section('🎯 Target',
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', { text: 'Target kkal/hari' }), kcalIn), h('label', { class: 'field grow' }, h('span', { text: 'Target air (gelas)' }), waterIn)),
    warn,
    h('button', { class: 'btn tonal', text: '🧮 Hitung target otomatis', onclick: () => openCalculator() })));

  // ---- puasa
  root.append(section('⏳ Jendela puasa (opsional)',
    note('Menampilkan berapa lama sejak terakhir makan di tab Hari Ini, misalnya untuk puasa 16:8.'),
    h('div', { class: 'row wrap' }, ...[[0, 'Mati'], [12, '12 jam'], [14, '14 jam'], [16, '16 jam'], [18, '18 jam']].map(([v, l]) =>
      h('button', { class: 'chip' + (s.fastingHours === v ? ' on' : ''), text: l, onclick: () => saveSettings({ fastingHours: v }) })))));

  // ---- saran online
  root.append(section('🌐 Saran kalori online',
    switchRow('Saran otomatis saat mengetik', s.onlineSuggest, (v) => saveSettings({ onlineSuggest: v }), 'Saat online, kalori dicari otomatis dari AI & database produk'),
    note('• Produk kemasan & scan barcode: langsung jalan, tanpa pengaturan.\n• Masakan rumahan/warung, Foto AI, Analisis & Tanya AI: butuh kunci AI Gemini gratis di Apps Script (lihat di bawah).\n• Hasil yang pernah dicari disimpan di HP, jadi tetap muncul saat offline.'),
    h('button', { class: 'btn text', style: { alignSelf: 'flex-start' }, text: 'Hapus riwayat saran online', onclick: async () => { const n = await clearCache(); toast(`Riwayat saran online dihapus (${n})`); } })));
  } // akhir bagian khusus anggota (target, puasa, saran online)
  root.append(aiSection(ctx));

  if (!locked) {
  // ---- menu favorit
  if (S.menus.length) {
    root.append(section('⭐ Menu favorit', ...S.menus.map((m) => h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('div', { text: m.name }), h('div', { class: 'small muted', text: m.items.map((i) => i.name).join(', ') + ` · ${fmt(menuTotal(m))} kkal` })),
      h('button', { class: 'icon-btn', 'aria-label': 'Hapus menu', onclick: async () => { if (await confirmDialog('Hapus menu?', m.name, 'Hapus')) deleteMenu(m.id); } }, icon('trash'))))));
  }

  // ---- pengingat
  const notifState = !('Notification' in window) ? 'tidak didukung' : Notification.permission === 'granted' ? 'aktif' : Notification.permission === 'denied' ? 'diblokir' : 'belum diizinkan';
  root.append(section('🔔 Pengingat',
    switchRow('Pengingat waktu makan', s.remindMeals, (v) => saveSettings({ remindMeals: v }), 'Tidak muncul jika sudah dicatat'),
    s.remindMeals ? h('div', { class: 'row wrap' }, timeChip('🍳', s.breakfastTime, (t) => saveSettings({ breakfastTime: t })),
      timeChip('🍛', s.lunchTime, (t) => saveSettings({ lunchTime: t })), timeChip('🍲', s.dinnerTime, (t) => saveSettings({ dinnerTime: t }))) : null,
    h('hr', { class: 'div' }),
    switchRow('Pengingat minum air', s.remindWater, (v) => saveSettings({ remindWater: v }), 'Antara pukul 08.00–21.00'),
    s.remindWater ? h('div', { class: 'row' }, ...[1, 2, 3].map((n) => h('button', { class: 'chip' + (s.waterEveryHours === n ? ' on' : ''), text: `Tiap ${n} jam`, onclick: () => saveSettings({ waterEveryHours: n }) }))) : null,
    h('hr', { class: 'div' }),
    switchRow('Ringkasan malam', s.remindSummary, (v) => saveSettings({ remindSummary: v }), 'Total kalori & air hari itu'),
    s.remindSummary ? h('div', { class: 'row' }, timeChip('📊', s.summaryTime, (t) => saveSettings({ summaryTime: t }))) : null,
    h('hr', { class: 'div' }),
    switchRow('Timbang tiap Senin pagi', s.remindWeight, (v) => saveSettings({ remindWeight: v })),
    switchRow('Laporan mingguan', s.remindWeekly, (v) => saveSettings({ remindWeekly: v }), 'Senin pagi: skor & analisis minggu lalu'),
    h('hr', { class: 'div' }),
    h('div', { class: 'row' }, h('span', { text: notifState === 'aktif' ? '✅' : '⚠️' }), h('span', { class: 'grow', text: 'Izin notifikasi' }), h('b', { class: 'small', text: notifState })),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn small', onclick: () => ctx.testNotification() }, icon('bell'), 'Tes notifikasi'),
      h('button', { class: 'btn small tonal', onclick: () => {
        const ics = buildIcs(s, { startDate: today(), userName: S.user.name, appUrl: location.href.split('#')[0].split('?')[0], uidSeed: (S.user.syncId || 'utama') + '-' + S.user.id.slice(0, 8) });
        shareFile(new Blob([ics], { type: 'text/calendar' }), `Pengingat_CatatMakan_${S.user.name.replace(/[^\w-]+/g, '_')}.ics`, 'Pengingat Catat Makan');
      } }, icon('calendar'), 'Tambahkan ke Kalender HP')),
    note('Notifikasi muncul saat aplikasi terbuka atau berjalan di latar. Agar pengingat tetap berbunyi walau aplikasi ditutup (terutama di iPhone), ketuk "Tambahkan ke Kalender HP" lalu buka file .ics-nya → Tambahkan semua. Jika jadwal berubah, hapus kalender lama lalu tambahkan lagi.')));
  } // akhir bagian khusus anggota (menu favorit, pengingat)

  // ---- sinkron
  const sv = serverInfo();
  const urlIn = h('input', { type: 'url', value: S.app.scriptUrl, placeholder: 'https://script.google.com/macros/s/…/exec' });
  urlIn.addEventListener('change', async () => { S.app.scriptUrl = urlIn.value.trim(); await saveApp(); emit('settings'); });
  const result = h('div', { class: 'small', style: { whiteSpace: 'pre-line' } });
  const status = h('div', { class: 'small' });
  countUnsynced(S.user.id).then((n) => { status.textContent = `Status: ${S.sync.lastAt ? `${fmtDateTime(S.sync.lastAt)} — ${S.sync.lastMsg}` : 'Belum pernah sinkron.'}${locked ? ' · akun terkunci: hanya menerima data' : n ? ` · ${n} perubahan belum terkirim` : ' · semua sudah terkirim'}`; });
  const inviteLink = () => `${location.href.split('#')[0].split('?')[0]}#url=${encodeURIComponent(S.app.scriptUrl)}`;
  root.append(section('☁️ Backup & sinkron Spreadsheet',
    note('Data selalu tersimpan di HP dan bisa dipakai tanpa internet — termasuk yang sudah tersinkron. Saat online, data dikirim ke Google Spreadsheet dan data dari HP lain ikut ditarik.'),
    h('label', { class: 'field' }, h('span', { text: 'URL Web App (…/exec) — dipakai semua pengguna' }), urlIn),
    DEFAULT_SCRIPT_URL && S.app.scriptUrl !== DEFAULT_SCRIPT_URL ? h('button', { class: 'btn text', style: { alignSelf: 'flex-start' }, text: 'Kembalikan ke URL bawaan', onclick: async () => { S.app.scriptUrl = DEFAULT_SCRIPT_URL; await saveApp(); ctx.render(); } }) : null,
    S.app.scriptUrl ? h('div', { class: 'col', style: { gap: '4px' } },
      h('button', { class: 'btn tonal small', style: { alignSelf: 'flex-start' }, text: '🔗 Bagikan tautan undangan keluarga', onclick: () => shareText(`Buka tautan ini di HP untuk memakai Catat Makan keluarga:\n${inviteLink()}`, 'Undangan Catat Makan') }),
      note('Tautan berisi alamat Spreadsheet keluarga. Kirim hanya lewat WhatsApp ke anggota keluarga, jangan ditaruh di tempat umum.')) : null,
    S.user.scriptUrl ? note(`Pengguna ${S.user.name} memakai URL khusus: ${S.user.scriptUrl}`) : null,
    switchRow('Sinkron otomatis', S.app.autoSync, async (v) => { S.app.autoSync = v; await saveApp(); }, 'Setiap ada perubahan, saat aplikasi dibuka, dan saat internet kembali'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn ghost small', text: 'Tes koneksi', onclick: async () => {
        const url = scriptUrlFor();
        if (!url) { result.textContent = 'URL Web App masih kosong'; return; }
        result.textContent = 'Menghubungi…';
        try {
          const info = await ensureServer(url, true);
          result.textContent = '✓ ' + (info.message || 'Terhubung') +
            (info.multiUser ? '\n✓ Mendukung banyak pengguna & sinkron profil.' : '\n⚠️ Code.gs masih versi ' + info.version + ': anggota keluarga belum bisa sinkron. Ganti dengan apps-script/Code.gs versi 2.1 (lihat README).') +
            (info.multiUser && !info.hasMembers ? '\n⚠️ Code.gs belum yang terbaru: daftar anggota otomatis & kunci akun utama di server belum aktif. Tempel ulang apps-script/Code.gs lalu Terapkan versi baru.' : '') +
            (info.hasRecap ? '\n✓ Rekap gizi AI & menu keluarga tersedia.' : '');
          ctx.render();
        } catch (e) { result.textContent = 'Gagal: ' + e.message; }
      } }),
      h('button', { class: 'btn small', disabled: S.sync.running, onclick: async () => { const m = await syncNow(); toast(m || 'Selesai'); } }, icon('sync'), S.sync.running ? 'Menyinkron…' : 'Sinkron sekarang'),
      S.users.length > 1 ? h('button', { class: 'btn tonal small', text: 'Sinkron semua pengguna', onclick: async () => { await syncNow({ all: true }); toast('Sinkron semua pengguna selesai'); } }) : null),
    result, status,
    sv ? note(`Server: Code.gs v${sv.version}${sv.multiUser ? ' (multi pengguna)' : ''}${sv.ai ? ' · AI aktif' : ' · AI belum aktif'} · dicek ${fmtDateTime(sv.checkedAt)}`) : null,
    h('button', { class: 'btn text', style: { alignSelf: 'flex-start' }, text: 'Ambil ulang semua data dari Spreadsheet', onclick: async () => { const m = await syncNow({ fullReload: true }); toast(m || 'Selesai'); } }),
    note('HP baru? Buka tautan undangan, pilih nama anggota dari daftar (atau tambahkan dengan ID sinkron yang sama), lalu ketuk tombol di atas.')));

  // ---- cadangan file
  root.append(section('💾 Cadangan file (tanpa internet)',
    note('Simpan semua catatan ke file .json di HP/Google Drive, lalu pulihkan kapan saja — juga untuk pindah HP tanpa Spreadsheet.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn tonal small', onclick: async () => downloadBlob(new Blob([JSON.stringify(await exportBackup())], { type: 'application/json' }), `CatatMakan_${S.user.name.replace(/[^\w-]+/g, '_')}_${today()}.json`) }, icon('download'), 'Cadangkan pengguna ini'),
      S.users.length > 1 ? h('button', { class: 'btn tonal small', onclick: async () => downloadBlob(new Blob([JSON.stringify(await exportBackup({ all: true }))], { type: 'application/json' }), `CatatMakan_semua_${today()}.json`) }, icon('download'), 'Cadangkan semua') : null,
      h('button', { class: 'btn ghost small', onclick: async () => {
        const f = await pickFile({ accept: '.json,application/json' });
        if (!f) return;
        try {
          const r = await importBackup(JSON.parse(await f.text()));
          toast(`Dipulihkan: ${r.records} catatan${r.added ? `, ${r.added} anggota baru` : ''}${r.skipped ? `. Akun utama dilewati (terkunci).` : ''}`);
        } catch (e) { toast('Gagal: ' + e.message); }
      } }, icon('upload'), 'Pulihkan dari file'))));

  // ---- aplikasi
  const themeSeg = h('div', { class: 'seg' }, ...[['auto', 'Otomatis'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) =>
    h('button', { class: S.app.theme === v ? 'on' : '', text: l, onclick: async () => { S.app.theme = v; await saveApp(); ctx.applyTheme(); ctx.render(); } })));
  const persist = h('span', { class: 'small muted' });
  requestPersist().then((ok) => { persist.textContent = ok ? '✅ Data dilindungi dari pembersihan otomatis browser' : 'ℹ️ Browser dapat membersihkan data bila memori penuh — rutin sinkron atau cadangkan file.'; });
  root.append(section('📲 Aplikasi',
    h('div', { class: 'row' }, h('span', { class: 'grow', text: `Versi terpasang: ${APP_VERSION}` }),
      h('button', { class: 'btn small', onclick: () => ctx.checkUpdate(true) }, icon('download'), 'Update')),
    ctx.updateInfo ? note(ctx.updateInfo) : null,
    ctx.installState() === 'installed' ? note('✅ Sudah terpasang sebagai aplikasi.')
      : h('button', { class: 'btn tonal', onclick: () => ctx.install() }, icon('phone'), 'Pasang di layar utama (Android / iPhone)'),
    h('div', { class: 'field' }, h('span', { text: 'Tampilan' }), themeSeg),
    persist));

  root.append(section('ℹ️ Tentang',
    note(`Catat Makan Web ${APP_VERSION}. Nilai kalori bawaan adalah perkiraan umum per porsi; sesuaikan dengan porsi dan merek yang kamu makan. Analisis & saran bersifat umum, bukan pengganti saran dokter atau ahli gizi.`),
    note('Aplikasi ini berjalan sepenuhnya di HP: data disimpan di penyimpanan browser (IndexedDB) dan hanya dikirim ke Google Spreadsheet milikmu sendiri.')));
}

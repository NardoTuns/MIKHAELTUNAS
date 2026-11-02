// Banyak pengguna: daftar, ganti cepat ("Siapa yang mencatat?"), tambah/ubah, PIN opsional.
// Pengguna utama (pemilik) terkunci: tampil & bisa dilihat, tidak bisa diubah dari web.
import { h, icon, sheet, dialog, toast, confirmDialog, clear } from './dom.js';
import {
  S, createUser, updateUser, switchUser, removeUser, setPin, checkPin, suggestSyncId, validateSyncId, serverInfo,
  isLocked, isMain, editableUsers, ensureServer, scriptUrlFor, syncNow, teamToday,
} from '../state.js';
import { listMembers } from '../core/sync.js';
import { AVATAR_EMOJIS, AVATAR_COLORS } from '../config.js';
import { fmt } from '../core/util.js';

export const avatar = (u, cls = '') => h('span', { class: 'avatar ' + cls, style: { background: u.color }, text: u.emoji, 'aria-hidden': 'true' });

export const LOCK_HINT = 'Akun utama hanya bisa dilihat di versi web. Data diubah lewat aplikasi Android.';

/** Papan PIN. Mengembalikan true bila PIN benar (atau pengguna tanpa PIN). */
export async function askPin(u, title = `PIN ${u.name}`) {
  if (!u.pinHash) return true;
  let entered = '';
  return dialog(title, (finish) => {
    const dots = h('div', { class: 'pin-dots' });
    const msg = h('div', { class: 'small muted center', text: 'Masukkan PIN 4–6 angka' });
    const draw = () => { clear(dots); for (let i = 0; i < Math.max(4, entered.length); i++) dots.append(h('i', { class: i < entered.length ? 'on' : '' })); };
    const tryPin = async () => {
      if (await checkPin(u, entered)) { finish(true); return; }
      entered = ''; draw(); msg.textContent = 'PIN salah, coba lagi'; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
    };
    const press = async (k) => {
      if (k === '⌫') entered = entered.slice(0, -1);
      else if (k === 'OK') { if (entered.length >= 4) await tryPin(); return; } else if (entered.length < 6) entered += k;
      draw();
      if (entered.length === 6) await tryPin();
    };
    draw();
    return h('div', {}, h('div', { class: 'center' }, avatar(u, 'lg')), dots, msg,
      h('div', { class: 'pin-pad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => h('button', { text: k, onclick: () => press(k) }))));
  }, [{ label: 'Batal', value: false }]).then((v) => v === true);
}

export async function trySwitch(u) {
  if (u.id === S.user?.id) return true;
  if (!(await askPin(u))) return false;
  await switchUser(u.id);
  toast(isLocked(u) ? `Melihat akun ${u.name} (hanya dibaca)` : `Sekarang mencatat untuk ${u.name}`);
  return true;
}

const subtitle = (u) => (isMain(u) ? (isLocked(u) ? '🔒 Akun utama · hanya bisa dilihat' : 'Pengguna utama') : `ID sinkron: ${u.syncId}`) + (u.pinHash ? ' · 🔑 PIN' : '');

/** Lembar ganti pengguna (ketuk avatar di atas). */
export function openSwitcher(ctx) {
  sheet((body, close) => {
    body.append(h('h3', { text: 'Siapa yang mencatat?' }),
      h('div', { class: 'card tight' }, ...S.users.map((u, i) => h('div', { class: 'list-item', style: i === 0 ? { borderTop: 0 } : null, onclick: async () => { if (await trySwitch(u)) close(); } },
        avatar(u), h('div', { class: 'grow' }, h('div', { class: 't bold', text: u.name }), h('div', { class: 's', text: subtitle(u) })),
        u.id === S.user.id ? h('span', { class: 'badge ok', text: 'aktif' }) : null))),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn tonal grow', onclick: async () => { close(); await addMemberFlow(ctx); } }, icon('plus'), 'Tambah anggota'),
        h('button', { class: 'btn ghost', text: 'Kelola', onclick: () => { close(); ctx.go('pengaturan'); } })),
      h('p', { class: 'small muted', text: 'Setiap anggota punya catatan, target, menu favorit, dan sinkron sendiri. Akun utama (pemilik) hanya bisa dilihat.' }));
  });
}

/**
 * Baris "Siapa yang mencatat?" di tab Hari Ini: semua anggota dengan kalori & air hari itu. Ketuk untuk berpindah.
 * Diisi asinkron (data anggota lain dibaca dari penyimpanan HP).
 */
export function familyStrip(ctx) {
  if (S.users.length < 2) return null;
  const box = h('div', { class: 'col', style: { gap: '4px' } });
  box.append(h('div', { class: 'small muted bold', text: 'Siapa yang mencatat?' }), h('div', { class: 'team' }));
  teamToday(S.date).then((rows) => {
    const strip = box.querySelector('.team');
    clear(strip);
    for (const r of rows) {
      const locked = isLocked(r.user);
      strip.append(h('button', {
        class: 'member' + (r.user.id === S.user.id ? ' on' : '') + (locked ? ' lockd' : ''), 'aria-label': `${r.user.name}${locked ? ' (hanya dilihat)' : ''}`,
        onclick: async () => { if (r.user.id !== S.user.id) await trySwitch(r.user); },
      }, avatar(r.user), h('div', { class: 'n', text: (locked ? '🔒 ' : '') + r.user.name }),
      h('div', { class: 'k', text: `${fmt(r.kcal)} kkal` }), h('div', { class: 'k', text: `💧 ${r.water}` })));
    }
  }).catch(() => {});
  return box;
}

/** Baris "Catat juga untuk…": pilih anggota lain yang ikut makan. selected = Set ID lokal (diubah di tempat). */
export function alsoRow(selected) {
  const others = editableUsers().filter((u) => u.id !== S.user.id);
  if (!others.length) return null;
  const box = h('div', { class: 'scroll-x' });
  const draw = () => {
    clear(box);
    for (const u of others) {
      box.append(h('button', {
        class: 'chip' + (selected.has(u.id) ? ' on' : ''), 'aria-pressed': selected.has(u.id) ? 'true' : 'false',
        onclick: () => { if (selected.has(u.id)) selected.delete(u.id); else selected.add(u.id); draw(); },
      }, avatar(u, 'sm'), u.name));
    }
  };
  draw();
  return h('div', { class: 'col', style: { gap: '4px' } }, h('span', { class: 'muted small bold', text: '👨‍👩‍👧 Catat juga untuk (makan bersama)' }), box);
}

/** Tambah anggota: pilih dari daftar di Spreadsheet (Code.gs 2.1) atau ketik manual. */
export async function addMemberFlow(ctx) {
  const url = scriptUrlFor();
  let found = null;
  if (url && navigator.onLine) {
    try {
      const info = await ensureServer(url);
      if (info.hasMembers) found = (await listMembers(url)).filter((m) => m.syncId !== '' && !S.users.some((u) => (u.syncId || '') === m.syncId));
    } catch { /* tanpa daftar → ketik manual */ }
  }
  if (found && found.length) {
    const picked = new Set();
    const res = await dialog('Tambah anggota keluarga', (finish) => h('div', { class: 'col' },
      h('p', { class: 'small muted', style: { margin: 0 }, text: 'Anggota yang sudah ada di Spreadsheet. Pilih siapa saja yang akan mencatat di HP ini.' }),
      ...found.map((m) => {
        const cb = h('input', { type: 'checkbox', class: 'switch' });
        cb.addEventListener('change', () => { if (cb.checked) picked.add(m.syncId); else picked.delete(m.syncId); });
        return h('label', { class: 'switch-row' }, h('span', { class: 'txt' }, `${m.emoji || '🙂'} ${m.name || m.syncId}`, h('div', { class: 'tiny muted', text: `ID sinkron: ${m.syncId}` })), cb);
      })),
    [{ label: 'Batal', value: false }, { label: 'Ketik manual', value: 'manual' }, { label: 'Tambah', value: true, kind: 'tonal' }]);
    if (res === true) {
      if (!picked.size) { toast('Pilih minimal satu anggota'); return addMemberFlow(ctx); }
      let first = null;
      for (const m of found.filter((x) => picked.has(x.syncId))) {
        const u = await createUser({ name: m.name || m.syncId, emoji: m.emoji || undefined, color: m.color || undefined, syncId: m.syncId });
        first ||= u;
      }
      toast(`${picked.size} anggota ditambahkan. Mengambil datanya…`);
      syncNow({ silent: true, all: true }).then(() => ctx?.render?.());
      if (first && await confirmDialog('Anggota ditambahkan', `Pindah ke akun ${first.name} sekarang?`, 'Pindah')) await switchUser(first.id);
      return first;
    }
    if (res !== 'manual') return null;
  }
  return editUser(null, ctx);
}

/** Tambah (u = null) atau ubah pengguna. */
export async function editUser(u, ctx) {
  if (u && isLocked(u)) { toast(LOCK_HINT); return null; }
  const isNew = !u;
  const v = { name: u?.name || '', emoji: u?.emoji || AVATAR_EMOJIS[S.users.length % AVATAR_EMOJIS.length], color: u?.color || AVATAR_COLORS[S.users.length % AVATAR_COLORS.length], syncId: u ? u.syncId || '' : '', scriptUrl: u?.scriptUrl || '', syncEnabled: u ? u.syncEnabled !== false : true };
  let syncTouched = !isNew;
  const multi = serverInfo()?.multiUser;
  const res = await dialog(isNew ? 'Tambah anggota' : 'Ubah anggota', () => {
    const prev = h('div', { class: 'center' });
    const nameIn = h('input', { type: 'text', value: v.name, maxlength: 30, placeholder: 'mis. Ibu, Adik', autocomplete: 'off' });
    const syncIn = h('input', { type: 'text', value: v.syncId, placeholder: 'mis. ibu-x1y2', autocomplete: 'off', autocapitalize: 'off' });
    const urlIn = h('input', { type: 'url', value: v.scriptUrl, placeholder: 'kosong = pakai URL umum di Pengaturan' });
    const syncSw = h('input', { type: 'checkbox', class: 'switch', checked: v.syncEnabled });
    const emojis = h('div', { class: 'row wrap' });
    const colors = h('div', { class: 'row wrap' });
    const drawPrev = () => { clear(prev); prev.append(avatar({ emoji: v.emoji, color: v.color }, 'lg')); };
    const drawPick = () => {
      clear(emojis); clear(colors);
      AVATAR_EMOJIS.forEach((e) => emojis.append(h('button', { class: 'chip' + (v.emoji === e ? ' on' : ''), style: { padding: '6px 9px', fontSize: '1.2rem' }, text: e, onclick: () => { v.emoji = e; drawPick(); drawPrev(); } })));
      AVATAR_COLORS.forEach((c) => colors.append(h('button', { 'aria-label': 'Warna ' + c, style: { width: '34px', height: '34px', borderRadius: '50%', border: v.color === c ? '3px solid var(--ink)' : '0', background: c, cursor: 'pointer' }, onclick: () => { v.color = c; drawPick(); drawPrev(); } })));
    };
    nameIn.addEventListener('input', () => { v.name = nameIn.value; if (isNew && !syncTouched) { v.syncId = nameIn.value.trim() ? suggestSyncId(nameIn.value) : ''; syncIn.value = v.syncId; } });
    syncIn.addEventListener('input', () => { syncTouched = true; v.syncId = syncIn.value.trim().toLowerCase(); });
    urlIn.addEventListener('input', () => { v.scriptUrl = urlIn.value.trim(); });
    syncSw.addEventListener('change', () => { v.syncEnabled = syncSw.checked; });
    drawPrev(); drawPick();
    return h('div', { class: 'col' }, prev,
      h('label', { class: 'field' }, h('span', { text: 'Nama panggilan' }), nameIn),
      h('div', { class: 'field' }, h('span', { text: 'Ikon' }), emojis),
      h('div', { class: 'field' }, h('span', { text: 'Warna' }), colors),
      h('label', { class: 'field' }, h('span', { text: 'ID sinkron' }), syncIn,
        h('small', { class: 'muted', text: 'Samakan dengan ID anggota di aplikasi Android (Pengaturan › Anggota keluarga) agar datanya menyatu. ' + (multi === false ? 'Server Anda masih Code.gs 1.x: anggota tambahan belum bisa sinkron.' : '') })),
      h('label', { class: 'switch-row' }, h('span', { class: 'txt' }, 'Sinkron anggota ini', h('div', { class: 'tiny muted', text: 'Matikan bila datanya cukup di HP ini saja.' })), syncSw),
      h('label', { class: 'field' }, h('span', { text: 'URL Web App khusus (opsional)' }), urlIn));
  }, [{ label: 'Batal', value: false }, { label: isNew ? 'Tambah' : 'Simpan', value: true, kind: 'tonal' }]);
  if (!res) return null;
  if (!v.name.trim()) { toast('Isi nama anggota'); return editUser(u, ctx); }
  const err = validateSyncId(v.syncId, u?.id);
  if (err) { toast(err); return editUser(u ? { ...u, ...v } : null, ctx); }
  if (v.scriptUrl && !/^https:\/\//.test(v.scriptUrl)) { toast('URL harus diawali https://'); return null; }
  if (isNew) {
    const nu = await createUser({ name: v.name, emoji: v.emoji, color: v.color, syncId: v.syncId });
    await updateUser(nu.id, { scriptUrl: v.scriptUrl, syncEnabled: v.syncEnabled });
    if (await confirmDialog('Anggota ditambahkan', `Pindah ke akun ${nu.name} sekarang?`, 'Pindah')) await switchUser(nu.id);
    return nu;
  }
  await updateUser(u.id, { name: v.name.trim(), emoji: v.emoji, color: v.color, syncId: v.syncId, scriptUrl: v.scriptUrl, syncEnabled: v.syncEnabled });
  toast('Anggota disimpan');
  return u;
}

export async function pinDialog(u) {
  if (u.pinHash) {
    if (!(await askPin(u, 'Masukkan PIN lama'))) return;
    if (await confirmDialog('PIN', 'Hapus PIN atau ganti dengan yang baru?', 'Ganti PIN')) {
      return pinDialogNew(u);
    }
    await setPin(u.id, null);
    toast('PIN dihapus');
    return;
  }
  return pinDialogNew(u);
}

async function pinDialogNew(u) {
  let pin1;
  const ok = await dialog(`PIN untuk ${u.name}`, () => {
    pin1 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '4–6 angka', autocomplete: 'off' });
    return h('div', { class: 'col' }, h('p', { class: 'small muted', style: { margin: 0 }, text: 'PIN diminta saat berpindah ke akun ini dan saat aplikasi dibuka. Ini kunci sederhana di HP, bukan enkripsi data.' }), pin1);
  }, [{ label: 'Batal', value: false }, { label: 'Lanjut', value: true, kind: 'tonal' }]);
  if (!ok) return;
  const p = pin1.value.trim();
  if (!/^\d{4,6}$/.test(p)) { toast('PIN harus 4–6 angka'); return; }
  let pin2;
  const ok2 = await dialog('Ulangi PIN', () => { pin2 = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' }); return pin2; },
    [{ label: 'Batal', value: false }, { label: 'Simpan', value: true, kind: 'tonal' }]);
  if (!ok2) return;
  if (pin2.value.trim() !== p) { toast('PIN tidak sama'); return; }
  await setPin(u.id, p);
  toast('PIN disimpan');
}

export async function deleteUserFlow(u) {
  if (isMain(u)) { toast('Akun utama tidak bisa dihapus.'); return; }
  if (!(await askPin(u))) return;
  const choice = await dialog(`Hapus ${u.name}?`, `Akun dan semua catatannya akan dihapus dari HP ini. Data yang sudah tersinkron di Spreadsheet tidak ikut terhapus, jadi bisa diambil lagi kapan saja dengan ID sinkron "${u.syncId}".`,
    [{ label: 'Batal', value: null }, { label: 'Hapus akun & data di HP', value: 'data', kind: 'danger-btn' }]);
  if (choice !== 'data') return;
  if (!(await confirmDialog('Yakin?', `Semua catatan ${u.name} di HP ini akan dihapus permanen.`, 'Hapus', 'danger-btn'))) return;
  await removeUser(u.id, { deleteData: true });
  toast('Anggota dihapus');
}

/** Pita pengingat di semua tab saat akun utama (terkunci) sedang dibuka. */
export function lockBanner() {
  if (!isLocked()) return null;
  return h('div', { class: 'lockbar', role: 'note' }, h('span', { text: '🔒' }),
    h('div', { class: 'grow' }, h('b', { text: 'Akun utama hanya bisa dilihat. ' }), 'Untuk mencatat, pilih anggota keluarga di bagian atas.'));
}
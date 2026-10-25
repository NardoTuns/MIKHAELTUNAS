// Banyak pengguna dalam satu HP: daftar, ganti cepat, tambah/ubah, PIN opsional.
import { h, icon, sheet, dialog, toast, confirmDialog, clear } from './dom.js';
import { S, createUser, updateUser, switchUser, removeUser, setPin, checkPin, suggestSyncId, validateSyncId, serverInfo } from '../state.js';
import { AVATAR_EMOJIS, AVATAR_COLORS } from '../config.js';

export const avatar = (u, cls = '') => h('span', { class: 'avatar ' + cls, style: { background: u.color }, text: u.emoji, 'aria-hidden': 'true' });

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
  toast(`Sekarang memakai akun ${u.name}`);
  return true;
}

/** Lembar ganti pengguna (ketuk avatar di atas). */
export function openSwitcher(ctx) {
  sheet((body, close) => {
    body.append(h('h3', { text: 'Ganti pengguna' }),
      h('div', { class: 'card tight' }, ...S.users.map((u) => h('div', { class: 'list-item', style: u === S.users[0] ? { borderTop: 0 } : null, onclick: async () => { if (await trySwitch(u)) close(); } },
        avatar(u), h('div', { class: 'grow' }, h('div', { class: 't bold', text: u.name }), h('div', { class: 's', text: (u.syncId ? `ID sinkron: ${u.syncId}` : 'Pengguna utama') + (u.pinHash ? ' · 🔒 PIN' : '') })),
        u.id === S.user.id ? h('span', { class: 'badge ok', text: 'aktif' }) : null))),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn tonal grow', onclick: async () => { close(); await editUser(null, ctx); } }, icon('plus'), 'Tambah pengguna'),
        h('button', { class: 'btn ghost', text: 'Kelola', onclick: () => { close(); ctx.go('pengaturan'); } })),
      h('p', { class: 'small muted', text: 'Setiap pengguna punya catatan, target, menu favorit, dan sinkron sendiri. Cocok untuk satu HP dipakai beberapa anggota keluarga.' }));
  });
}

/** Tambah (u = null) atau ubah pengguna. */
export async function editUser(u, ctx) {
  const isNew = !u;
  const v = { name: u?.name || '', emoji: u?.emoji || AVATAR_EMOJIS[S.users.length % AVATAR_EMOJIS.length], color: u?.color || AVATAR_COLORS[S.users.length % AVATAR_COLORS.length], syncId: u ? u.syncId || '' : '', scriptUrl: u?.scriptUrl || '', syncEnabled: u ? u.syncEnabled !== false : true };
  let syncTouched = !isNew;
  const multi = serverInfo()?.multiUser;
  const res = await dialog(isNew ? 'Tambah pengguna' : 'Ubah pengguna', () => {
    const prev = h('div', { class: 'center' });
    const nameIn = h('input', { type: 'text', value: v.name, maxlength: 30, placeholder: 'mis. Ibu, Budi', autocomplete: 'off' });
    const syncIn = h('input', { type: 'text', value: v.syncId, placeholder: '(kosong = pengguna utama)', autocomplete: 'off', autocapitalize: 'off' });
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
        h('small', { class: 'muted', text: 'Pakai ID yang sama di HP lain agar datanya menyatu. Kosong = pengguna utama (data aplikasi Android). ' + (multi === false ? 'Server Anda masih Code.gs 1.x: hanya pengguna utama yang bisa sinkron.' : '') })),
      h('label', { class: 'switch-row' }, h('span', { class: 'txt' }, 'Sinkron pengguna ini', h('div', { class: 'tiny muted', text: 'Matikan bila datanya cukup di HP ini saja.' })), syncSw),
      h('label', { class: 'field' }, h('span', { text: 'URL Web App khusus (opsional)' }), urlIn));
  }, [{ label: 'Batal', value: false }, { label: isNew ? 'Tambah' : 'Simpan', value: true, kind: 'tonal' }]);
  if (!res) return null;
  if (!v.name.trim()) { toast('Isi nama pengguna'); return editUser(u, ctx); }
  const err = validateSyncId(v.syncId, u?.id);
  if (err) { toast(err); return editUser(u ? { ...u, ...v } : null, ctx); }
  if (v.scriptUrl && !/^https:\/\//.test(v.scriptUrl)) { toast('URL harus diawali https://'); return null; }
  if (isNew) {
    const nu = await createUser({ name: v.name, emoji: v.emoji, color: v.color, syncId: v.syncId });
    await updateUser(nu.id, { scriptUrl: v.scriptUrl, syncEnabled: v.syncEnabled });
    if (await confirmDialog('Pengguna ditambahkan', `Pindah ke akun ${nu.name} sekarang?`, 'Pindah')) await switchUser(nu.id);
    return nu;
  }
  await updateUser(u.id, { name: v.name.trim(), emoji: v.emoji, color: v.color, syncId: v.syncId, scriptUrl: v.scriptUrl, syncEnabled: v.syncEnabled });
  toast('Pengguna disimpan');
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
  if (S.users.length <= 1) { toast('Minimal harus ada satu pengguna.'); return; }
  if (!(await askPin(u))) return;
  const choice = await dialog(`Hapus ${u.name}?`, `Akun dan semua catatannya akan dihapus dari HP ini. Data yang sudah tersinkron di Spreadsheet tidak ikut terhapus, jadi bisa diambil lagi kapan saja dengan ID sinkron "${u.syncId || '(utama)'}".`,
    [{ label: 'Batal', value: null }, { label: 'Hapus akun & data di HP', value: 'data', kind: 'danger-btn' }]);
  if (choice !== 'data') return;
  if (!(await confirmDialog('Yakin?', `Semua catatan ${u.name} di HP ini akan dihapus permanen.`, 'Hapus', 'danger-btn'))) return;
  await removeUser(u.id, { deleteData: true });
  toast('Pengguna dihapus');
}

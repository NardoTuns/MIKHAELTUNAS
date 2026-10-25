// Pembuat elemen DOM ringan. Teks selalu lewat textContent (aman dari injeksi HTML);
// innerHTML hanya dipakai untuk ikon SVG statis di bawah.

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') e[k] = v;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(e, kids);
  return e;
}

function append(e, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };

const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  history: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  star: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  addc: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  barcode: '<path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};

export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = ICONS[name] || '';
  return s;
}

export const iconBtn = (name, label, onclick, extra = {}) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick, ...extra }, icon(name));

// ------------------------------------------------------------------ toast
let toastTimer;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
  clear(wrap);
  const t = h('div', { class: 'toast' }, h('span', { class: 'grow' }, msg),
    action ? h('button', { onclick: () => { clear(wrap); onAction?.(); }, text: action }) : null);
  wrap.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (t.parentNode) t.remove(); }, action ? Math.max(ms, 5000) : ms);
}

// ------------------------------------------------------------------ lembar bawah
// Tombol "Kembali" HP menutup lapisan teratas (dialog/lembar), bukan meninggalkan aplikasi.
const openStack = [];
let ignorePop = 0;
function trapBack(close) {
  openStack.push(close);
  history.pushState({ overlay: openStack.length }, '');
}
function release(close) {
  const i = openStack.indexOf(close);
  if (i >= 0) { openStack.splice(i, 1); ignorePop++; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  const close = openStack.pop();
  if (close) close(true);
});
export const overlayOpen = () => openStack.length > 0;

/** Lembar bawah. build(body, close) mengisi isi. Mengembalikan fungsi close. */
export function sheet(build, { onClose } = {}) {
  const body = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grip' }));
  const scrim = h('div', { class: 'scrim' }, body);
  let closed = false;
  const close = (fromPop = false) => {
    if (closed) return;
    closed = true;
    scrim.remove();
    if (fromPop !== true) release(close);
    if (!openStack.length) document.body.style.overflow = '';
    onClose?.();
  };
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  document.body.style.overflow = 'hidden';
  trapBack(close);
  build(body, close);
  return close;
}

/** Dialog. buttons: [{label, value, kind}] → Promise<value|null> */
export function dialog(title, content, buttons = [{ label: 'Tutup', value: null }]) {
  return new Promise((resolve) => {
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
    const scrim = h('div', { class: 'scrim middle' }, box);
    let done = false;
    const finish = (v, fromPop = false) => {
      if (done) return;
      done = true;
      scrim.remove();
      if (!fromPop) release(onPop);
      if (!openStack.length) document.body.style.overflow = '';
      resolve(v);
    };
    const onPop = () => finish(null, true);
    box.append(
      title ? h('h3', { text: title }) : null,
      typeof content === 'function' ? content(finish) : typeof content === 'string' ? h('div', { class: 'col' }, ...content.split('\n\n').map((p) => h('p', { style: { margin: '0', whiteSpace: 'pre-line' }, text: p }))) : content,
      buttons.length ? h('div', { class: 'actions' }, ...buttons.map((b) => h('button', {
        class: 'btn small ' + (b.kind || 'text'), text: b.label, onclick: () => finish(b.value),
      }))) : null,
    );
    scrim.addEventListener('click', (e) => { if (e.target === scrim) finish(null); });
    document.body.append(scrim);
    document.body.style.overflow = 'hidden';
    trapBack(onPop);
    setTimeout(() => box.querySelector('input, textarea, select')?.focus(), 60);
  });
}

export const confirmDialog = (title, text, okLabel = 'Ya', kind = 'tonal') =>
  dialog(title, text, [{ label: 'Batal', value: false }, { label: okLabel, value: true, kind }]).then((v) => v === true);

/** Dialog isian satu teks → string | null */
export function prompt(title, { label = '', value = '', type = 'text', placeholder = '', note = '', okLabel = 'Simpan', inputmode } = {}) {
  let input;
  return dialog(title, (finish) => {
    input = h('input', { type, value, placeholder, inputmode, autocomplete: 'off' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish('__ok'); });
    return h('div', { class: 'col' }, note ? h('p', { class: 'muted small', style: { margin: 0 }, text: note }) : null,
      h('label', { class: 'field' }, label ? h('span', { text: label }) : null, input));
  }, [{ label: 'Batal', value: null }, { label: okLabel, value: '__ok', kind: 'tonal' }]).then((v) => (v === '__ok' ? input.value : null));
}

/** Pemicu input file tersembunyi → File | null */
export function pickFile({ accept = '*/*', capture } = {}) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept, capture, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/** Bagikan file/teks lewat Web Share (WhatsApp, dll.), selain itu unduh/salin. */
export async function shareFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  downloadBlob(blob, name);
  toast('File diunduh: ' + name);
  return true;
}

export async function shareText(text, title = 'Catat Makan') {
  if (navigator.share) {
    try { await navigator.share({ text, title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Teks disalin. Tempel di WhatsApp atau aplikasi lain.'); } catch {
    dialog('Salin teks', h('textarea', { value: text, rows: 10, readonly: true }));
  }
}

// Lembar "Catat makanan" / "Ubah catatan" (port FoodSheet.kt).
import { h, icon, sheet, toast, pickFile, prompt, clear } from './dom.js';
import { S, settings, allFoods, saveFood, saveFoods, deleteFood, saveMenu as _saveMenu, menuTotal, scriptUrlFor, serverInfo } from '../state.js';
import { MEALS, mealEmoji, FOOD_DB } from '../core/fooddb.js';
import { frequent } from '../core/stats.js';
import { fmt, num, nowTime, toNum, numOnly } from '../core/util.js';
import * as online from '../core/online.js';

// ------------------------------------------------------------------ alat bantu
const scripts = {};
export function loadScript(src) {
  scripts[src] ||= new Promise((res, rej) => {
    const s = h('script', { src });
    s.onload = res;
    s.onerror = () => { delete scripts[src]; rej(new Error('Gagal memuat ' + src)); };
    document.head.append(s);
  });
  return scripts[src];
}

export function imageToJpegBase64(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = h('canvas', { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak bisa dibaca')); };
    img.src = url;
  });
}

/** Pindai barcode kemasan. BarcodeDetector (Android Chrome) atau ZXing (iPhone, dll.). */
export function scanBarcode() {
  return new Promise((resolve) => {
    let stream = null; let reader = null; let timer = null; let finished = false;
    const video = h('video', { playsinline: true, muted: true, autoplay: true });
    const status = h('div', { class: 'small', text: 'Arahkan kamera ke barcode kemasan…' });
    const done = (code) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      try { reader?.reset(); } catch { /* sudah berhenti */ }
      stream?.getTracks().forEach((t) => t.stop());
      box.remove();
      resolve(code);
    };
    const manual = async () => {
      const v = await prompt('Ketik kode barcode', { label: 'Angka di bawah barcode', inputmode: 'numeric', okLabel: 'Cari' });
      if (v && /^\d{6,14}$/.test(v.trim())) done(v.trim());
    };
    const box = h('div', { class: 'scanner' }, video, h('div', { class: 'frame' }),
      h('div', { class: 'bar' }, status,
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost grow', style: { color: '#fff', borderColor: '#fff6' }, text: 'Ketik kode', onclick: manual }),
          h('button', { class: 'btn grow', text: 'Batal', onclick: () => done(null) }))));
    document.body.append(box);
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          video.srcObject = stream;
          await video.play();
          timer = setInterval(async () => {
            try { const r = await det.detect(video); if (r[0]?.rawValue) done(r[0].rawValue); } catch { /* frame belum siap */ }
          }, 300);
        } else {
          await loadScript('vendor/zxing.min.js');
          const Z = window.ZXing;
          const hints = new Map();
          hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
          reader = new Z.BrowserMultiFormatReader(hints);
          await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) done(res.getText()); });
        }
      } catch (e) {
        status.textContent = 'Kamera tidak bisa dibuka (' + (e.name === 'NotAllowedError' ? 'izin ditolak' : e.message || e.name) + '). Ketik kode secara manual.';
      }
    })();
  });
}

/** Input suara bahasa Indonesia (Web Speech API). */
export function listen() {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { reject(new Error('Input suara tidak tersedia di browser ini. Gunakan tombol mikrofon di keyboard.')); return; }
    const r = new SR();
    r.lang = 'id-ID';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript);
    r.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Izin mikrofon ditolak.' : 'Suara tidak terdengar, coba lagi.'));
    r.onend = () => resolve('');
    r.start();
  });
}

// ------------------------------------------------------------------ lembar
export function openFoodForm({ entry = null, meal = null, date = null, onDeleted } = {}) {
  const isNew = !entry;
  const st = settings();
  const f = {
    meal: entry?.meal || meal || 'Camilan',
    name: entry?.name || '',
    portion: entry?.portion || 1,
    kcal: entry ? num(entry.kcal) : '',
    protein: entry && entry.protein > 0 ? num(entry.protein) : '',
    carbs: entry && entry.carbs > 0 ? num(entry.carbs) : '',
    fat: entry && entry.fat > 0 ? num(entry.fat) : '',
    note: entry?.note || '',
    time: entry?.time || nowTime(),
  };
  const entryDate = () => entry?.date || date || S.date;
  const freq = frequent(allFoods());
  let online_ = [];
  let photoItems = [];
  let showSuggest = isNew;
  let showDetail = !!entry && entry.protein + entry.carbs + entry.fat > 0;
  let onlineTimer = null;
  let reqId = 0;

  sheet((body, close) => {
    const mealRow = h('div', { class: 'scroll-x' });
    const quickRow = h('div', { class: 'scroll-x' });
    const busy = h('div', { class: 'row small hidden' });
    const photoBox = h('div');
    const favBox = h('div', { class: 'col' });
    const nameIn = h('input', { type: 'text', value: f.name, placeholder: 'Ketik, mis. nasi kuning, kopi susu', autocomplete: 'off', enterkeyhint: 'next', 'aria-label': 'Nama makanan' });
    const clearBtn = h('button', { class: 'icon-btn trail', 'aria-label': 'Hapus teks', onclick: () => { nameIn.value = ''; f.name = ''; showSuggest = true; refresh(); nameIn.focus(); } }, icon('x'));
    const suggestBox = h('div');
    const onlineBox = h('div', { class: 'col' });
    const portionV = h('span', { class: 'v' });
    const portionChips = h('div', { class: 'row' });
    const kcalIn = h('input', { type: 'text', inputmode: 'decimal', value: f.kcal, placeholder: '0', 'aria-label': 'kkal per porsi' });
    const useSuggest = h('div');
    const totalEl = h('div', { class: 'bold ok', style: { fontSize: '1.1rem' } });
    const timeIn = h('input', { type: 'time', value: f.time, style: { width: '120px' }, 'aria-label': 'Jam makan' });
    const detailBox = h('div', { class: 'col' });
    const pIn = h('input', { type: 'text', inputmode: 'decimal', value: f.protein, placeholder: '0' });
    const cIn = h('input', { type: 'text', inputmode: 'decimal', value: f.carbs, placeholder: '0' });
    const fIn = h('input', { type: 'text', inputmode: 'decimal', value: f.fat, placeholder: '0' });
    const noteIn = h('input', { type: 'text', value: f.note, maxlength: 100, placeholder: 'mis. tanpa gula' });
    const detailBtn = h('button', { class: 'btn text', onclick: () => { showDetail = !showDetail; refreshDetail(); } });
    const disclaimer = h('p', { class: 'muted tiny hidden', style: { margin: 0 }, text: 'Nilai dari internet adalah perkiraan. Sesuaikan dengan porsi yang kamu makan.' });

    const fill = (sg, fromOnline = false) => {
      f.name = sg.name; nameIn.value = sg.name;
      f.kcal = num(Math.round(sg.kcal)); kcalIn.value = f.kcal;
      f.protein = sg.protein > 0 ? num(Math.round(sg.protein * 10) / 10) : ''; pIn.value = f.protein;
      f.carbs = sg.carbs > 0 ? num(Math.round(sg.carbs * 10) / 10) : ''; cIn.value = f.carbs;
      f.fat = sg.fat > 0 ? num(Math.round(sg.fat * 10) / 10) : ''; fIn.value = f.fat;
      if (fromOnline && !f.note && sg.info) { f.note = sg.info; noteIn.value = sg.info; }
      showSuggest = false;
      refresh();
    };

    const reset = () => {
      Object.assign(f, { name: '', kcal: '', protein: '', carbs: '', fat: '', note: '', portion: 1, time: nowTime() });
      nameIn.value = ''; kcalIn.value = ''; pIn.value = ''; cIn.value = ''; fIn.value = ''; noteIn.value = ''; timeIn.value = f.time;
      showSuggest = true; photoItems = []; online_ = [];
      refresh(); renderPhoto();
      nameIn.focus();
    };

    const build = () => {
      if (!f.name.trim()) { toast('Isi nama makanan dulu'); nameIn.focus(); return null; }
      return {
        id: entry?.id, date: entryDate(), time: timeIn.value || nowTime(), meal: f.meal, name: f.name.trim(), portion: f.portion,
        kcal: toNum(kcalIn.value), protein: toNum(pIn.value), carbs: toNum(cIn.value), fat: toNum(fIn.value), note: noteIn.value.trim(),
      };
    };

    const setBusy = (text) => {
      clear(busy);
      busy.classList.toggle('hidden', !text);
      if (text) busy.append(h('span', { class: 'spin', style: { display: 'inline-flex' } }, icon('sync')), h('span', { text }));
    };

    // ---- daftar saran
    const suggestList = (items, onPick) => h('div', { class: 'suggest' }, ...items.map(([sg, source]) => h('div', { class: 'list-item', onclick: () => onPick(sg) },
      h('div', { class: 'grow' }, h('div', { class: 't ellipsis', text: sg.name }), h('div', { class: 's ellipsis', text: source ? `${source} · ${sg.info}` : sg.info })),
      h('span', { class: 'bold small', text: `${fmt(sg.kcal)} kkal` }))));

    function refreshSuggest() {
      clear(suggestBox);
      const q = f.name.trim().toLowerCase();
      if (!showSuggest || q.length < 2) return;
      const mine = freq.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 4)
        .map((x) => [{ name: x.name, info: `Dari catatanmu · ${x.cnt}x`, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat }, null]);
      const dbl = FOOD_DB.filter((x) => x.name.toLowerCase().includes(q) && !mine.some(([m]) => m.name.toLowerCase() === x.name.toLowerCase())).slice(0, 5)
        .map((x) => [{ name: x.name, info: x.portion, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat }, null]);
      const all = [...mine, ...dbl];
      if (all.length) suggestBox.append(suggestList(all, (sg) => fill(sg)));
    }

    function renderOnline(loading) {
      clear(onlineBox);
      if (!showSuggest || (!loading && !online_.length)) return;
      onlineBox.append(h('div', { class: 'row small bold' }, h('span', { class: 'grow', text: '🌐 Saran kalori online' }),
        loading ? h('span', { class: 'muted', text: 'mencari…' }) : null));
      if (online_.length) onlineBox.append(suggestList(online_.map((x) => [x, x.source]), (sg) => fill(sg, true)));
    }

    function scheduleOnline() {
      clearTimeout(onlineTimer);
      online_ = [];
      const q = f.name.trim();
      if (!showSuggest || !st.onlineSuggest || q.length < 3 || !navigator.onLine) { renderOnline(false); return; }
      const my = ++reqId;
      onlineTimer = setTimeout(async () => {
        renderOnline(true);
        try {
          const r = await online.suggest(q, { scriptUrl: scriptUrlFor(), server: serverInfo() });
          if (my === reqId) online_ = r;
        } catch { /* abaikan */ }
        if (my === reqId) { renderOnline(false); refreshUseSuggest(); }
      }, 900);
    }

    function refreshUseSuggest() {
      clear(useSuggest);
      const best = online_[0];
      if (!kcalIn.value && best && f.name.trim()) {
        useSuggest.append(h('button', { class: 'chip soft', onclick: () => fill(best, true) }, `💡 Pakai saran: ${fmt(best.kcal)} kkal (${best.info})`));
      }
      disclaimer.classList.toggle('hidden', !(online_.length || photoItems.length));
    }

    function refreshPortion() {
      portionV.textContent = num(f.portion);
      clear(portionChips);
      for (const [v, l] of [[0.5, '½'], [1, '1'], [1.5, '1½'], [2, '2']]) {
        portionChips.append(h('button', { class: 'chip' + (f.portion === v ? ' on' : ''), text: l, onclick: () => { f.portion = v; refreshPortion(); } }));
      }
      totalEl.textContent = `Total ${fmt(toNum(kcalIn.value) * f.portion)} kkal`;
    }

    function refreshMeals() {
      clear(mealRow);
      for (const m of MEALS) mealRow.append(h('button', { class: 'chip' + (f.meal === m ? ' on' : ''), text: `${mealEmoji(m)} ${m}`, onclick: () => { f.meal = m; refreshMeals(); } }));
    }

    function refreshFav() {
      clear(favBox);
      if (!isNew || f.name.trim()) return;
      if (S.menus.length) {
        favBox.append(h('div', { class: 'muted small bold', text: 'Menu favorit · sekali ketuk langsung tercatat' }),
          h('div', { class: 'scroll-x' }, ...S.menus.map((m) => h('button', {
            class: 'chip', text: `⭐ ${m.name} · ${fmt(menuTotal(m))}`,
            onclick: async () => {
              const t = nowTime();
              await saveFoods(m.items.map((i) => ({ date: entryDate(), time: t, meal: f.meal, name: i.name, portion: i.portion, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat })));
              toast(`${m.name} tercatat (${fmt(menuTotal(m))} kkal)`);
              close();
            },
          }))));
      }
      if (freq.length) {
        favBox.append(h('div', { class: 'muted small bold', text: 'Sering kamu makan · ketuk untuk isi otomatis' }),
          h('div', { class: 'scroll-x' }, ...freq.slice(0, 12).map((x) => h('button', {
            class: 'chip soft', text: `${x.name} · ${fmt(x.kcal)}`,
            onclick: () => fill({ name: x.name, info: '', kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat }),
          }))));
      }
    }

    function refreshDetail() {
      clear(detailBox);
      detailBtn.textContent = showDetail ? 'Sembunyikan detail gizi' : 'Detail gizi & catatan (opsional)';
      if (!showDetail) return;
      const fld = (label, inp) => h('label', { class: 'field grow' }, h('span', { text: label }), inp);
      detailBox.append(h('div', { class: 'row' }, fld('Protein g', pIn), fld('Karbo g', cIn), fld('Lemak g', fIn)),
        h('label', { class: 'field' }, h('span', { text: 'Catatan' }), noteIn));
    }

    function renderPhoto() {
      clear(photoBox);
      if (!photoItems.length) return;
      photoBox.append(h('div', { class: 'card flat tight' },
        h('div', { class: 'bold', style: { padding: '12px 14px 4px' }, text: '📷 Terlihat di foto (perkiraan AI)' }),
        ...photoItems.map((x) => h('div', { class: 'list-item', onclick: () => { photoItems = []; renderPhoto(); fill(x, true); } },
          h('div', { class: 'grow' }, h('div', { class: 't', text: x.name }), h('div', { class: 's', text: x.info })),
          h('span', { class: 'bold small', text: `${fmt(x.kcal)} kkal` }))),
        h('div', { style: { padding: '8px 14px 12px' } },
          h('button', {
            class: 'btn block', text: `Simpan semua · ${fmt(photoItems.reduce((a, x) => a + x.kcal, 0))} kkal`,
            onclick: async () => {
              const t = timeIn.value || nowTime();
              await saveFoods(photoItems.map((x) => ({ date: entryDate(), time: t, meal: f.meal, name: x.name, portion: 1, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, note: x.info })));
              toast(`${photoItems.length} makanan tersimpan`);
              close();
            },
          }),
          h('p', { class: 'muted tiny', style: { margin: '6px 0 0' }, text: 'Atau ketuk satu item untuk mengubahnya dulu.' }))));
      refreshUseSuggest();
    }

    function refresh() {
      clearBtn.classList.toggle('hidden', !f.name);
      refreshSuggest(); scheduleOnline(); refreshFav(); refreshPortion(); refreshUseSuggest();
    }

    // ---- input cepat
    async function analyzePhoto(file) {
      if (!file) return;
      if (!scriptUrlFor()) { toast('Hubungkan Spreadsheet & aktifkan AI dulu di Pengaturan'); return; }
      if (!navigator.onLine) { toast('Analisis foto butuh internet'); return; }
      setBusy('Menganalisis foto dengan AI…');
      photoItems = []; renderPhoto();
      try {
        const b64 = await imageToJpegBase64(file);
        photoItems = await online.photo(scriptUrlFor(), b64);
        if (!photoItems.length) toast('Makanan tidak dikenali. Coba foto lebih dekat & terang.');
        renderPhoto();
      } catch (e) { toast('Gagal: ' + e.message); } finally { setBusy(''); }
    }
    if (isNew) {
      quickRow.append(
        h('button', { class: 'chip soft', onclick: async () => {
          try { setBusy('Mendengarkan… sebutkan nama makanan'); const t = await listen(); if (t) { f.name = t.charAt(0).toUpperCase() + t.slice(1); nameIn.value = f.name; showSuggest = true; refresh(); } } catch (e) { toast(e.message); } finally { setBusy(''); }
        } }, icon('mic'), 'Suara'),
        h('button', { class: 'chip soft', onclick: async () => analyzePhoto(await pickFile({ accept: 'image/*', capture: 'environment' })) }, icon('camera'), 'Foto AI'),
        h('button', { class: 'chip soft', onclick: async () => analyzePhoto(await pickFile({ accept: 'image/*' })) }, '🖼️ Galeri'),
        h('button', { class: 'chip soft', onclick: async () => {
          const code = await scanBarcode();
          if (!code) return;
          if (!navigator.onLine) { toast('Butuh internet untuk mencari produk'); return; }
          setBusy(`Mencari produk ${code}…`);
          try {
            const p = await online.barcode(code);
            if (!p) toast('Produk belum ada di database. Isi manual, ya.'); else { fill(p, true); toast('Ditemukan: ' + p.name); }
          } catch (e) { toast('Gagal mencari produk: ' + e.message); } finally { setBusy(''); }
        } }, icon('barcode'), 'Scan barcode'),
      );
    }

    nameIn.addEventListener('input', () => { f.name = nameIn.value; showSuggest = true; refresh(); });
    kcalIn.addEventListener('input', () => { kcalIn.value = numOnly(kcalIn.value); refreshPortion(); refreshUseSuggest(); });
    for (const inp of [pIn, cIn, fIn]) inp.addEventListener('input', () => { inp.value = numOnly(inp.value); });

    body.append(
      h('h3', { text: isNew ? 'Catat makanan' : 'Ubah catatan' }),
      h('div', { class: 'col', style: { gap: '12px' } },
        mealRow,
        isNew ? quickRow : null,
        busy,
        photoBox,
        favBox,
        h('div', { class: 'input-wrap' }, icon('search', 'lead'), nameIn, clearBtn),
        suggestBox,
        onlineBox,
        h('div', { class: 'row', style: { alignItems: 'flex-end' } },
          h('div', { class: 'col grow', style: { gap: '4px' } }, h('span', { class: 'muted small bold', text: 'Porsi' }),
            h('div', { class: 'stepper' },
              h('button', { 'aria-label': 'Kurangi porsi', text: '−', onclick: () => { if (f.portion > 0.25) { f.portion = Math.max(0.25, f.portion - 0.5); refreshPortion(); } } }),
              portionV,
              h('button', { 'aria-label': 'Tambah porsi', text: '+', onclick: () => { f.portion += 0.5; refreshPortion(); } }))),
          h('label', { class: 'field', style: { width: '140px' } }, h('span', { text: 'kkal / porsi' }), kcalIn)),
        portionChips,
        useSuggest,
        h('div', { class: 'row' }, h('div', { class: 'grow' }, totalEl), h('label', { class: 'row small muted' }, 'Jam', timeIn)),
        detailBtn,
        detailBox,
        h('div', { class: 'row' },
          isNew
            ? h('button', { class: 'btn ghost', text: 'Simpan & tambah lagi', onclick: async () => { const e = build(); if (!e) return; await saveFood(e); toast(`${e.name} tersimpan. Lanjut catat.`); reset(); } })
            : h('button', { class: 'btn danger-btn', onclick: async () => { await deleteFood(entry); close(); onDeleted?.(entry); } }, icon('trash'), 'Hapus'),
          h('button', { class: 'btn grow', onclick: async () => { const e = build(); if (!e) return; await saveFood(e); toast(`${e.name} tersimpan`); close(); } }, icon('check'), 'Simpan')),
        disclaimer,
      ),
    );
    refreshMeals(); refreshDetail(); refresh();
    if (isNew) setTimeout(() => { if (!S.menus.length && !freq.length) nameIn.focus(); }, 250);
  }, { onClose: () => { clearTimeout(onlineTimer); reqId++; } });
}

/** Dialog simpan menu favorit dari makanan satu waktu makan. */
export async function saveMenuDialog(defaultName, items) {
  const name = await prompt('Simpan jadi menu favorit', {
    label: 'Nama menu', value: defaultName, note: 'Lain kali cukup sekali ketuk untuk mencatat semua makanan ini.',
  });
  if (name && name.trim()) {
    await _saveMenu(name.trim().slice(0, 30), items);
    toast(`Menu "${name.trim()}" tersimpan. Pilih di form Catat makanan.`);
  }
}

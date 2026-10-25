# Catat Makan — versi web (PWA) 2.0

Catatan diet yang bisa **dipasang di Android & iPhone**, **jalan tanpa internet**, dipakai **beberapa
pengguna dalam satu HP**, dan **tersinkron ke Google Spreadsheet** saat ada internet. Semua fitur aplikasi
Android Catat Makan 1.2 tetap ada, ditambah fitur baru.

## Fitur
**Dari aplikasi Android (tetap ada):** catat makanan per waktu makan (sarapan, siang, malam, camilan) ·
saran kalori dari catatan sendiri, database ±80 makanan Indonesia, AI & produk kemasan · input suara ·
Foto AI (kamera/galeri) · scan barcode · porsi & detail gizi (protein/karbo/lemak) · menu favorit sekali ketuk ·
salin menu hari sebelumnya · air minum · berat badan & grafik · riwayat 90 hari + pencarian + "makan lagi hari ini" ·
progres 7/30 hari · tab **Analisis** harian/mingguan/bulanan (skor 0–100, gizi makro, pola makan, penyumbang kalori,
IMT Asia-Pasifik, BMR/TDEE, proyeksi berat, rekomendasi, ide menu, ✨ Analisis AI, 💬 Tanya ahli gizi AI,
laporan teks WhatsApp/PDF/CSV) · kalkulator target · pengingat · sinkron dua arah · tes koneksi.

**Baru di versi web:**
- 👥 **Banyak pengguna** — tambah di *Pengaturan › Pengguna*; ganti dengan mengetuk foto profil di kiri atas.
  Tiap pengguna punya catatan, target, menu favorit, dan sinkron sendiri. **PIN** opsional per pengguna.
- 📲 **Pasang di layar utama** Android & iPhone, terbuka tanpa internet.
- ⬇️ **Tombol Update** (ikon unduh di kanan atas / *Pengaturan › Aplikasi*): cek versi, lihat catatan perubahan, perbarui.
- ⚡ **Catat cepat**: tulis `nasi, 2 tempe goreng, teh tawar` → langsung tercatat (pengganti "balas dari notifikasi").
- 🗓️ **Kalender catatan** bulanan (hijau = sesuai target, oranye = lebih, kuning = kurang).
- 🏅 **Lencana pencapaian** (beruntun 3/7/30 hari, raja hidrasi, sarapan juara, dll.).
- ⏳ **Jendela puasa** (12/14/16/18 jam) dari waktu makan terakhir.
- 🎯 **Progres menuju berat target** & garis target di grafik berat.
- 📅 **Pengingat ke Kalender HP** (.ics) — tetap berbunyi walau aplikasi ditutup, termasuk iPhone.
- 💾 **Cadangan file** .json (per pengguna / semua) & pulihkan — tanpa internet.
- ☁️ **Profil, target & menu favorit ikut tersinkron** antar HP (butuh Code.gs 2.0).
- 🌙 Tampilan **Otomatis / Terang / Gelap**.

## Data aman di HP
- Semua data disimpan di HP (IndexedDB browser). **Data yang sudah tersinkron tidak dihapus** dari HP,
  jadi tetap bisa dilihat saat offline.
- Perubahan saat offline disimpan dan **dikirim otomatis** saat internet kembali (juga saat aplikasi dibuka).
- Konflik antar HP: perubahan **terbaru** yang menang (sama seperti aplikasi Android).
- Aplikasi meminta browser agar data tidak dibersihkan otomatis. Tetap: jangan "Hapus data situs" untuk
  halaman ini sebelum sinkron/cadangan.

## 1. Taruh di GitHub Pages
1. Buat repositori baru di GitHub (mis. `catatmakan`), lalu unggah **isi** folder `CatatMakanWebVersion`
   (file `index.html` harus di akar repositori). Folder `tools/`, `test/`, `apps-script/` boleh ikut — tidak dipakai di HP.
2. Repositori › **Settings › Pages** › *Build and deployment*: Source **Deploy from a branch**, Branch **main**, folder **/(root)** › Save.
3. Tunggu ±1 menit, buka `https://NAMA-AKUN.github.io/catatmakan/`.

> URL Web App Anda sudah menjadi bawaan di `js/config.js` (`DEFAULT_SCRIPT_URL`). Bila repositori publik,
> siapa pun yang membuka link bisa memakai aplikasinya; data mereka hanya masuk ke Spreadsheet Anda bila
> mereka membiarkan sinkron aktif di layar awal. Untuk dibagikan ke orang lain, kosongkan `DEFAULT_SCRIPT_URL`.

## 2. Pasang di HP
- **Android (Chrome):** buka link → ketuk **Pasang** di kartu hijau (atau menu ⋮ › *Instal aplikasi*).
- **iPhone/iPad (Safari):** buka link → tombol **Bagikan** → **Tambah ke Layar Utama** → Tambah.
  (Harus Safari; buka dari ikon di layar utama agar data & notifikasi berjalan sebagai aplikasi.)

## 3. Spreadsheet (sinkron) — perbarui Code.gs ke 2.0
Aplikasi sudah bisa sinkron dengan Code.gs **1.2** Anda saat ini, tetapi **hanya untuk pengguna utama**.
Untuk banyak pengguna, sinkron profil, dan pencarian produk kemasan dari browser:
1. Buka Spreadsheet › **Ekstensi › Apps Script** › ganti seluruh isi `Code.gs` dengan `apps-script/Code.gs` (versi 2.0) › Simpan.
2. Pilih fungsi **setup** › Jalankan (menambah kolom `user` & sheet `Profil`; data lama tetap).
3. **Terapkan › Kelola deployment › ✏️ Edit › Versi: Versi baru › Terapkan** (URL tetap sama).
4. Di aplikasi: *Pengaturan › Tes koneksi* harus menampilkan "Mendukung banyak pengguna".

Code.gs 2.0 **tetap kompatibel dengan aplikasi Android**: data tanpa kolom `user` = pengguna utama.
Pengguna pertama di versi web adalah pengguna utama, jadi datanya menyatu dengan aplikasi Android.

**AI** (saran kalori, Foto AI, Analisis AI, Tanya AI): isi properti skrip `GEMINI_API_KEY` di Apps Script
(kunci gratis dari https://aistudio.google.com/apikey). Saat ini server Anda melaporkan *AI belum aktif*.

### ID sinkron
Setiap pengguna punya **ID sinkron** (pengguna utama = kosong). Untuk memakai pengguna yang sama di HP lain,
tambahkan pengguna di HP itu dengan **ID sinkron yang sama** lalu sinkron — catatan, target & menu favorit ikut tertarik.

## 4. Merilis versi baru (tombol Update)
1. Ubah file yang perlu, lalu naikkan `version` di `version.json` (mis. `2.0.1`) dan isi `changes`.
2. Jalankan `node tools/build-sw.mjs` (memperbarui daftar file offline di `sw.js` & versi di `js/config.js`).
3. Unggah ke GitHub. Di HP, ketuk ikon **Update** › *Perbarui sekarang*. Data di HP tidak hilang.

## Keterbatasan (jujur)
- **Pengingat:** web/PWA tidak bisa menjadwalkan alarm saat aplikasi tertutup (terutama iPhone). Notifikasi
  muncul saat aplikasi terbuka/di latar; untuk pengingat yang pasti berbunyi gunakan *Tambahkan ke Kalender HP*.
  Notifikasi web di iPhone butuh iOS 16.4+ dan aplikasi dipasang di layar utama.
- **Balas dari notifikasi** (fitur Android) diganti dengan **Catat cepat** di tab Hari Ini.
- **Input suara** memakai fitur browser (Chrome Android bagus; di iPhone gunakan mikrofon keyboard bila tidak tersedia).
- **Scan barcode** memakai kamera browser (BarcodeDetector di Android, ZXing di iPhone) — butuh izin kamera.
- **PIN** adalah kunci sederhana antar pengguna di satu HP, bukan enkripsi data.
- Pencarian teks produk kemasan Open Food Facts dari browser butuh Code.gs 2.0 (lewat server); barcode langsung jalan.

## Untuk pengembang
- `npm test` — 21 tes unit (analisis, gizi, catat cepat, pengingat/.ics, laporan, Code.gs 2.0 & 1.2 dengan tiruan Sheets).
- `node tools/e2e.mjs [folder]` — uji end-to-end di Chrome headless (layar HP) terhadap Code.gs tiruan:
  onboarding, catat, catat cepat, hapus/urungkan, sinkron, 2 pengguna, HP kedua, AI, PDF, offline, online lagi, Update, PIN.
- `node tools/serve.mjs` — coba di komputer: http://localhost:8080 (Code.gs tiruan di `/gas/exec`).
- `node tools/make-icons.mjs` — buat ulang ikon.
- Pustaka pihak ketiga (offline, di `vendor/`): jsPDF 2.5.2 (MIT), ZXing 0.21.3 (Apache-2.0).

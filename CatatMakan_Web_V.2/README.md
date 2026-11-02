# Catat Makan Keluarga — versi web (PWA) 2.1

Versi web dari aplikasi Android **Catat Makan 2.0**, dengan tampilan yang sama. Bisa **dipasang di Android & iPhone**,
**jalan tanpa internet**, dan **tersinkron ke Google Spreadsheet** yang sama dengan aplikasi Android.

## Cara kerjanya: akun utama terkunci
| Akun | Di aplikasi Android | Di versi web |
|---|---|---|
| **Akun utama (pemilik)** | catat, ubah, hapus | 🔒 **hanya bisa dilihat** |
| **Istri, anak, anggota lain** | ada | catat, ubah, hapus, analisis, rekap AI |

Pengamanan **dua lapis**:
1. **Aplikasi web**: akun utama tidak punya tombol catat/ubah/hapus/air/berat, tidak mengirim apa pun ke Spreadsheet,
   dan pengaturannya (profil, target, menu favorit) tidak bisa diubah.
2. **Server (Code.gs 2.1)**: permintaan kirim dari web (`client = "web"`) atas akun utama **ditolak**, jadi walau
   seseorang memodifikasi aplikasinya, data pemilik tidak bisa ditimpa. Hanya aplikasi Android yang bisa mengubahnya.

Data pemilik tetap tampil (hanya baca) di tab Hari Ini, Riwayat, Analisis, Progres dan **Rekap keluarga**.

## Fitur (sama dengan aplikasi Android 2.0)
Catat makanan per waktu makan · saran kalori (catatan sendiri, ±80 makanan Indonesia, AI, produk kemasan) · input suara ·
Foto AI · scan barcode · menu favorit · air minum · berat badan & grafik · riwayat + pencarian · progres 7/30 hari ·
tab **Analisis** (Ringkasan, Gizi, **Rekap Gizi AI**, Saran AI, Laporan) · kalkulator target · laporan teks/PDF/CSV.

**Fitur keluarga**
- 👨‍👩‍👧 **Siapa yang mencatat?** — ganti anggota sekali ketuk di tab Hari Ini; **PIN** opsional per anggota.
- 🍽️ **Catat juga untuk…** — makan bersama: centang anggota lain, tercatat untuk semuanya (akun terkunci tidak ditawarkan).
- 🧪 **Rekap Gizi AI** — 27 zat gizi dibandingkan **AKG 2019** menurut umur & jenis kelamin, kelompok Isi Piringku, menu perbaikan.
- 👨‍👩‍👧 **Rekap keluarga** — perbandingan semua anggota + **menu keluarga dari AI** dengan pembagian porsi dan **daftar belanja**.
- 👧 **Gizi anak & remaja (1–17 th)** memakai AKG 2019; tanpa target turun berat.

**Khusus web**: pasang di layar utama · tombol **Update** · **Catat cepat** (`nasi, 2 tempe goreng, teh tawar`) · kalender catatan ·
lencana · jendela puasa · pengingat ke Kalender HP (.ics) · cadangan & pulihkan file · mode gelap.

## 1. Perbarui Code.gs ke 2.1 (wajib, sekali saja)
`apps-script/Code.gs` di folder ini **sama dengan** yang di aplikasi Android (satu file untuk keduanya).
1. Buka Spreadsheet › **Ekstensi › Apps Script** › ganti seluruh isi `Code.gs` dengan file ini › Simpan.
2. Jalankan fungsi **setup** sekali (menambah kolom `user`, sheet `Profil`; **data lama tetap aman**).
3. **Terapkan › Kelola deployment › ✏️ Edit › Versi: Versi baru › Terapkan** (URL tetap sama).
4. Jalankan `testRekap` untuk mencoba AI (butuh properti skrip `GEMINI_API_KEY`, gratis dari https://aistudio.google.com/apikey).

## 2. Taruh di GitHub Pages
1. Buat repositori baru di GitHub, unggah **isi folder ini** (file `index.html` harus di akar repositori).
   Folder `tools/`, `test/`, `apps-script/` boleh ikut — tidak dipakai di HP.
2. **Settings › Pages** › Source **Deploy from a branch** › Branch **main** › folder **/(root)** › Save.
3. Setelah ±1 menit buka `https://NAMA-AKUN.github.io/NAMA-REPO/`.

### Keamanan URL Spreadsheet (penting)
`DEFAULT_SCRIPT_URL` di `js/config.js` **sengaja kosong**. Repositori GitHub publik bisa dibaca siapa saja, dan URL Web App
membuka data Spreadsheet keluarga. **Jangan menaruh URL itu di repositori publik.** Cara membagikannya:
- Di aplikasi web buka **Pengaturan › ☁️ Backup & sinkron Spreadsheet › 🔗 Bagikan tautan undangan keluarga**, kirim lewat WhatsApp
  ke istri/anak. Membuka tautan itu mengisi URL otomatis (hanya alamat `script.google.com` yang diterima).
- Atau isi `DEFAULT_SCRIPT_URL` **hanya bila repositori Anda PRIVAT** (GitHub Pages untuk repo privat butuh paket berbayar).

## 3. Dipakai istri & anak
1. Buka link web di HP masing-masing → **Pasang** di layar utama.
2. Tempel/buka tautan undangan → pilih nama anggota dari daftar (diambil dari Spreadsheet), atau ketik nama baru → **Mulai**.
3. Anggota baru otomatis mendapat **ID sinkron** dan muncul juga di aplikasi Android setelah sinkron.
4. Akun pemilik ikut tampil bertanda 🔒 (hanya baca).

Beberapa anggota boleh memakai **satu HP** (ganti dengan mengetuk foto profil) atau **HP masing-masing** (pakai ID sinkron
yang sama). Konflik antar HP: perubahan **terbaru** menang.

## Data aman di HP
- Data disimpan di HP (IndexedDB). **Data yang sudah tersinkron tidak dihapus** dari HP, tetap terlihat saat offline.
- Perubahan saat offline disimpan dan **dikirim otomatis** saat internet kembali.
- Jangan pilih "Hapus data situs" untuk halaman ini sebelum sinkron/cadangan.

## Merilis versi baru (tombol Update)
1. Ubah file, naikkan `version` di `version.json` (mis. `2.1.1`) dan isi `changes`.
2. Jalankan `node tools/build-sw.mjs` (memperbarui daftar file offline di `sw.js` & versi di `js/config.js`).
3. Unggah ke GitHub. Di HP ketuk ikon **Update** › *Perbarui sekarang*. Data tidak hilang.

## Keterbatasan (jujur)
- **Pengingat**: web/PWA tidak bisa membunyikan alarm saat aplikasi tertutup (terutama iPhone). Gunakan *Tambahkan ke Kalender HP*.
  Pengingat tidak aktif untuk akun terkunci.
- **Balas dari notifikasi** (Android) diganti **Catat cepat**.
- **Input suara & scan barcode** memakai fitur browser dan butuh izin mikrofon/kamera.
- **PIN** adalah kunci sederhana antar anggota di satu HP, bukan enkripsi data.
- Akun pemilik di web hanya mengikuti data dari Spreadsheet; untuk mengubahnya gunakan aplikasi Android.
- Semua angka dari AI/database adalah **perkiraan**, bukan pengganti saran dokter atau ahli gizi.

## Untuk pengembang
- `npm test` — 22 tes unit (analisis, gizi anak/AKG, catat cepat, pengingat/.ics, laporan, Code.gs 2.1 & 1.2, kunci akun utama).
- `node tools/e2e.mjs [folder-screenshot]` — uji end-to-end di Chrome headless (layar HP) terhadap Code.gs tiruan:
  pemilik terkunci, istri & anak mencatat, HP kedua, Rekap Gizi AI, rekap keluarga, offline, Update, PIN.
- `node tools/serve.mjs` — coba di komputer: http://localhost:8080 (Code.gs tiruan di `/gas/exec`).
- `node tools/make-icons.mjs` — buat ulang ikon.
- Pustaka (offline, `vendor/`): jsPDF 2.5.2 (MIT), ZXing 0.21.3 (Apache-2.0).

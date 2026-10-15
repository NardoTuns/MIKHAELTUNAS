# Panduan Catatan Keuangan

Aplikasi web (PWA) untuk mencatat uang masuk dan keluar keluarga.
Data tersimpan di HP dulu, lalu otomatis dikirim ke Google Spreadsheet kalau ada internet.

---

## 1. Siapkan Google Spreadsheet (sekali saja)

1. Buka <https://sheets.new> untuk membuat Spreadsheet baru. Beri nama, misalnya **Keuangan Keluarga**.
2. Klik menu **Ekstensi → Apps Script**.
3. Hapus semua kode yang ada, lalu **tempel seluruh isi file `Code.gs`**.
4. *(Disarankan)* Isi kode rahasia di baris `const TOKEN = '';`, misalnya `const TOKEN = 'dodogeby2026';`.
5. Klik **Simpan** (ikon disket).
6. Di dropdown fungsi, pilih **setup**, lalu klik **Jalankan**. Berikan izin:
   *Tinjau izin → pilih akun → Lanjutan → Buka (tidak aman) → Izinkan.*
   Langkah ini membuat sheet **Transaksi**, **Pengaturan**, **Ringkasan**, dan folder Drive **Foto Catatan Keuangan**.
7. Klik **Terapkan (Deploy) → Deployment baru**.
   - Klik ikon roda gigi, pilih jenis **Aplikasi web**.
   - **Jalankan sebagai:** *Saya*
   - **Yang memiliki akses:** *Siapa saja*
   - Klik **Terapkan**, lalu **salin URL Aplikasi Web** (berakhiran `/exec`).

> Kalau nanti `Code.gs` diubah, buka **Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan** supaya URL tetap sama.

## 1b. Mencoba di komputer (server lokal)

1. Klik dua kali **`JALANKAN-LOKAL.bat`** (perlu Node.js; kalau tidak ada, Python dipakai).
2. Browser terbuka otomatis di `http://localhost:8080`.
3. Jendela hitam juga menampilkan alamat untuk HP di WiFi yang sama, misalnya `http://192.168.x.x:8080`.
   Lewat alamat itu aplikasi bisa dicoba, tetapi **Install** dan **mode offline** baru jalan setelah di GitHub Pages (https).
4. Untuk berhenti, tutup jendela hitam atau tekan `Ctrl+C`.

Data yang dicatat saat mencoba **masuk ke Spreadsheet asli**. Hapus lewat aplikasi bila hanya data uji.

## 2. Upload ke GitHub Pages

1. Buat repository baru di GitHub, misalnya `catatan-keuangan`.
2. Upload **semua file dan folder** di folder ini: `index.html`, `app.js`, `style.css`, `sw.js`, `version.js`, `config.js`, `manifest.json`, folder `lib/`, dan folder `icons/`.
   `Code.gs` dan `PANDUAN.md` boleh ikut diupload, tidak mengganggu.
3. Buka **Settings → Pages**. Pada *Source* pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Aplikasi bisa dibuka di `https://NAMA-AKUN.github.io/catatan-keuangan/`.

## 3. Pasang di HP (Anda dan istri)

1. Buka alamat GitHub Pages tadi di **Chrome** (Android) atau **Safari** (iPhone).
2. Tap tombol **Install** di pojok kanan atas. Di iPhone: **Bagikan → Tambahkan ke Layar Utama**.
3. Koneksi ke Spreadsheet sudah otomatis. URL Web App dan kode rahasia ada di file **`config.js`**, jadi tidak perlu diisi di HP.
   Untuk mengecek, buka **Pengaturan → Tes koneksi**.
4. Atur **saldo awal** tiap sumber dana dan **budget bulanan** (opsional).
   Pengaturan penginput, sumber dana, kategori, dan budget otomatis dibagikan ke HP pasangan.

## 4. Cara mencatat

1. Tap nama (**Dodo / Geby**). Pilihan ini diingat untuk catatan berikutnya.
2. Tanggal dan jam terisi otomatis dan bisa diubah.
3. Pilih **Keluar / Masuk**, **Sumber dana**, dan kategori (opsional).
4. Ketik **Uraian**. Saran dari catatan lama akan muncul; tap salah satu untuk mengisi uraian, jumlah terakhir, dan kategorinya.
5. Ketik **Jumlah**. Keyboard otomatis angka; tombol **000** menambah tiga nol.
6. Isi keterangan atau tambahkan foto struk (Kamera/Galeri) bila perlu.
7. Belanja beberapa barang di hari yang sama? Tap **+ Tambah Belanja**.
8. Tap **Simpan**. Data langsung tersimpan di HP dan dikirim ke Spreadsheet saat ada internet.

## 5. Fitur

| Fitur | Keterangan |
|---|---|
| Offline penuh | Aplikasi bisa dibuka dan dipakai mencatat tanpa internet sama sekali. |
| Sinkron otomatis | Berjalan saat ada internet, setelah menyimpan, saat aplikasi dibuka, dan tiap 3 menit. Status terlihat di bawah judul (tap untuk sinkron manual). |
| Data dua HP | Catatan pasangan otomatis ikut terambil, sehingga laporan di kedua HP sama. |
| Data tidak hilang | Data di HP tetap ada setelah tersinkron. Data hanya terhapus kalau dihapus sendiri. |
| Cegah data ganda | Ada ID unik per transaksi, tombol Simpan tidak bisa ditekan dua kali, dan muncul peringatan jika tanggal, jenis, sumber, uraian, dan jumlah sama dengan catatan yang sudah ada. |
| Riwayat | Cari, filter per bulan/orang/jenis/belum sinkron/ada foto, lalu lihat detail, edit, catat lagi, atau hapus. |
| Laporan | Periode (hari, minggu, bulan, tahun, atau rentang sendiri), filter penginput dan sumber dana, saldo per sumber dana, per kategori, per penginput, pengeluaran terbesar, dan rincian harian. Bisa diekspor ke **PNG, PDF, Excel/CSV**, atau dibagikan (mis. ke WhatsApp). |
| Analisis | Perbandingan dengan bulan lalu, rata-rata per hari, proyeksi akhir bulan, budget, saran otomatis, tren 12 bulan, grafik harian, arus kas, kategori, pola hari, dan per penginput. |
| Foto | Dikecilkan otomatis, disimpan di HP, lalu diunggah ke Google Drive (link tersimpan di Spreadsheet). |
| Backup | Backup/pulihkan file `.json`, ekspor semua data ke CSV, dan bersihkan foto lokal yang sudah ada di Drive. |
| Tema | Otomatis, Terang, atau Gelap. |

## 6. Memperbarui aplikasi (untuk Anda sebagai pengembang)

1. Ubah file yang diperlukan.
2. **Naikkan versi di `version.js`**, misalnya `{ v: '1.0.1', d: '2026-10-20' }`.
3. Upload ke GitHub.

HP akan mendeteksi versi baru secara otomatis saat online, lalu langsung memperbarui jika formulir sedang kosong.
Kalau formulir sedang diisi, tombol **Update** berubah kuning; tap tombol itu setelah selesai mencatat.

> Kalau `version.js` tidak dinaikkan, HP tetap memakai versi lama yang tersimpan.

## 7. Masalah umum

- **"Balasan bukan JSON"**: akses Web App belum *Siapa saja*, atau URL yang disalin bukan yang berakhiran `/exec`.
- **"Token salah"**: `TOKEN` di `config.js` tidak sama dengan `TOKEN` di Code.gs. Setelah mengubah Code.gs, terapkan sebagai **versi baru**.
- **URL Web App berubah**: ganti `SCRIPT_URL` di `config.js`, naikkan versi di `version.js`, lalu upload lagi.
- **Mengetik baris langsung di Spreadsheet**: boleh. Isi kolom Tanggal (`2026-10-15`), Jam, Penginput, Jenis (`Masuk`/`Keluar`), Sumber Dana, Uraian, dan Jumlah; kolom ID biarkan kosong (terisi otomatis).
  Mengubah baris lama sebaiknya lewat aplikasi, supaya perubahan ikut ke HP.
- **Data dihapus di HP lain**: buka **Pengaturan → Cek data HP yang tidak ada di Spreadsheet** untuk memilih unggah ulang atau hapus dari HP.

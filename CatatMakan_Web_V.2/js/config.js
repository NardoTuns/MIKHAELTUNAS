// Konfigurasi aplikasi. Versi aplikasi harus sama dengan version.json dan CACHE di sw.js (diurus tools/build-sw.mjs).

export const APP_VERSION = '2.1.0';

/**
 * URL Web App Google Apps Script bawaan. SENGAJA KOSONG: repositori GitHub publik bisa dibaca siapa saja, dan URL ini
 * membuka seluruh data Spreadsheet keluarga. Bagikan lewat "Tautan undangan" (Pengaturan › Sinkron) lewat WhatsApp,
 * atau isi nilai ini hanya bila repositori Anda PRIVAT.
 */
export const DEFAULT_SCRIPT_URL = '';

/**
 * Pengguna utama (ID sinkron kosong = pemilik, data aplikasi Android) hanya bisa DILIHAT di versi web.
 * Anggota keluarga lain bebas mencatat. Server (Code.gs 2.1) juga menolak push web atas pengguna utama.
 */
export const LOCK_MAIN = true;

export const AVATAR_EMOJIS = ['🙂', '😎', '🦁', '🐼', '🐱', '🐶', '🦊', '🐻', '🐰', '🐨', '🐯', '🦄', '🌸', '⭐', '🍀', '⚽'];
export const AVATAR_COLORS = ['#2e7d32', '#00796b', '#1565c0', '#6a1b9a', '#c2185b', '#ef6c00', '#5d4037', '#455a64'];

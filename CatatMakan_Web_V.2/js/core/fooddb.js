// Waktu makan & database kalori bawaan (sama dengan Models.kt + FoodDb.kt Android).

export const MEALS = ['Sarapan', 'Makan Siang', 'Makan Malam', 'Camilan'];

export function mealEmoji(meal) {
  return { Sarapan: '🍳', 'Makan Siang': '🍛', 'Makan Malam': '🍲' }[meal] || '🍎';
}

export function mealForHour(h) {
  if (h >= 4 && h <= 10) return 'Sarapan';
  if (h >= 11 && h <= 14) return 'Makan Siang';
  if (h >= 17 && h <= 21) return 'Makan Malam';
  return 'Camilan';
}

/** Total kalori satu catatan. */
export const total = (e) => (Number(e.kcal) || 0) * (Number(e.portion) || 0);

const F = (name, portion, kcal, protein, carbs, fat) => ({ name, portion, kcal, protein, carbs, fat });

/** Perkiraan kalori makanan umum Indonesia per porsi. Nilai bisa diubah saat mencatat. */
export const FOOD_DB = [
  F('Nasi putih', '1 piring (150 g)', 195, 4, 43, 0.4),
  F('Nasi merah', '1 piring (150 g)', 170, 4, 35, 1.4),
  F('Nasi uduk', '1 piring', 250, 4, 40, 8),
  F('Nasi goreng', '1 piring', 400, 12, 55, 15),
  F('Nasi padang (rendang + sayur)', '1 bungkus', 700, 25, 75, 33),
  F('Bubur ayam', '1 mangkuk', 350, 15, 45, 12),
  F('Lontong / ketupat', '1 potong sedang', 150, 3, 33, 0.3),
  F('Mie goreng instan', '1 bungkus', 380, 8, 54, 14),
  F('Mie kuah instan', '1 bungkus', 320, 7, 46, 12),
  F('Mie ayam', '1 mangkuk', 420, 18, 55, 14),
  F('Roti tawar', '1 lembar', 70, 2.5, 13, 1),
  F('Oatmeal', '40 g + air', 150, 5, 27, 3),
  F('Kentang rebus', '1 buah sedang', 130, 3, 30, 0.2),
  F('Ubi rebus', '1 buah', 110, 2, 26, 0.1),
  F('Jagung rebus', '1 tongkol', 90, 3, 19, 1.3),
  F('Telur rebus', '1 butir', 75, 6, 0.6, 5),
  F('Telur ceplok / dadar', '1 butir', 100, 6, 0.5, 8),
  F('Ayam goreng', '1 potong', 250, 20, 6, 16),
  F('Ayam bakar', '1 potong', 200, 25, 4, 9),
  F('Ayam geprek', '1 potong + sambal', 350, 22, 15, 22),
  F('Dada ayam rebus', '100 g', 165, 31, 0, 3.6),
  F('Ikan goreng', '1 ekor sedang', 200, 20, 3, 12),
  F('Ikan bakar', '1 potong', 150, 22, 1, 6),
  F('Rendang daging', '1 potong', 200, 18, 4, 13),
  F('Sate ayam', '10 tusuk + bumbu', 400, 30, 15, 25),
  F('Pecel lele', '1 porsi (tanpa nasi)', 300, 20, 8, 21),
  F('Tempe goreng', '1 potong', 120, 6, 5, 9),
  F('Tahu goreng', '1 potong', 90, 5, 2, 7),
  F('Soto ayam', '1 mangkuk (tanpa nasi)', 250, 18, 12, 14),
  F('Coto Makassar', '1 mangkuk (tanpa ketupat)', 300, 22, 8, 20),
  F('Bakso', '1 mangkuk', 300, 15, 30, 13),
  F('Siomay', '1 porsi', 300, 15, 35, 11),
  F('Pempek', '1 porsi + cuko', 300, 10, 50, 6),
  F('Gado-gado', '1 porsi', 330, 14, 25, 20),
  F('Capcay', '1 piring', 150, 6, 12, 9),
  F('Sayur bayam', '1 mangkuk', 35, 2, 5, 0.5),
  F('Sayur asem', '1 mangkuk', 70, 2, 12, 2),
  F('Sayur lodeh', '1 mangkuk', 150, 4, 10, 11),
  F('Salad sayur (tanpa saus)', '1 mangkuk', 30, 2, 6, 0.3),
  F('Bakwan / gorengan', '1 buah', 140, 2, 13, 9),
  F('Pisang goreng', '1 buah', 140, 1, 20, 7),
  F('Tahu isi', '1 buah', 125, 4, 10, 8),
  F('Kerupuk', '1 buah besar', 50, 0.5, 6, 3),
  F('Martabak manis', '1 potong', 250, 5, 35, 10),
  F('Pizza', '1 slice', 285, 12, 36, 10),
  F('Es krim', '1 scoop', 140, 2.5, 16, 7),
  F('Pisang', '1 buah', 90, 1, 23, 0.3),
  F('Apel', '1 buah', 80, 0.4, 21, 0.2),
  F('Jeruk', '1 buah', 60, 1, 15, 0.2),
  F('Pepaya', '1 potong', 45, 0.5, 11, 0.2),
  F('Semangka', '1 potong', 45, 1, 11, 0.2),
  F('Mangga', '1 buah', 120, 1.6, 30, 0.8),
  F('Alpukat', '1/2 buah', 120, 1.5, 6, 11),
  F('Yogurt plain', '1 cup (150 g)', 90, 5, 7, 5),
  F('Kacang almond', '1 genggam (28 g)', 165, 6, 6, 14),
  F('Teh manis', '1 gelas', 90, 0, 23, 0),
  F('Teh tawar', '1 gelas', 2, 0, 0.5, 0),
  F('Kopi hitam', '1 cangkir', 5, 0.3, 0, 0),
  F('Kopi susu gula aren', '1 cup', 200, 4, 30, 7),
  F('Susu full cream', '1 gelas (200 ml)', 130, 6.5, 9.5, 7),
  F('Jus jeruk', '1 gelas', 110, 1.7, 26, 0.5),
  // Tambahan versi web
  F('Nasi kuning', '1 piring', 300, 6, 48, 9),
  F('Ketoprak', '1 porsi', 400, 13, 50, 16),
  F('Lontong sayur', '1 porsi', 350, 9, 45, 15),
  F('Nasi campur', '1 piring', 550, 20, 65, 22),
  F('Ayam penyet', '1 potong + sambal', 330, 22, 10, 22),
  F('Ikan pepes', '1 bungkus', 160, 22, 3, 6),
  F('Telur balado', '1 butir', 120, 6, 4, 9),
  F('Tumis kangkung', '1 piring kecil', 80, 3, 6, 5),
  F('Sop ayam', '1 mangkuk', 150, 12, 10, 6),
  F('Rawon', '1 mangkuk (tanpa nasi)', 280, 20, 8, 18),
  F('Sate kambing', '10 tusuk + bumbu', 450, 32, 12, 30),
  F('Batagor', '1 porsi', 350, 12, 35, 18),
  F('Cilok', '10 butir + saus', 200, 3, 38, 4),
  F('Seblak', '1 mangkuk', 350, 8, 45, 15),
  F('Roti bakar cokelat', '2 potong', 300, 7, 40, 12),
  F('Donat', '1 buah', 250, 4, 30, 13),
  F('Klepon', '5 buah', 175, 2, 34, 4),
  F('Kurma', '3 buah', 70, 0.6, 18, 0.1),
  F('Salak', '2 buah', 80, 0.4, 21, 0.2),
  F('Es teh manis', '1 gelas', 100, 0, 25, 0),
  F('Es jeruk', '1 gelas', 120, 1, 29, 0.2),
  F('Air kelapa', '1 gelas', 45, 1.7, 9, 0.5),
  F('Susu kedelai', '1 gelas', 110, 7, 10, 4),
];

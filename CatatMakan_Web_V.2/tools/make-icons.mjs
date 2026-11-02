// Buat ikon PNG dari SVG memakai Chrome headless.  Jalankan: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Piring putih berisi daun & tanda centang di atas latar hijau. full = tanpa sudut membulat (maskable/apple).
const art = (full, pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#43a047"/><stop offset="1" stop-color="#1b5e20"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ccc65"/><stop offset="1" stop-color="#558b2f"/></linearGradient>
  </defs>
  ${full ? '<rect width="512" height="512" fill="url(#g)"/>' : '<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/>'}
  <g transform="translate(256 256) scale(${(1 - pad).toFixed(3)}) translate(-256 -256)">
    <circle cx="256" cy="268" r="150" fill="#ffffff"/>
    <circle cx="256" cy="268" r="112" fill="#e8f5e9"/>
    <path d="M196 300c-6-70 40-122 128-132-6 88-56 136-128 132z" fill="url(#l)"/>
    <path d="M206 292c30-40 62-70 100-102" stroke="#ffffff" stroke-width="9" stroke-linecap="round" fill="none"/>
    <circle cx="318" cy="318" r="30" fill="#ff7043"/>
    <path d="M150 112v70M134 112v44a16 16 0 0 0 32 0v-44" stroke="#ffffff" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M372 112c18 0 26 24 26 48s-10 32-26 32v-80zM372 192v-80" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="#ffffff"/>
  </g>
</svg>`;

const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="50" r="34" fill="none" stroke="#fff" stroke-width="8"/>
  <path d="M34 58c-1-16 9-27 29-29-1 20-13 30-29 29z" fill="#fff"/>
</svg>`;

const browser = await launchBrowser({ width: 512, height: 512 });
try {
  const page = await browser.newPage();
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  async function shot(svg, size, file) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const html = `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}::-webkit-scrollbar{display:none}</style></head><body>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    await page.goto('data:text/html;base64,' + Buffer.from(html).toString('base64'));
    await page.screenshot(join(root, 'icons', file));
    console.log('ditulis icons/' + file);
  }
  await shot(art(false), 192, 'icon-192.png');
  await shot(art(false), 512, 'icon-512.png');
  await shot(art(true, 0.2), 512, 'maskable-512.png');
  await shot(art(true, 0.08), 180, 'apple-touch-icon.png');
  await shot(badge, 96, 'badge-96.png');
  writeFileSync(join(root, 'icons', 'favicon.svg'), art(false).trim());
  console.log('ditulis icons/favicon.svg');
  page.close();
} finally {
  await browser.close();
}

// Perbarui daftar file & nama cache di sw.js (agar HP mendeteksi versi baru), dan samakan versi
// di js/config.js ↔ version.json. Jalankan setelah mengubah file apa pun:  node tools/build-sw.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['tools', 'test', 'apps-script', 'node_modules', '.git', '.github']);
const SKIP_FILES = new Set(['sw.js', 'README.md', 'package.json', 'package-lock.json', '.nojekyll', '.gitignore', 'PANDUAN.md']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); } else if (!SKIP_FILES.has(name) && !name.startsWith('LICENSE')) out.push(p);
  }
  return out;
}

const files = walk(root).map((p) => relative(root, p).split(sep).join('/')).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).version;
const config = readFileSync(join(root, 'js/config.js'), 'utf8');
const cfgVer = /APP_VERSION = '([^']+)'/.exec(config)[1];
if (cfgVer !== version) {
  writeFileSync(join(root, 'js/config.js'), config.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`));
  console.log(`js/config.js: APP_VERSION ${cfgVer} → ${version}`);
  hash.update(version);
}
const cache = `catatmakan-${version}-${hash.digest('hex').slice(0, 10)}`;
const assets = ['./', ...files];
let sw = readFileSync(join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']*';/, `const CACHE = '${cache}';`)
  .replace(/const ASSETS = \[[^\]]*\];/, `const ASSETS = ${JSON.stringify(assets)};`);
writeFileSync(join(root, 'sw.js'), sw);
const size = files.reduce((a, f) => a + statSync(join(root, f)).size, 0);
console.log(`sw.js: ${cache} · ${files.length} file (${Math.round(size / 1024)} KB) disimpan untuk offline`);

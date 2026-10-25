// Pengendali Chrome/Edge headless minimal lewat Chrome DevTools Protocol (tanpa dependensi).
// Dipakai uji end-to-end halaman HTML (builder offline, renderer soal Android, dashboard).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);

export async function launchBrowser({ width = 1280, height = 900 } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome/Edge tidak ditemukan. Set CHROME_PATH.');
  const profile = mkdtempSync(path.join(os.tmpdir(), 'cbtn-cdp-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--allow-file-access-from-files', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 100; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!version) { proc.kill(); throw new Error('Browser headless tidak merespons.'); }
  async function close() {
    proc.kill();
    await new Promise((r) => setTimeout(r, 400));
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* profil masih dikunci */ }
  }
  async function newPage(url) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    const page = await connectPage(t.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    if (url) await page.goto(url);
    return page;
  }
  return { newPage, close, exe };
}

async function connectPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const errors = [];
  const consoleMessages = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') consoleMessages.push({ type: m.params.type, text: m.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
    for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const page = {
    send, errors, consoleMessages,
    async goto(url, timeoutMs = 30000) {
      let tm;
      const loaded = new Promise((r, rej) => {
        listeners.push((m) => { if (m.method === 'Page.loadEventFired') r(); });
        tm = setTimeout(() => rej(new Error('Waktu habis memuat ' + url)), timeoutMs);
      });
      await send('Page.navigate', { url });
      await loaded.finally(() => clearTimeout(tm));
    },
    /** Evaluasi ekspresi JS (boleh async) dan kembalikan nilainya. */
    async eval(expr, timeoutMs = 30000) {
      let tm;
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
        new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('Waktu habis mengevaluasi: ' + expr.slice(0, 160))), timeoutMs); }),
      ]).finally(() => clearTimeout(tm));
      if (r.exceptionDetails) throw new Error('Galat di halaman: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, timeoutMs = 10000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (await page.eval(`!!(${expr})`)) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('Waktu habis menunggu: ' + expr);
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    close() { ws.close(); },
  };
  return page;
}

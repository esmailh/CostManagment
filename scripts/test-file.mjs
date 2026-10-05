import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const FILE = 'file:///F:/2/dist-single/index.html';
const userDir = mkdtempSync(join(tmpdir(), 'expense-file-'));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return {
    send(method, params = {}) {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method, params }));
      return new Promise((res) => pending.set(mid, res));
    },
  };
}

async function main() {
  const target = await waitForTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const c = cdp(ws);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  const evalJs = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const res = r.result || {};
    if (res.exceptionDetails) return 'EXC: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await c.send('Page.navigate', { url: FILE });
  await sleep(3000);

  console.log('=== PAGE TEXT ===');
  console.log(await evalJs(`document.body.innerText`));

  console.log('\n=== INDEXEDDB ===');
  console.log(await evalJs(`
    (async () => {
      try {
        const db = await new Promise((res, rej) => { const q = indexedDB.open('expense-tracker'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); q.onblocked = () => rej(new Error('blocked')); });
        const n = await new Promise((res) => { const c = db.transaction('categories','readonly').objectStore('categories').count(); c.onsuccess = () => res(c.result); });
        db.close();
        return 'categories=' + n;
      } catch (e) { return 'ERR ' + e.name + ': ' + e.message; }
    })()
  `));

  console.log('\n=== SECURE CONTEXT ===');
  console.log('isSecureContext:', await evalJs(`window.isSecureContext`));
  console.log('serviceWorker:', await evalJs(`'serviceWorker' in navigator`));

  console.log('\nFILE TEST DONE');
  proc.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error('FAILED:', e);
  proc.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const APP = 'http://127.0.0.1:4173/';
const userDir = mkdtempSync(join(tmpdir(), 'expense-data-'));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
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
  await c.send('Network.enable');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  const evalJs = async (expression) => {
    const r = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const res = r.result || {};
    if (res.exceptionDetails) return 'EXC: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result?.value;
  };

  await c.send('Page.navigate', { url: APP });
  await sleep(2500);

  // Inject helpers
  await evalJs(`
    window.__set = (el, value) => {
      if (!el) return false;
      const tag = el.tagName;
      let proto, ev;
      if (tag === 'TEXTAREA') { proto = HTMLTextAreaElement.prototype; ev = 'input'; }
      else if (tag === 'SELECT') { proto = HTMLSelectElement.prototype; ev = 'change'; }
      else { proto = HTMLInputElement.prototype; ev = 'input'; }
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(ev, { bubbles: true }));
      return true;
    };
    window.__selectByText = (sel, text) => {
      const o = [...sel.options].find(o => o.textContent.includes(text));
      if (o) window.__set(sel, o.value);
      return !!o;
    };
    window.__clickExact = (text) => {
      const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === text);
      if (b) b.click();
      return !!b;
    };
    window.__clickContains = (text) => {
      const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim().includes(text));
      if (b) b.click();
      return !!b;
    };
    window.__lastAction = () => {
      const bs = [...document.querySelectorAll('.modal__actions button')];
      const b = bs[bs.length - 1];
      if (b) b.click();
      return !!b;
    };
    window.__text = () => document.body.innerText;
    'helpers ready';
  `);

  const step = async (name, fn) => {
    const out = await fn();
    console.log(`\n### ${name}\n${out}`);
  };

  await step('onboard', async () => { await evalJs(`document.querySelector('.onboarding button')?.click()`); await sleep(800); return 'ok'; });

  // --- Add recurring expense ---
  await step('nav settings', async () => { await evalJs(`window.__clickContains('تنظیمات')`); await sleep(600); return await evalJs(`window.__text()`); });
  await step('open recurring manager', async () => {
    await evalJs(`[...document.querySelectorAll('.settings-row')].find(b => b.innerText.includes('هزینه‌های ثابت'))?.click()`);
    await sleep(600); return await evalJs(`window.__text()`);
  });
  await step('open recurring form', async () => { await evalJs(`window.__clickContains('هزینه ثابت جدید')`); await sleep(600); return 'form open'; });
  await step('fill recurring form', async () => {
    const r = await evalJs(`
      (() => {
        const title = document.querySelector('input[placeholder="مثلاً اجاره خانه"]');
        const amount = document.querySelector('.amount-input');
        const selects = [...document.querySelectorAll('.select')];
        window.__set(title, 'اجاره خانه');
        window.__set(amount, '150000000');
        window.__selectByText(selects[0], 'مسکن');
        return 'title=' + (title && title.value) + ' amount=' + (amount && amount.value) + ' cat=' + (selects[0] && selects[0].value ? 'set' : 'none');
      })()
    `);
    await sleep(200);
    return r;
  });
  await step('submit recurring', async () => { await evalJs(`window.__lastAction()`); await sleep(800); return 'submitted'; });

  // --- Back to dashboard, generate ---
  await step('nav home', async () => { await evalJs(`window.__clickExact('خانه')`); await sleep(800); return await evalJs(`window.__text()`); });
  await step('open generate dialog', async () => { await evalJs(`window.__clickContains('ثبت هزینه‌های ثابت این ماه')`); await sleep(700); return await evalJs(`window.__text()`); });
  await step('generate recurring', async () => { await evalJs(`window.__lastAction()`); await sleep(900); return await evalJs(`window.__text()`); });

  // --- Add daily expense ---
  await step('open add expense (FAB)', async () => { await evalJs(`document.querySelector('[aria-label="ثبت هزینه"]')?.click()`); await sleep(700); return await evalJs(`window.__text()`); });
  await step('fill daily expense', async () => {
    const r = await evalJs(`
      (() => {
        const amount = document.querySelector('.amount-input');
        const title = document.querySelector('input[placeholder="مثلاً خرید سوپرمارکت"]');
        const selects = [...document.querySelectorAll('.select')];
        window.__set(amount, '850000');
        window.__set(title, 'خرید سوپرمارکت');
        window.__selectByText(selects[0], 'خوراک');
        return 'amount=' + (amount && amount.value) + ' title=' + (title && title.value);
      })()
    `);
    await sleep(200);
    return r;
  });
  await step('submit daily', async () => { await evalJs(`window.__lastAction()`); await sleep(900); return 'submitted'; });

  // --- Dashboard totals ---
  await step('dashboard totals', async () => { return await evalJs(`window.__text()`); });

  // --- Re-open generate to verify no duplicates ---
  await step('generate dialog (dedup check)', async () => {
    await evalJs(`window.__clickContains('ثبت هزینه‌های ثابت این ماه')`);
    await sleep(700);
    return await evalJs(`window.__text()`);
  });
  await step('close generate dialog', async () => { await evalJs(`window.__clickExact('بستن')`); await sleep(400); return 'closed'; });

  // --- Expenses list ---
  await step('expenses list', async () => { await evalJs(`window.__clickExact('هزینه‌ها')`); await sleep(800); return await evalJs(`window.__text()`); });

  // --- Reports ---
  await step('reports monthly', async () => { await evalJs(`window.__clickExact('گزارش‌ها')`); await sleep(800); return await evalJs(`window.__text()`); });

  // --- DB counts ---
  await step('indexeddb counts', async () => evalJs(`
    (async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open('expense-tracker'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const count = (s) => new Promise((res) => { const c = db.transaction(s,'readonly').objectStore(s).count(); c.onsuccess = () => res(c.result); });
      const cats = await count('categories');
      const rec = await count('recurringExpenses');
      const exp = await count('expenses');
      db.close();
      return 'categories=' + cats + ' recurring=' + rec + ' expenses=' + exp;
    })()
  `));

  // --- Offline reload check ---
  await step('go offline + reload', async () => {
    await c.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await c.send('Page.navigate', { url: APP });
    await sleep(3000);
    const txt = await evalJs(`window.__text ? window.__text().slice(0, 400) : document.body.innerText.slice(0,400)`);
    await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    return txt;
  });

  console.log('\nDATA SMOKE DONE');
  proc.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch((e) => {
  console.error('DATA SMOKE FAILED:', e);
  proc.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});

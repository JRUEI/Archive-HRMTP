// 圖卡溢出量測：逐集切到「圖卡 → 段落紀錄」與「精簡總結」，量隱藏匯出容器裡每張 1080×1920 原尺寸卡。
// 先開 headless Chrome（--remote-debugging-port=9222）與 npm run dev，見 docs/agent-workflow.md §2。
//   node scripts/card-probe.mjs [輸出.json] [1-12]
// 有內容卡溢出或精簡總結餘裕 < 0 時 exit 1。JSON 有每個條目的實際行數，可拿來對照 CardMode.tsx 的 lineCount。
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.argv[2];
const [a, b] = (process.argv[3] || '1-12').split('-').map(Number);
const eps = [];
for (let i = a; i <= (b || a); i++) eps.push(i);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const tab = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const waiters = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  for (const w of [...waiters]) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.params); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const once = method => new Promise(resolve => waiters.push({ method, resolve }));
// 把函式原始碼丟進頁面執行（函式內不能用外面的變數）
async function evaluate(fn, ...args) {
  const r = await send('Runtime.evaluate', {
    expression: `(${fn.toString()})(...${JSON.stringify(args)})`,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

// --- 頁面內執行 ---
async function switchTo(labels, mode) {
  const btn = t => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t);
  const hidden = () => [...document.querySelectorAll('div[aria-hidden="true"]')].find(d => d.querySelector('.export-card'));
  for (const l of labels) {
    const el = btn(l);
    if (!el) throw new Error('找不到按鈕 ' + l);
    el.click();
    await new Promise(r => setTimeout(r, 400));
  }
  for (let i = 0; i < 150; i++) {
    const n = hidden()?.querySelectorAll(':scope > .export-card').length ?? 0;
    if (mode === 'summary' ? n === 1 : n > 2) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 800));
}

function measureCards() {
  const hidden = [...document.querySelectorAll('div[aria-hidden="true"]')].find(d => d.querySelector('.export-card'));
  const cards = [...hidden.querySelectorAll(':scope > .export-card')];
  const px = v => parseFloat(v) || 0;
  const linesOf = el => {
    const cs = getComputedStyle(el);
    const lh = px(cs.lineHeight);
    return { fs: px(cs.fontSize), lines: Math.round(el.getBoundingClientRect().height / lh), w: el.clientWidth };
  };
  return cards.map(card => {
    const out = { overflow: card.scrollHeight - card.clientHeight };
    const h2 = card.querySelector('h2');
    if (!h2) {
      // 精簡總結：裝飾圓會撐大 scrollHeight，改看 z-index 10 內層的餘裕
      const inner = [...card.children].find(c => c.style.zIndex === '10');
      if (!inner) return { ...out, type: 'other' };
      const h1 = inner.querySelector('h1');
      return {
        ...out, type: 'summary', margin: card.clientHeight - 160 - inner.offsetHeight,
        title: { text: h1.textContent, ...linesOf(h1) },
        items: [...inner.querySelectorAll('li')].map(li => {
          const d = li.querySelector('div');
          return { kind: 'sum', text: d.textContent, ...linesOf(d) };
        }),
      };
    }
    const body = h2.parentElement.children[2];
    const kids = [...body.children];
    const items = [];
    for (const k of kids) {
      if (k.tagName === 'UL') {
        for (const li of k.children) items.push({ kind: 'li', text: li.textContent, ...linesOf(li.querySelector('p') || li) });
      } else if (k.tagName === 'P') items.push({ kind: 'p', text: k.textContent, ...linesOf(k) });
      else { const p = k.querySelector('p') || k; items.push({ kind: 'quote', text: p.textContent, ...linesOf(p) }); }
    }
    // 內文框內距以內，最後一個條目（含 margin）底下還剩多少
    const top = body.getBoundingClientRect().top + 48;
    const last = kids[kids.length - 1];
    const used = last ? last.getBoundingClientRect().bottom + px(getComputedStyle(last).marginBottom) - top : 0;
    const avail = card.getBoundingClientRect().top + 1920 - 72 - card.lastElementChild.offsetHeight - 32 - 48 - top;
    return { ...out, type: 'content', title: { text: h2.textContent, ...linesOf(h2) }, items, slack: avail - used };
  });
}

// --- driver ---
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const result = { base: BASE, eps: [] };
let bad = 0;
const total = { cards: 0, split: 0 };
for (const ep of eps) {
  const nn = String(ep).padStart(2, '0');
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `${BASE}/episodes/ep${nn}/` }); // trailingSlash：少了結尾 / 會 308
  await loaded;
  await sleep(2500);
  await evaluate(switchTo, ['圖卡', '段落紀錄'], 'lossless');
  const lossless = await evaluate(measureCards);
  await evaluate(switchTo, ['精簡總結'], 'summary');
  const summary = (await evaluate(measureCards))[0];
  result.eps.push({ ep, lossless, summary });

  const content = lossless.filter(c => c.type === 'content');
  const split = content.filter(c => / \(1\/\d+\)$/.test(c.title.text)).length;
  const overflow = Math.max(...lossless.map(c => c.overflow));
  total.cards += content.length;
  total.split += split;
  if (overflow > 0 || summary.margin < 0) bad++;
  console.log(`ep${nn}: 內容卡 ${content.length}，被切開的段落 ${split}，最大溢出 ${overflow}，`
    + `最小餘裕 ${Math.min(...content.map(c => c.slack)).toFixed(1)}，精簡總結餘裕 ${summary.margin}`);
}
console.log(`合計：內容卡 ${total.cards}，被切開的段落 ${total.split}，有問題的集數 ${bad}`);
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1), 'utf8');
await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`);
ws.close();
process.exitCode = bad ? 1 : 0;

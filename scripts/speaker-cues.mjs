// 雙人回說話者標籤的文字線索掃描與自動修正（離線、唯讀，不寫回 content/）。
//   node scripts/speaker-cues.mjs            → 印出各集統計
//   node scripts/speaker-cues.mjs 10 --json out.json → 另存 ep10 每列的前後標籤與線索
// 只用逐字稿文字：沒有音訊，所以「修正」是推論，不是驗證。
import { readFileSync, writeFileSync } from 'node:fs';

const HOST = '福嶋晴菜';
// 對方怎麼叫這個人（出現在「」外 → 這列多半是另一個人說的）
const HOST_CALLS = ['福ちゃん', '福嶋さん', '晴菜ちゃん', 'はるなちゃん'];
const GUEST_CALLS = {
  '今泉りおな': ['りおなちゃん', 'りおなさん', 'りおな', '今泉さん'],
  '真野美月': ['真野さん', 'みづきちゃん', 'まのちゃん'],
  '藤本侑里': ['侑里ちゃん', '侑里さん', '藤本さん'],
  '根本優奈': ['ねもちゃん', '根本さん', '優奈ちゃん'],
  '佐藤榛夏': ['さとはる', '佐藤さん', '榛夏ちゃん'],
  '佐伯伊織': ['佐伯さん', '伊織さん', '伊織ちゃん'],
};

export function parse(md) {
  const fm = md.match(/^guest:\s*"([^"]*)"/m);
  const yt = md.match(/^youtube:\s*"[^"]*v=([\w-]{11})/m);
  const body = md.slice(md.indexOf('## 【完整逐字稿】'));
  const lines = [];
  for (const m of body.matchAll(/^\[(\d+:\d{2})\] \[([^\]]+)\] (.*)$/gm)) {
    const [mm, ss] = m[1].split(':').map(Number);
    lines.push({ t: m[1], sec: mm * 60 + ss, sp: m[2], text: m[3] });
  }
  return { guest: fm ? fm[1] : '', videoId: yt ? yt[1] : '', lines };
}

// 每集事實表：只屬於其中一人的事（來自該集內容）。列裡有「我」沒有「妳」→ 是本人在說；反過來 → 是對方在說。
// ponytail: 手寫、只有 ep10；要推到別集就照這個格式補，或從精簡總結抽。
const FACTS = {
  '佐藤榛夏': {
    guest: ['法學部', '律師', '司法考試', '乙女遊戲', '豐橋', '三河腔', 'メビウス・ダスト', '白鳥織花', 'ミッフィー', 'スンスン'],
    host: ['荷官', 'てつりょー', '矢神うしお', 'みちこ'],
  },
};

const outsideQuotes =(s) => s.replace(/「[^」]*」/g, '').replace(/『[^』]*』/g, '');
const isQuestion = (s) => /[？?]\s*(\[[^\]]+\])?\s*$/.test(s) || /嗎[。]?$/.test(s);
const ANSWER_START = /^(\[[^\]]+\])?\s*(對|嗯|是|有|沒有|不是|沒錯|啊，對|啊，是|好像|應該)/;
const BACKCHANNEL = /^(\[[^\]]+\])?\s*((嗯|對|是|啊|喔|哦|欸|好|真的|是喔|這樣啊|原來如此)[。！、，…]*\s*)+(\[[^\]]+\])?\s*$/;

// 每列的證據：+1 = 支持「真正說話者是主持人」，-1 = 支持來賓。strong 才能單列翻轉。
export function cues(ep) {
  const g = ep.guest;
  const gCalls = GUEST_CALLS[g] || [];
  return ep.lines.map((l, i) => {
    const out = [];
    const o = outsideQuotes(l.text);
    if (/我是(聲優)?福嶋晴菜/.test(o) || /福嶋晴菜的『はるまとぺーじ』/.test(l.text)) out.push({ k: 'self-host', v: +1, strong: true });
    if (new RegExp('我是(聲優)?' + g).test(o)) out.push({ k: 'self-guest', v: -1, strong: true });
    if (/書籤名「|信上這麼寫|寄來的，謝謝/.test(l.text)) out.push({ k: 'letter', v: +1, strong: false });
    for (const n of HOST_CALLS) if (o.includes(n)) { out.push({ k: 'calls-host:' + n, v: -1, strong: true }); break; }
    for (const n of gCalls) if (o.includes(n)) { out.push({ k: 'calls-guest:' + n, v: +1, strong: true }); break; }
    const f = FACTS[g];
    if (f) {
      const me = o.includes('我') && !o.includes('妳'), you = o.includes('妳') && !o.includes('我');
      for (const [who, v] of [['host', +1], ['guest', -1]]) {
        const hit = f[who].find((w) => o.includes(w));
        if (hit && (me || you)) { out.push({ k: 'fact:' + hit, v: me ? v : -v, strong: false }); break; }
      }
    }
    const prev = ep.lines[i - 1];
    if (prev && prev.sp === l.sp && isQuestion(prev.text) && ANSWER_START.test(l.text))
      out.push({ k: 'answers-own-question', v: 0, strong: false });
    if (prev && prev.sp === l.sp && BACKCHANNEL.test(l.text))
      out.push({ k: 'backchannel-self', v: 0, strong: false });
    return out;
  });
}

// 相鄰兩列「應該換人」的線索：同一人標兩列時才算疑點（不指出誰對，只說這兩列不像同一人）
const THANKS = /^(\[[^\]]+\])?\s*(啊，|哇，)?(謝謝|多謝|好開心。謝謝)/;
const THANK_WORTHY = /(生日快樂|辛苦了|恭喜|好厲害|好可愛|好棒|超棒|禮物|送給妳|謝謝妳來)/;
export function pairAnomalies(ep) {
  const out = [];
  const L = ep.lines;
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i];
    if (a.sp !== b.sp || a.sp.includes('＆')) continue;
    const ta = outsideQuotes(a.text), tb = b.text;
    let k = null;
    if (isQuestion(ta) && ANSWER_START.test(tb)) k = 'Q→A';
    else if (THANKS.test(tb) && THANK_WORTHY.test(ta)) k = '誇→謝';
    else if (BACKCHANNEL.test(tb) && b.sec - a.sec <= 3) k = '自己附和';
    else {
      const tail = ta.replace(/[\s。！？、，…～\[\]笑聲]+$/g, '').slice(-3);
      if (tail.length >= 2 && tb.replace(/^(\[[^\]]+\])?\s*(啊|喔|咦)?，?/, '').startsWith(tail)) k = '覆誦';
    }
    if (k) out.push({ i, k });
  }
  return out;
}

const role = (sp, g) => (sp === HOST ? +1 : sp === g ? -1 : 0);

// 兩狀態 HMM（0 = 標籤照舊、1 = 這一段整段對調）。方向性證據 v 才進發射；
// 結構性證據（自問自答、自己附和）在對調狀態下一樣成立，所以只拿來找疑點，不進 Viterbi。
export function relabel(ep, { switchCost = 3, strongW = 2, weakW = 0.75 } = {}) {
  const g = ep.guest;
  const cs = cues(ep);
  const n = ep.lines.length;
  const score = (i, s) => {
    const r = role(ep.lines[i].sp, g);
    if (!r) return 0;
    let c = 0;
    for (const q of cs[i]) {
      if (!q.v) continue;
      const agrees = q.v === (s ? -r : r);
      c += (agrees ? -1 : 1) * (q.strong ? strongW : weakW);
    }
    return c;
  };
  const cost = [[score(0, 0), score(0, 1) + switchCost]];
  const back = [[0, 0]];
  for (let i = 1; i < n; i++) {
    const row = [], b = [];
    for (const s of [0, 1]) {
      const stay = cost[i - 1][s], sw = cost[i - 1][1 - s] + switchCost;
      b.push(stay <= sw ? s : 1 - s);
      row.push(Math.min(stay, sw) + score(i, s));
    }
    cost.push(row); back.push(b);
  }
  const state = new Array(n);
  state[n - 1] = cost[n - 1][0] <= cost[n - 1][1] ? 0 : 1;
  for (let i = n - 1; i > 0; i--) state[i - 1] = back[i][state[i]];
  const swap = (sp) => (sp === HOST ? g : sp === g ? HOST : sp);
  return ep.lines.map((l, i) => {
    let after = state[i] ? swap(l.sp) : l.sp;
    // 單列：強證據跟（整段處理後的）標籤仍矛盾 → 只翻這一列
    const r = role(after, g);
    const strongV = cs[i].filter((q) => q.strong && q.v).map((q) => q.v);
    const single = r && strongV.length && strongV.every((v) => v === -r);
    if (single) after = swap(after);
    return { ...l, after, run: !!state[i], single: !!single, cues: cs[i].map((q) => q.k) };
  });
}

function runs(sps) {
  let k = 0;
  for (let i = 0; i < sps.length; i++) if (i === 0 || sps[i] !== sps[i - 1]) k++;
  return k;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('speaker-cues.mjs')) {
  const eps = ['02', '04', '06', '08', '10', '12'];
  const want = process.argv[2];
  const rows = [];
  for (const e of eps) {
    if (want && want !== String(Number(e)) && want !== e) continue;
    const ep = parse(readFileSync(`content/episodes/ep${e}.md`, 'utf8'));
    const res = relabel(ep);
    const cs = res.map((r) => r.cues);
    const count = (p) => cs.filter((c) => c.some((k) => k.startsWith(p))).length;
    const contra = res.filter((r) => {
      const ro = role(r.sp, ep.guest);
      return ro && cues(ep)[res.indexOf(r)].some((q) => q.strong && q.v === -ro);
    }).length;
    rows.push({
      ep: e, lines: res.length, runs: runs(res.map((r) => r.sp)),
      strongCues: cs.filter((c) => c.some((k) => /^(self|calls)/.test(k))).length,
      strongContradict: contra,
      answersOwnQ: count('answers-own'), backchannelSelf: count('backchannel-self'),
      relabelRun: res.filter((r) => r.run && r.after !== r.sp).length,
      relabelSingle: res.filter((r) => r.single).length,
      changed: res.filter((r) => r.after !== r.sp).length,
    });
    const pa = pairAnomalies(ep);
    rows[rows.length - 1].pairAnomalies = pa.length;
    if (want && process.argv.includes('--pairs')) {
      for (const p of pa) console.log(p.k, ep.lines[p.i - 1].t, ep.lines[p.i - 1].sp, '|', ep.lines[p.i - 1].text.slice(-30), '‖', ep.lines[p.i].t, ep.lines[p.i].text.slice(0, 30));
    } else if (want) {
      for (const [i, r] of res.entries()) {
        if (r.after !== r.sp || r.cues.length) console.log(i, r.t, r.sp === HOST ? 'H' : 'G', '->', r.after === HOST ? 'H' : 'G', r.run ? 'RUN' : '', r.single ? 'ONE' : '', r.cues.join(','), '|', r.text.slice(0, 50));
      }
      const j = process.argv.indexOf('--json');
      if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify({ guest: ep.guest, videoId: ep.videoId, lines: res }), 'utf8');
    }
  }
  console.table(rows);
}

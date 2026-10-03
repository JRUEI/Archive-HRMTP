// 把逐字稿每一列的整秒時間碼補成 0.1 秒：[13:32] → [13:32.4]。做法搬自 jurii-showroom 的同名工具。
//
//   node scripts/stamp-times.mjs <epNN ...|--all> [--check]
//   --check 只算不寫（統計照印）；--self-test 跑檔案最後面的小檢查。
//
// 讀 content/episodes/<ep>.md 和 content/<ep>.ja.vtt，只動「## 【完整逐字稿】」底下還沒有小數的列，
// 其他位元組（換行、文字、段落標題）原樣保留；已經有小數的列不碰，所以重跑不會再改。
//
// 時間哪來：日文自動字幕每個字都帶開口時間（<00:00:01.234><c>字</c>），每個 cue 的第一個字用 cue 開始時間，
// 「。」「、」也各算一個字。這是 YouTube 的字幕時間，不保證貼著實際聲音。
// 有來賓的回大多沒有逐字時間，字幕一個片語一個片語出現：每個新片語整個算一個字，時間用它的 cue 開始時間；
// 一列從片語中間開始講的，窗口裡就沒有字，留整秒。（這段是 jurii-showroom 沒有的，那邊整塊字幕一律留整秒）
//
// 挑哪個字：一列的整秒 t 是它第一個字開口時間捨去到整秒，所以那個字一定落在 [t, t+1) 秒的窗口內，
// 小數 = 它的開口時間捨去到 0.1 秒（整秒部分因此永遠等於原標籤）。窗口常有好幾個字，每個字打分數，越低越好：
//   1. 先驗：窗口內第一個句首字 0、後面的句首字 1、子句邊界 2、其他 3。句首字＝整份字幕第一個字，或上一個字
//      以 。？！ 結尾；子句邊界＝上一個字是「、」，或離上一個字開口 ≥ 0.4 秒。（往前多看一秒的列見下）
//   2. 長度：一列的中文字數約是它涵蓋的日文字數的 RATIO 倍（Gale–Church 長度比對）。相鄰兩列選的字決定上一列
//      涵蓋多少日文字，對不上就扣分。
//   3. 順序：選到不在上一列之後的字扣重分，所以時間不會倒退。
//   整集用 Viterbi 一次找總分最低的組合，一列選哪個字也看前後列的字數。
//   窗口裡一個字都沒有的列（標籤不是任何字的整秒）維持整秒，統計列為「留整秒」。
//
// 換人挪一秒的列（這段也是 jurii-showroom 沒有的）：逐字稿相鄰兩列不同秒，同一秒換人時後一列往後挪一秒，
// 這種列的第一個字其實在前一秒。所以換了說話者、又剛好比上一列晚一秒的列，窗口從上一列的整秒開始，多看前一秒：
//   - 前一秒只挑有口語字的字；[笑い] 這類標記和標點，逐字稿都寫在上一列。
//   - 前一秒裡也有上一列的字，所以上一列選的字之後的第一個句首字也算 0 分，跟這一列自己那一秒的第一個句首字
//     一樣；兩個都 0 分時由長度決定前一秒那句歸誰。
//   - 選到前一秒的字＝開頭在前一秒，整秒不能動，寫 .0，統計列為「開頭在前一秒」。
//   - 選到的字不在上一列選的字之後＝前一秒沒有這一列的字：這些列不往前看，重算。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const contentDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

// ponytail: 比例固定；各集中位數差很多時改成每集用句首列量一次
const RATIO = 0.67; // 中文字數 ÷ 日文字數
const SMOOTH = 4; // 長度差的變異數 ＝ 日文字數 + SMOOTH
const PAUSE_MS = 400;
const OUT_OF_ORDER = 8;
const PRIOR = { firstSentence: 0, laterSentence: 1, clause: 2, other: 3 };

// [mm:ss] 或 [hh:mm:ss]，後面可帶一位小數；和 validate-content.mjs 認的逐字稿列一致
const ROW =
  /^([ \t]*\[(\d{2}:\d{2}(?::\d{2})?))(?:\.(\d))?\][ \t]*\[([^\]\r\n]+)\][ \t]*([^\r\n]*)/gm;
const TAGS = /\[[^\]]*\]|［[^］]*］/g;
const MARKS = /[\s。，、？！「」『』（）()—…·〈〉《》,.?!:;：；"'~〜♪]/g;

class Fail extends Error {}

// 口語字數：不算標點、空白和 [音效] 標記
const spoken = (text) => [...text.replace(TAGS, "").replace(MARKS, "")].length;

// 自動字幕 → { T: 每個字的開口時間(ms), W: 每個字的文字 }
export function parseVtt(vtt) {
  const T = [];
  const W = [];
  const ms = (m) => ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].padEnd(3, "0").slice(0, 3);
  for (const block of vtt.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n").filter(Boolean);
    const head = lines.findIndex((line) => line.includes("-->"));
    if (head === -1) continue;
    const [start, end] = [...lines[head].matchAll(/(\d+):(\d+):(\d+)\.(\d+)/g)].map(ms);
    // 沒有逐字時間的片語：cue 最後一行是新的字（10ms 的過場 cue 只是重複上一行，跳過）
    const last = lines.at(-1);
    if (end - start >= 50 && head < lines.length - 1 && last.trim() && !last.includes("<c>")) {
      T.push(start);
      W.push(last.trim());
    }
    for (const line of lines.slice(head + 1)) {
      if (!line.includes("<c>")) continue; // 沒有逐字標記的是上一句的重複
      const lead = line.slice(0, line.indexOf("<"));
      if (lead.trim()) {
        T.push(start);
        W.push(lead);
      }
      for (const m of line.matchAll(/<(\d+):(\d+):(\d+)\.(\d+)><c>(.*?)<\/c>/g)) {
        T.push(ms(m));
        W.push(m[5]);
      }
    }
  }
  return { T, W };
}

// 每個字：是不是句首、是不是子句邊界、前面累積多少口語字（chars[j] - chars[i] ＝ 第 i 到 j-1 個字的字數）
export function buildStream({ T, W }) {
  const sent = [];
  const clause = [];
  const chars = [0];
  for (let i = 0; i < T.length; i += 1) {
    const prev = W[i - 1] ?? "";
    sent[i] = i === 0 || /[。？！?!]\s*$/.test(prev);
    clause[i] = !sent[i] && (/[、，,]\s*$/.test(prev) || T[i] - T[i - 1] >= PAUSE_MS);
    chars[i + 1] = chars[i] + spoken(W[i]);
  }
  return { T, sent, clause, chars };
}

const lowerBound = (T, x) => {
  let lo = 0;
  let hi = T.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (T[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// 字本身像不像一列的開頭
function prior(S, j, firstSentence) {
  if (S.sent[j]) return j === firstSentence ? PRIOR.firstSentence : PRIOR.laterSentence;
  return S.clause[j] ? PRIOR.clause : PRIOR.other;
}

// 上一列選第 pj 個字、這一列選第 j 個字：上一列的中文字數 zh 跟它涵蓋的日文字數對不對得上
function transition(S, pj, j, zh) {
  const span = S.chars[j] - S.chars[pj];
  const length = span > 0 ? 0.5 * ((zh - RATIO * span) / Math.sqrt(span + SMOOTH)) ** 2 : 3 + 0.2 * zh;
  return length + (j <= pj ? OUT_OF_ORDER : 0);
}

// rows: [{ lo, hi, zh, from? }]，候選字的開口時間落在 [lo, hi) ms，有 from 就從 from 開始看（換人挪一秒的列），
// zh ＝ 這一列的中文口語字數。回傳每列選到的字（index），窗口裡沒有字的列是 null。
export function pickTokens(S, rows) {
  const cand = rows.map(({ lo, hi, from = lo }) => {
    const first = lowerBound(S.T, from);
    return (
      Array.from({ length: lowerBound(S.T, hi) - first }, (_, k) => first + k)
        // 往前多看的那一秒只挑有口語字的：[笑い] 這類標記和標點，逐字稿都寫在上一列
        .filter((j) => S.T[j] >= lo || S.chars[j + 1] > S.chars[j])
    );
  });
  const live = cand.flatMap((c, k) => (c.length ? [k] : []));
  const picks = rows.map(() => null);
  if (!live.length) return picks;
  // 每個有字的列到下一個有字的列之間的中文字數（中間沒有字的列算進去）
  const zh = live.map((k, m) => {
    let sum = 0;
    for (let q = k; q < (live[m + 1] ?? rows.length); q += 1) sum += rows[q].zh;
    return sum;
  });

  // layers[m][a]：第 m 個有字的列選第 a 個候選時，從頭到這裡的最低總分，和它是從上一層哪個候選來的
  const layers = [];
  live.forEach((k, m) => {
    // 「第一個句首字」有兩個：上一列選的字之後的第一個（往前多看一秒的列，它可能在前一秒），和這一列自己那一秒的
    // 第一個。一般的列兩個是同一個字；不是同一個時兩個都 0 分，由長度決定前一秒那句是不是上一列的
    const own = cand[k].find((j) => S.T[j] >= rows[k].lo && S.sent[j]);
    const head = (j, pj) => Math.min(prior(S, j, cand[k].find((i) => i > pj && S.sent[i])), prior(S, j, own));
    const prev = layers[m - 1];
    layers.push(
      cand[k].map((j) => {
        if (!prev) return { j, cost: head(j, -1), from: -1 };
        let best = { cost: Infinity, from: -1 };
        prev.forEach((p, a) => {
          const cost = p.cost + transition(S, p.j, j, zh[m - 1]) + head(j, p.j);
          if (cost < best.cost) best = { cost, from: a };
        });
        return { j, cost: best.cost, from: best.from };
      }),
    );
  });

  const last = layers[layers.length - 1];
  let a = last.reduce((best, c, i) => (c.cost < last[best].cost ? i : best), 0);
  for (let m = live.length - 1; m >= 0; m -= 1) {
    picks[live[m]] = layers[m][a].j;
    a = layers[m][a].from;
  }
  return picks;
}

// md 全文 + 字幕 → { text: 補好小數的全文, stats, whole: 留整秒的列, rows, picks }
// 只在時間碼數字後面插入 ".d"，其餘一個位元組都不動。
export function stamp(md, S) {
  const heading = /^##[ \t]*【完整逐字稿】[ \t]*\r?$/m.exec(md);
  if (!heading) throw new Fail("找不到「## 【完整逐字稿】」段落");
  const from = heading.index + heading[0].length;
  const next = md.slice(from).search(/^## /m);
  const section = md.slice(from, next === -1 ? md.length : from + next);

  const rows = [...section.matchAll(ROW)].map((m) => {
    const seconds = m[2].split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
    const lo = seconds * 1000 + (m[3] === undefined ? 0 : Number(m[3]) * 100);
    return {
      at: from + m.index + m[1].length, // 時間碼數字後面、"]" 或既有小數前面
      tc: m[2],
      seconds,
      speaker: m[4],
      lo,
      hi: lo + (m[3] === undefined ? 1000 : 100), // 已經有小數的列，窗口縮成那 0.1 秒
      fixed: m[3] !== undefined,
      zh: spoken(m[5]),
      text: m[5],
    };
  });
  if (!rows.length) throw new Fail("逐字稿底下沒有可解析的列");
  // 換了說話者、又剛好比上一列晚一秒：可能是同一秒換人挪過來的，開頭也往前一秒找
  rows.forEach((row, k) => {
    const prev = rows[k - 1];
    if (!row.fixed && prev && row.speaker !== prev.speaker && row.seconds === prev.seconds + 1) {
      row.from = prev.lo; // 上一列開口之前的字不可能是這一列的開頭
    }
  });
  const stray = (section.match(/^[ \t]*\[\d/gm) ?? []).length - rows.length;

  let picks = pickTokens(S, rows);
  // 往前找卻只挑到上一列自己的字（這一秒裡沒字可挑）＝沒找到：這些列不往前找，重算
  for (;;) {
    const forced = rows.filter(
      (row, k) => row.from !== undefined && picks[k] !== null && picks[k - 1] !== null && picks[k] <= picks[k - 1],
    );
    if (!forced.length) break;
    for (const row of forced) delete row.from;
    picks = pickTokens(S, rows);
  }
  const stats = { rows: rows.length, had: 0, sentence: 0, clause: 0, other: 0, whole: 0, early: 0, stray };
  const whole = [];
  let text = "";
  let done = 0;
  rows.forEach((row, k) => {
    const j = picks[k];
    if (row.fixed) {
      stats.had += 1;
    } else if (j === null) {
      stats.whole += 1;
      whole.push({ line: md.slice(0, row.at).split("\n").length, tc: row.tc, text: row.text });
    } else {
      // 開頭在前一秒（換人挪過來的）：整秒不能動，定在 .0
      const early = S.T[j] < row.lo;
      text += `${md.slice(done, row.at)}.${early ? 0 : Math.floor((S.T[j] - row.lo) / 100)}`;
      done = row.at;
      stats[S.sent[j] ? "sentence" : S.clause[j] ? "clause" : "other"] += 1;
      if (early) stats.early += 1;
    }
  });
  return { text: text + md.slice(done), stats, whole, rows, picks };
}

const describe = (s) =>
  `句首 ${s.sentence}／子句或停頓 ${s.clause}／其他 ${s.other}，已有小數 ${s.had}，留整秒 ${s.whole}` +
  (s.early ? `；其中 ${s.early} 列開頭在前一秒（換人挪一秒），定在 .0` : "");

function stampEpisode(ep, check) {
  const mdFile = path.join(contentDirectory, "episodes", `${ep}.md`);
  const vttFile = path.join(contentDirectory, `${ep}.ja.vtt`);
  const vttName = `content/${ep}.ja.vtt`;
  if (!fs.existsSync(mdFile)) throw new Fail(`找不到 content/episodes/${ep}.md`);
  if (!fs.existsSync(vttFile)) throw new Fail(`找不到 ${vttName}（日文自動字幕）`);
  const tokens = parseVtt(fs.readFileSync(vttFile, "utf8"));
  if (!tokens.T.length) {
    throw new Fail(`${vttName} 裡沒有逐字時間（<時間><c>字</c>），不是 YouTube 的自動字幕格式？這集維持整秒`);
  }
  const back = tokens.T.findIndex((t, i) => i > 0 && t < tokens.T[i - 1]);
  if (back !== -1) throw new Fail(`${vttName} 的字幕時間倒退（第 ${back + 1} 個字），沒辦法對時間`);

  const md = fs.readFileSync(mdFile, "utf8");
  const { text, stats, whole } = stamp(md, buildStream(tokens));
  if (!check && text !== md) fs.writeFileSync(mdFile, text);

  const added = stats.sentence + stats.clause + stats.other;
  console.log(
    `${ep}  ${stats.rows} 列：${check ? "會補上" : "補上"} ${added}（${describe(stats)}）` +
      (check ? "　--check，沒寫檔" : ""),
  );
  for (const row of whole.slice(0, 3)) {
    console.log(`    留整秒（窗口內沒有字）：第 ${row.line} 行 [${row.tc}] ${row.text.slice(0, 20)}`);
  }
  if (stats.stray) {
    console.log(`    注意：有 ${stats.stray} 行長得像時間碼但不是可解析的列，沒動（validate-content 會報）`);
  }
  return stats;
}

const usage = "用法：node scripts/stamp-times.mjs <epNN ...|--all> [--check]（--self-test 跑內建檢查）";

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const names = argv.filter((arg) => !arg.startsWith("--"));
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const all = flags.includes("--all");
  const unknownFlag = flags.some((flag) => flag !== "--all" && flag !== "--check");
  if (unknownFlag || (all ? names.length > 0 : names.length === 0)) {
    console.error(usage);
    return 2;
  }
  const badName = names.find((name) => !/^ep\d{2}$/.test(name));
  if (badName) {
    console.error(`集數要寫成 epNN（例如 ep13），收到「${badName}」\n${usage}`);
    return 2;
  }
  const episodes = all
    ? fs
        .readdirSync(path.join(contentDirectory, "episodes"))
        .filter((file) => /^ep\d{2}\.md$/.test(file))
        .map((file) => file.slice(0, -3))
        .sort()
    : names;

  const total = { rows: 0, had: 0, sentence: 0, clause: 0, other: 0, whole: 0, early: 0 };
  let failed = 0;
  for (const ep of episodes) {
    try {
      const stats = stampEpisode(ep, flags.includes("--check"));
      for (const key of Object.keys(total)) total[key] += stats[key];
    } catch (error) {
      if (!(error instanceof Fail)) throw error;
      console.error(`${ep}  錯誤：${error.message}`);
      failed += 1;
    }
  }
  if (episodes.length > 1) console.log(`合計  ${total.rows} 列：${describe(total)}`);
  return failed ? 1 : 0;
}

// 小檢查：句首優先、長度把選擇拉到對的字、片語用 cue 開始時間、過場 cue 不算、換人挪一秒的列往前找（同一人不找，
// 前一秒的句子是上一列的就不拿）、小時格式、沒字的列留整秒、已有小數不動、CRLF 與段落標題原樣、重跑不變
function selfTest() {
  const vtt = [
    "WEBVTT",
    "",
    "00:00:01.000 --> 00:00:03.000",
    "こんにちは<00:00:01.500><c>。</c><00:00:01.900><c>今日</c><00:00:02.300><c>は</c>",
    "",
    "00:01:00.000 --> 00:01:02.000",
    "前の行",
    "あのね<00:01:00.250><c>、</c><00:01:00.700><c>それ</c>",
    "",
    "00:02:00.400 --> 00:02:03.000",
    " ",
    "片語です。",
    "",
    "00:02:03.000 --> 00:02:03.010",
    "片語です。",
    " ",
    "",
    "00:02:03.010 --> 00:02:05.000",
    "片語です。",
    "次の片語。",
    "",
    "00:03:00.000 --> 00:03:04.000",
    "そうだね<00:03:00.600><c>。</c><00:03:00.800><c>うん</c><00:03:01.300><c>、</c><00:03:01.500><c>本当</c>" +
      "<00:03:02.100><c>。</c><00:03:02.300><c>でも</c><00:03:02.600><c>ね</c><00:03:02.800><c>。</c>",
    "",
    "00:04:00.000 --> 00:04:03.000",
    "そうなんだ<00:04:00.500><c>。</c><00:04:00.600><c>知らなかった</c><00:04:01.000><c>。</c><00:04:01.200><c>でしょ</c>",
    "",
    "01:00:00.200 --> 01:00:02.000",
    "ねえ<01:00:00.250><c>。</c>",
  ].join("\n");
  const md = [
    "## 【精簡總結】",
    "### [00:01] 標題",
    "## 【完整逐字稿】",
    "",
    "[00:01] [福嶋晴菜] 你好",
    "[00:02] [福嶋晴菜] 今天",
    "[00:30] [福嶋晴菜] 沒有字的整秒",
    "[01:00] [福嶋晴菜] 欸那個",
    "[02:00] [福嶋晴菜] 片語",
    "[02:03] [福嶋晴菜] 下一個片語",
    "[03:00] [福嶋晴菜] 對啊。",
    "[03:01] [來賓] 嗯，真的。", // 換人挪一秒：開頭うん在 03:00.8
    "[03:02] [福嶋晴菜] 不過啊", // 也是換人晚一秒，但開頭でも就在自己這一秒
    "[04:00] [福嶋晴菜] 這樣啊，不知道。",
    "[04:01] [來賓] 對吧，嗯。", // 前一秒的句首字知らなかった是上一列的，長度把它留給上一列
    "[01:00:00] [福嶋晴菜] 欸",
    "[01:00:01.5] [福嶋晴菜] 已經有小數",
    "",
  ].join("\r\n");

  const S = buildStream(parseVtt(vtt));
  const { text, stats } = stamp(md, S);
  assert.equal(
    text,
    md
      .replace("[00:01] [福", "[00:01.0] [福")
      .replace("[00:02]", "[00:02.3]")
      .replace("[01:00] [福", "[01:00.7] [福")
      .replace("[02:00]", "[02:00.4]")
      .replace("[02:03]", "[02:03.0]")
      .replace("[03:00]", "[03:00.0]")
      .replace("[03:01]", "[03:01.0]")
      .replace("[03:02]", "[03:02.3]")
      .replace("[04:00]", "[04:00.0]")
      .replace("[04:01]", "[04:01.2]")
      .replace("[01:00:00]", "[01:00:00.2]"),
  );
  assert.equal(text.replace(/(\[\d{2}:\d{2}(?::\d{2})?)\.\d\]/g, "$1]"), md.replace("[01:00:01.5]", "[01:00:01]"));
  assert.deepEqual(
    [stats.sentence, stats.clause, stats.other, stats.had, stats.whole, stats.early],
    [7, 4, 0, 1, 1, 1],
  );
  assert.equal(stamp(text, S).text, text);
  console.log("自我檢查通過");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const episodesDirectory = path.join(projectRoot, "content", "episodes");
const glossaryPath = path.join(projectRoot, "content", "glossary.json");
const strict = process.argv.includes("--strict");
const errors = [];
const warnings = [];
// 段落標籤只用 docs/episode-workflow.md 標籤表裡的詞，同義詞不另開
const sectionTags = new Set([
  "開場", "結尾", "來信", "單元", "告知",
  "節目", "近況", "美食", "作品", "活動", "回憶", "人際", "遊戲", "解謎", "方言", "雜談",
]);
// 比對引文時不看空白和 [笑聲] 這類聲音標記
const normalizeQuote = (text) => text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");
// 精華片段的第一列用這些字起頭，多半是在接上一句（「對」什麼？「而且」什麼？），開場要往前找
const leansBack = (text) =>
  /^(?:[啊欸嗯哎呀喔]+[，、！]?)?(對|是的|是啊|原來|而且|所以|還有|不過|但是|可是|就是|然後|那種|確實|也是)/.test(
    text.replace(/\[[^\]]*\]/g, "").trim(),
  );
// 字數不算空白
const textLength = (text) => text.replace(/\s/g, "").length;
// 字幕的 [笑い]、[泣き声]…轉成這些；[音楽] 是自動字幕的背景音樂偵測，不寫
const soundMarkers = new Set([
  "[笑聲]", "[哭聲]", "[吸氣]", "[清喉嚨]", "[鼻息]", "[尖叫]", "[嘆氣]", "[歡呼]", "[拍手]",
]);
// 敬稱照原文留さん、ちゃん，集數寫「第 N 回」，不加羅馬拼音註解（醬油、醬汁除外）
const avoidedWords = /小姐|先生|桑|醬(?![油汁])|第\s*\S{1,3}\s*集|栞名|（[^）]*[A-Za-z][^）]*）/;

function report(collection, file, message) {
  collection.push(`${file}: ${message}`);
}

function timestampToSeconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];

  if (minutes >= 60 && parts.length === 3) return null;
  if (seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function validateEpisode(fileName) {
  const relativePath = path.join("content", "episodes", fileName);
  const fullPath = path.join(episodesDirectory, fileName);
  const parsed = matter(fs.readFileSync(fullPath, "utf8"));
  const id = fileName.replace(/\.md$/, "");
  const expectedEpisode = Number(id.replace(/^ep/, ""));

  if (!parsed.data.title || typeof parsed.data.title !== "string") {
    report(errors, relativePath, "front matter 缺少 title");
  } else if (/[！!]/.test(parsed.data.title)) {
    report(warnings, relativePath, "標題不用驚嘆號");
  }

  const date =
    parsed.data.date instanceof Date
      ? parsed.data.date.toISOString().slice(0, 10)
      : parsed.data.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    report(errors, relativePath, "front matter 的 date 必須是 YYYY-MM-DD");
  }

  if (!Number.isInteger(parsed.data.episode) || parsed.data.episode !== expectedEpisode) {
    report(errors, relativePath, `episode 應為 ${expectedEpisode}`);
  }

  for (const section of ["精簡總結", "無損還原", "精華片段", "完整逐字稿"]) {
    if (!new RegExp(`^##\\s*【${section}】\\s*$`, "m").test(parsed.content)) {
      report(errors, relativePath, `缺少 ## 【${section}】`);
    }
  }

  const lines = parsed.content.split(/\r?\n/);
  const findHeading = (section) =>
    lines.findIndex((line) => new RegExp(`^##\\s*【${section}】\\s*$`).test(line));
  const summaryHeading = findHeading("精簡總結");
  const losslessHeading = findHeading("無損還原");
  const transcriptHeading = findHeading("完整逐字稿");
  const clipsHeading = findHeading("精華片段");
  if (transcriptHeading === -1) return 0;
  if (clipsHeading !== -1 && (clipsHeading < losslessHeading || clipsHeading > transcriptHeading)) {
    report(errors, relativePath, "## 【精華片段】要放在 ## 【無損還原】和 ## 【完整逐字稿】之間");
  }
  const losslessEnd = clipsHeading > losslessHeading && clipsHeading < transcriptHeading ? clipsHeading : transcriptHeading;

  if (summaryHeading !== -1 && losslessHeading > summaryHeading) {
    const points = lines
      .slice(summaryHeading + 1, losslessHeading)
      .map((line) => line.trim())
      .filter((line) => /^[*-]\s/.test(line));
    if (points.length < 4 || points.length > 5) {
      report(errors, relativePath, `精簡總結有 ${points.length} 點，應為 4～5 點`);
    }
    // 圖卡直接印原文，太長會溢出
    for (const point of points) {
      const length = textLength(point.slice(2));
      if (length < 40 || length > 100) {
        report(errors, relativePath, `精簡總結「${point.slice(2, 16)}…」有 ${length} 字，應為 40～100 字`);
      }
    }
  }

  // 段落標題寫成 ### [mm:ss] [標籤] 標題，時間碼是這一段在逐字稿裡開始的那一列（切段規則見 docs/episode-workflow.md）
  const sectionStarts = [];
  const sections = [];
  for (let index = losslessHeading + 1; losslessHeading !== -1 && index < losslessEnd; index += 1) {
    const line = lines[index].trim();
    const section = sections.at(-1);
    if (section && /^[*-]\s/.test(line)) {
      section.bullets += 1;
      const label = /^[*-]\s+\*\*(.+?)\*\*：/.exec(line)?.[1];
      if (!label) {
        report(errors, relativePath, `段落「${section.heading}」的條列要寫成 * **小標**：內容`);
      } else if (textLength(label) < 2 || textLength(label) > 8) {
        report(errors, relativePath, `小標「${label}」有 ${textLength(label)} 字，應為 2～8 字`);
      }
    }
    if (line.startsWith(">")) {
      report(errors, relativePath, `段落「${section?.heading ?? ""}」不放 > 引言（精華句寫在 【精華片段】）`);
    }
    if (!/^###\s/.test(line)) continue;
    const heading = line.replace(/^###\s*/, "").trim();
    sections.push({ heading, bullets: 0 });
    const match = /^\[(\d{2}:\d{2})\]\s*\[([^\]]+)\]\s*\S/.exec(heading);
    const seconds = match && timestampToSeconds(match[1]);
    if (!match || seconds === null) {
      report(errors, relativePath, `段落「${heading}」要寫成 ### [mm:ss] [標籤] 標題`);
      continue;
    }
    if (!sectionTags.has(match[2])) {
      report(errors, relativePath, `段落「${heading}」的標籤 [${match[2]}] 不在標籤表裡`);
    }
    if (sectionStarts.length && seconds <= sectionStarts.at(-1).seconds) {
      report(errors, relativePath, `段落「${heading}」的時間碼沒有比上一段晚`);
    } else {
      sectionStarts.push({ heading, seconds, tag: match[2] });
    }
  }
  for (const { heading, bullets } of sections) {
    if (bullets < 3 || bullets > 5) {
      report(errors, relativePath, `段落「${heading}」有 ${bullets} 點條列，應為 3～5 點`);
    }
  }

  // 精華片段寫成 ### [mm:ss–mm:ss] 標題，下一行 > 精華句，再寫 - 起／- 鋪／- 收 [mm:ss] 各一行（規則見 docs/episode-workflow.md）
  const clips = [];
  for (let index = clipsHeading + 1; clipsHeading !== -1 && index < transcriptHeading; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const clip = clips.at(-1);
    if (line.startsWith(">") && clip && !clip.quote) {
      clip.quote = line.replace(/^>\s*/, "");
      continue;
    }
    const beat = /^-\s*(起|鋪|收)\s*\[(\d{2}:\d{2})\]\s*\S/.exec(line);
    if (beat && clip) {
      clip.beats.push({ kind: beat[1], time: beat[2], seconds: timestampToSeconds(beat[2]) });
      continue;
    }
    const match = /^###\s*\[(\d{2}:\d{2})–(\d{2}:\d{2})\]\s*(\S.*)$/.exec(line);
    if (!match) {
      report(errors, relativePath, `精華片段「${line}」要寫成 ### [mm:ss–mm:ss] 標題，下一行 > 精華句，再來 - 起／- 鋪／- 收 [mm:ss] 各一行`);
      continue;
    }
    clips.push({ heading: line.replace(/^###\s*/, ""), start: timestampToSeconds(match[1]), end: timestampToSeconds(match[2]), quote: "", beats: [] });
  }
  if (clipsHeading !== -1 && (clips.length < 3 || clips.length > 5)) {
    report(errors, relativePath, `精華片段有 ${clips.length} 段，應為 3～5 段`);
  }

  // 「」裡和 > 引言的字要能在逐字稿某一列裡原文找到
  const quotes = new Set();
  for (let index = Math.max(summaryHeading, 0); index < transcriptHeading; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith(">")) {
      quotes.add(line.replace(/^>\s*/, "").replace(/^「([^「」]*)」$/, "$1"));
    }
    for (const [, quote] of line.matchAll(/「((?:[^「」]|「[^「」]*」)*)」/g)) {
      quotes.add(quote);
    }
  }

  // [mm:ss.d]：0.1 秒的小數給字幕疊層用；這裡的檢查與段落、精華的對照都看整秒
  const transcriptPattern =
    /^\[(\d{2}:\d{2}(?::\d{2})?)(?:\.\d)?\]\s*\[([^\]]+)\]\s*(.*)$/;
  const speakerlessPattern = /^\[(\d{2}:\d{2}(?::\d{2})?)(?:\.\d)?\]\s*(.+)$/;
  const guest = typeof parsed.data.guest === "string" ? parsed.data.guest.trim() : "";
  const speakers = new Set([
    "福嶋晴菜",
    "工作人員",
    ...(guest ? [guest, `福嶋晴菜＆${guest}`] : []),
  ]);
  const seen = new Set();
  const lineSeconds = new Set();
  const rowTexts = [];
  const rows = [];
  const unknownSpeakers = new Set();
  const unknownMarkers = new Set();
  const longLines = [];
  const avoidedWordLines = [];
  let previousSeconds = -1;
  let parsedLines = 0;
  let speakerlessLines = 0;
  let emptyTextLines = 0;
  let duplicateLines = 0;
  let backwardsTimestamps = 0;
  let sameTimestamps = 0;
  let hasHost = false;

  for (let index = transcriptHeading + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const match = line.match(transcriptPattern);
    const speakerlessMatch = line.match(speakerlessPattern);
    if (!match && !speakerlessMatch) {
      report(errors, relativePath, `第 ${index + 1} 行不是可解析的逐字稿列`);
      continue;
    }

    const timestamp = (match || speakerlessMatch)[1];
    const seconds = timestampToSeconds(timestamp);
    if (seconds === null) {
      report(errors, relativePath, `第 ${index + 1} 行的時間碼無效：${timestamp}`);
    } else {
      if (seconds < previousSeconds) backwardsTimestamps += 1;
      // 畫面只顯示整秒，段落、精華也用整秒對到列：同一秒的兩列分不出來
      if (seconds === previousSeconds) sameTimestamps += 1;
      previousSeconds = seconds;
      lineSeconds.add(seconds);
    }

    if (!match) {
      speakerlessLines += 1;
      continue;
    }

    parsedLines += 1;
    const [, , speaker, text] = match;
    const spoken = text.replace(/\[[^\]]*\]/g, "").trim();
    if (!spoken) {
      emptyTextLines += 1;
    }
    if (speaker === "福嶋晴菜") hasHost = true;
    if (!speakers.has(speaker)) unknownSpeakers.add(speaker);
    rowTexts.push(normalizeQuote(text));
    if (seconds !== null) rows.push({ seconds, text });
    for (const marker of text.match(/\[[^\]]*\]/g) || []) {
      if (!soundMarkers.has(marker)) unknownMarkers.add(marker);
    }
    if (spoken.length > 60) longLines.push(timestamp);
    if (avoidedWords.test(spoken)) avoidedWordLines.push(timestamp);

    if (seen.has(line)) duplicateLines += 1;
    seen.add(line);
  }

  if (parsedLines === 0) {
    report(errors, relativePath, "完整逐字稿沒有任何可解析字幕");
  }
  if (!hasHost) {
    report(warnings, relativePath, "逐字稿找不到精確的主持人標籤 [福嶋晴菜]");
  }
  if (speakerlessLines) {
    report(
      warnings,
      relativePath,
      `${speakerlessLines} 列沒有 speaker，目前網站不會顯示這些列`,
    );
  }
  if (emptyTextLines) {
    report(
      warnings,
      relativePath,
      `${emptyTextLines} 列只有 speaker／音效標籤，沒有額外文字`,
    );
  }
  if (duplicateLines) {
    report(warnings, relativePath, `${duplicateLines} 列逐字稿完全重複`);
  }
  if (backwardsTimestamps) {
    report(warnings, relativePath, `${backwardsTimestamps} 次時間倒退`);
  }
  if (sameTimestamps) {
    report(warnings, relativePath, `${sameTimestamps} 列跟上一列同一個時間碼`);
  }
  if (unknownMarkers.size) {
    report(warnings, relativePath, `聲音標記不在清單內：${[...unknownMarkers].join("、")}`);
  }
  if (longLines.length) {
    report(warnings, relativePath, `${longLines.length} 列超過 60 字：${longLines.join("、")}`);
  }
  if (avoidedWordLines.length) {
    report(
      warnings,
      relativePath,
      `${avoidedWordLines.length} 列用到小姐、先生、桑、醬、第 N 集、栞名或括號裡的羅馬字：${avoidedWordLines.join("、")}`,
    );
  }
  if (unknownSpeakers.size) {
    report(
      errors,
      relativePath,
      `說話者不在名單內（福嶋晴菜、來賓全名、福嶋晴菜＆來賓全名、工作人員）：${[...unknownSpeakers].join("、")}`,
    );
  }

  sectionStarts.forEach(({ heading, seconds, tag }, index) => {
    if (!lineSeconds.has(seconds)) {
      report(errors, relativePath, `段落「${heading}」的時間碼對不到逐字稿任何一列`);
    }
    // 開場、結尾不受 60 秒限制；最後一段量不到結束時間
    const next = sectionStarts[index + 1];
    if (next && next.seconds - seconds < 60 && tag !== "開場" && tag !== "結尾") {
      report(warnings, relativePath, `段落「${heading}」只有 ${next.seconds - seconds} 秒`);
    }
  });

  clips.forEach(({ heading, start, end, quote, beats }, index) => {
    if (start === null || end === null || !lineSeconds.has(start) || !lineSeconds.has(end)) {
      report(errors, relativePath, `精華片段「${heading}」的起訖要是逐字稿列的時間碼（迄＝下一列開始的時間）`);
      return;
    }
    const previous = clips[index - 1];
    if (previous && previous.end !== null && start < previous.end) {
      report(errors, relativePath, `精華片段「${heading}」跟上一段重疊或順序不對`);
    }
    const range = rows.filter((row) => row.seconds >= start && row.seconds < end);
    if (!range.length) return;
    const quoteRow = quote && range.find((row) => normalizeQuote(row.text).includes(normalizeQuote(quote)));
    if (!quote) {
      report(errors, relativePath, `精華片段「${heading}」下一行要寫 > 精華句`);
    } else if (!quoteRow) {
      report(errors, relativePath, `精華片段「${heading}」的精華句不在這段時間的逐字稿裡`);
    }
    // 起鋪落收：落＝精華句那一列，不另外寫。起＝片段開頭，各拍時間嚴格遞增、都在片段內、都對得到逐字稿的列。
    // 落就是最後一列時沒東西可收、落就是第 2 列時沒東西可鋪，只有這兩種可以少寫一行
    const order = beats.map((beat) => beat.kind).join("");
    const quoteIndex = quoteRow ? range.indexOf(quoteRow) : -1;
    const allowed = ["起鋪收", ...(quoteIndex === range.length - 1 ? ["起鋪"] : []), ...(quoteIndex === 1 ? ["起收"] : [])];
    if (!allowed.includes(order)) {
      report(
        errors,
        relativePath,
        `精華片段「${heading}」要依序寫 - 起、- 鋪、- 收各一行，只有落是最後一列可省收、落是第 2 列可省鋪（現在是 ${order || "都沒寫"}）`,
      );
    } else if (quoteRow) {
      if (beats[0].seconds !== start) {
        report(errors, relativePath, `精華片段「${heading}」的起 [${beats[0].time}] 要等於片段開頭`);
      }
      const close = beats.find((beat) => beat.kind === "收");
      const times = [...beats.filter((beat) => beat !== close).map((beat) => beat.seconds), quoteRow.seconds, ...(close ? [close.seconds] : []), end];
      if (times.some((time, index) => index && time <= times[index - 1])) {
        report(errors, relativePath, `精華片段「${heading}」的時間要 起 < 鋪 < 落（精華句那列）< 收 < 迄`);
      }
    }
    for (const beat of beats) {
      if (!lineSeconds.has(beat.seconds)) {
        report(errors, relativePath, `精華片段「${heading}」的${beat.kind} [${beat.time}] 對不到逐字稿任何一列`);
      }
    }
    if (leansBack(range[0].text)) {
      report(errors, relativePath, `精華片段「${heading}」第一列在接上一句，開場往前找：${range[0].text}`);
    }
    if (!/[。！]$/.test(range.at(-1).text.replace(/\[[^\]]*\]/g, "").trim())) {
      report(errors, relativePath, `精華片段「${heading}」最後一列沒收在句號或驚嘆號：${range.at(-1).text}`);
    }
  });

  for (const quote of quotes) {
    const needle = normalizeQuote(quote);
    if (needle && !rowTexts.some((text) => text.includes(needle))) {
      report(errors, relativePath, `「${quote}」在逐字稿裡找不到原文`);
    }
  }

  return parsedLines;
}

function validateGlossary() {
  let glossary;
  try {
    glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8"));
  } catch (error) {
    report(errors, "content/glossary.json", `JSON 無法解析：${error.message}`);
    return;
  }

  if (!glossary.global || typeof glossary.global !== "object") {
    report(errors, "content/glossary.json", "缺少 global 規則物件");
    return;
  }
  if (!glossary.episodes || typeof glossary.episodes !== "object") {
    report(errors, "content/glossary.json", "缺少 episodes 規則物件");
    return;
  }

  let noOpRules = 0;
  const groups = [
    ["global", glossary.global],
    ...Object.entries(glossary.episodes).map(([episode, rules]) => [
      `episodes.${episode}`,
      rules,
    ]),
  ];

  for (const [groupName, rules] of groups) {
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      report(errors, "content/glossary.json", `${groupName} 必須是物件`);
      continue;
    }
    for (const [source, replacement] of Object.entries(rules)) {
      if (!source) {
        report(errors, "content/glossary.json", `${groupName} 含空白來源詞`);
      }
      if (typeof replacement !== "string" || !replacement) {
        report(
          errors,
          "content/glossary.json",
          `${groupName}.${source} 的替換值必須是非空字串`,
        );
      }
      if (source === replacement) noOpRules += 1;
    }
  }

  if (noOpRules) {
    report(
      warnings,
      "content/glossary.json",
      `${noOpRules} 條規則不會改變文字，dry-run 會略過`,
    );
  }
}

let episodeFiles = [];
if (!fs.existsSync(episodesDirectory)) {
  report(errors, "content/episodes", "資料夾不存在");
} else {
  episodeFiles = fs
    .readdirSync(episodesDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();
}

if (!episodeFiles.length) {
  report(errors, "content/episodes", "找不到 Markdown 集數");
}

let transcriptLines = 0;
for (const fileName of episodeFiles) {
  try {
    transcriptLines += validateEpisode(fileName);
  } catch (error) {
    report(errors, path.join("content", "episodes", fileName), error.message);
  }
}
validateGlossary();

for (const warning of warnings) console.warn(`WARN  ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);

const failed = errors.length > 0 || (strict && warnings.length > 0);
const result = failed ? "failed" : "passed";
console.log(
  `Content validation ${result}: ${episodeFiles.length} episodes, ${transcriptLines} transcript lines, ${errors.length} errors, ${warnings.length} warnings.`,
);
if (strict && warnings.length) {
  console.error("Strict mode treats warnings as errors.");
}
process.exitCode = failed ? 1 : 0;

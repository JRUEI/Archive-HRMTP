// 影片上字幕的純函式檢查：node scripts/check-subtitle.mjs
// 引號補成對、字幕停留時間與查找、localStorage 存檔的讀回、字幕字色對比。壞掉就丟錯、結束碼非 0。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SUBTITLE_STATE,
  balanceQuotes,
  buildSubtitleRows,
  parseSubtitleState,
  rowAt,
} from '../src/lib/subtitle.ts';

// ── 引號補成對 ──
assert.deepEqual(balanceQuotes(['他說「好」然後走了']), ['他說「好」然後走了'], '一列內成對的不動');
assert.deepEqual(balanceQuotes(['他說「好」', '走了']), ['他說「好」', '走了'], '收掉的引號不會漏到下一列');
assert.deepEqual(
  balanceQuotes(['他說「我想想', '還是不要', '好啦」就這樣']),
  ['他說「我想想」', '「還是不要」', '「好啦」就這樣'],
  '跨三列：第一列補」、中間補「…」、最後一列補「，」後面的字照留',
);
assert.deepEqual(
  balanceQuotes(['他說「我想想', '還是不要', '好啦」就這樣'], ['A', 'A', 'A']),
  ['他說「我想想」', '「還是不要」', '「好啦」就這樣'],
  '同一人連說三列，跟沒給說話者一樣',
);
assert.deepEqual(
  balanceQuotes(['「我想想', '好啊', '結論'], ['A', 'B', 'A']),
  ['「我想想」', '好啊', '結論'],
  '換人說話就從引號外重算，別人的話不會被包進去',
);
assert.deepEqual(
  balanceQuotes(['「好', '啦」然後「再來']),
  ['「好」', '「啦」然後「再來」'],
  '同一列先收再開',
);
assert.deepEqual(
  balanceQuotes(['他說「好', '然後']),
  ['他說「好」', '「然後」'],
  '到最後都沒收的引號，每一列都補成對',
);
assert.deepEqual(balanceQuotes([]), []);

// ── 停留時間與查找（整秒、0.1 秒小數都要能用）──
const rows = buildSubtitleRows([
  { seconds: 10, text: '短', speaker: 'A' }, // 1 字：1.48 秒，補到下限 2 秒
  { seconds: 20.4, text: '一二三四五六七八九十'.repeat(4), speaker: 'A' }, // 40 字：補到上限 6 秒
  { seconds: 30, text: '「半句', speaker: 'A' }, // 被下一列截斷
  { seconds: 30.5, text: '後半」 ', speaker: 'A' }, // 最後一列沒有下一列，空白不算字數
]);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
close(rows[0].end, 12);
close(rows[1].end, 26.4);
close(rows[2].end, 30.5);
close(rows[3].end, 30.5 + 2.04);
assert.deepEqual(
  rows.map(r => r.text),
  ['短', rows[1].text, '「半句」', '「後半」 '],
  '顯示字串補成對，結束時間用原字數算',
);
assert.deepEqual(rows.map(r => r.speaker), ['A', 'A', 'A', 'A'], '說話者跟著列走');
const at = (t, want, msg) => assert.equal(rowAt(rows, t), want, `${msg}（t=${t}）`);
at(9.99, -1, '第一列開始前');
at(10, 0, '剛好開始');
at(11.99, 0, '停留中');
at(12, -1, '結束時間不含');
at(15, -1, '兩列之間的空檔');
at(20.4, 1, '小數起點');
at(26.39, 1, '上限之內');
at(26.4, -1, '超過上限就空白');
at(30.49, 2, '被截斷的前一列');
at(30.5, 3, '下一列接手');
at(99, -1, '最後一列之後');
assert.equal(rowAt([], 5), -1, '沒有字幕');

// ── 存檔讀回 ──
assert.deepEqual(parseSubtitleState(null), DEFAULT_SUBTITLE_STATE, '沒存過');
assert.deepEqual(parseSubtitleState('{不是 json'), DEFAULT_SUBTITLE_STATE, '壞掉的 JSON');
assert.deepEqual(parseSubtitleState('{"v":2,"on":true}'), DEFAULT_SUBTITLE_STATE, '版本不對');
assert.deepEqual(parseSubtitleState('[1,2]'), DEFAULT_SUBTITLE_STATE, '不是物件');

const messy = parseSubtitleState(
  JSON.stringify({
    v: 1,
    on: 'yes',
    cur: { sb: 999, sf: -3, sw: '700', c: 'zzz', ss: 0.5 },
    byVoice: 'no',
    nameTag: 0,
    slots: [{ c: '#00ff00', sb: 20 }, 'x', null, { c: '#fff' }],
    def: 1,
    offset: 5000,
    summary: 1,
  }),
);
assert.deepEqual(messy, {
  v: 1,
  on: false,
  cur: { sb: 45, sf: 2.5, sw: 700 },
  byVoice: true,
  nameTag: true,
  slots: [{ sb: 20, sf: 4.4, sw: 700 }, null, null],
  names: ['', '', ''],
  def: null,
  offset: 800,
}, '亂填的欄位夾回範圍、多的欄位丟掉、指到空格的預設清掉');
assert.deepEqual(Object.keys(messy.slots[0]).sort(), ['sb', 'sf', 'sw'], '快捷只存樣式三欄');

const good = {
  v: 1,
  on: true,
  cur: { sb: 8, sf: 5.2, sw: 800 },
  byVoice: false,
  nameTag: false,
  slots: [{ sb: 20, sf: 3, sw: 400 }, null, null],
  names: ['夜間', '', ''],
  def: 0,
  offset: -200,
};
assert.deepEqual(parseSubtitleState(JSON.stringify(good)), good, '正常的存檔原樣讀回');

// ── 字幕字色：75% 黑底壓在全白畫面上 ≈ #404040，要 4.5:1 ──
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const colors = [...css.matchAll(/--color-subtitle-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]);
assert.ok(colors.length >= 2, 'globals.css 裡找不到 --color-subtitle-*');
const brightest = luminance('#404040');
for (const [name, hex] of [['white', '#ffffff'], ...colors]) {
  const L = luminance(hex);
  const worst = ratio(L, brightest);
  console.log(`${name.padEnd(6)} ${hex}  亮度 ${L.toFixed(3)}  全白畫面 ${worst.toFixed(2)}:1  全黑畫面 ${ratio(L, 0).toFixed(2)}:1`);
  assert.ok(worst >= 4.5, `${name} ${hex} 壓在全白畫面上只有 ${worst.toFixed(2)}:1`);
}

console.log('check-subtitle: ok');

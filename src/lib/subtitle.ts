/**
 * 逐字稿模式「影片上的字幕」用到的純函式與設定資料。
 * 不 import 任何東西：scripts/check-subtitle.mjs 直接用 Node 載入這支檔案跑檢查。
 */

export interface SubtitleStyle {
  /** 距離影片底邊的百分比 */
  sb: number;
  /** 字號，單位是影片寬度的 1% */
  sf: number;
  /** font-weight */
  sw: number;
}

export interface SubtitleState {
  v: 1;
  on: boolean;
  cur: SubtitleStyle;
  /** 依說話者上色。不是樣式的一部分，不存進快捷 */
  byVoice: boolean;
  /** 字幕上方常駐的人名標，換人才換字。不是樣式的一部分，不存進快捷 */
  nameTag: boolean;
  /** 整組樣式快捷，三格，空的是 null */
  slots: (SubtitleStyle | null)[];
  /** 每格快捷的自訂名稱，空字串＝用預設的「快捷 N」 */
  names: string[];
  /** 當作「預設」的快捷格序號（「還原」會回到它），null＝用內建樣式 */
  def: number | null;
  /** 字幕時間補償（毫秒），正值＝字幕提早出現 */
  offset: number;
}

export const SUBTITLE_STORAGE_KEY = 'harumatope_transcript_subtitle_v1';
export const SUBTITLE_SLOT_COUNT = 3;
export const SUBTITLE_NAME_MAX = 12;
export const SUBTITLE_DEFAULT_STYLE: SubtitleStyle = { sb: 13, sf: 4.4, sw: 700 };

/** [最小, 最大, 間距]：滑桿與讀回存檔時的夾限共用同一份 */
export const SUBTITLE_RANGE = {
  sb: [3, 45, 0.5],
  sf: [2.5, 8, 0.1],
  sw: [400, 900, 100],
  offset: [-500, 800, 10],
} as const;

export const DEFAULT_SUBTITLE_STATE: SubtitleState = {
  v: 1,
  on: false,
  cur: SUBTITLE_DEFAULT_STYLE,
  byVoice: true,
  nameTag: true,
  slots: [null, null, null],
  names: ['', '', ''],
  def: null,
  offset: 0,
};

function clamp(value: unknown, [min, max]: readonly [number, number, number], fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 只留 sb、sf、sw 三個欄位，其他亂塞的欄位丟掉 */
function sanitizeStyle(raw: unknown): SubtitleStyle {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = SUBTITLE_DEFAULT_STYLE;
  return {
    sb: clamp(o.sb, SUBTITLE_RANGE.sb, d.sb),
    sf: clamp(o.sf, SUBTITLE_RANGE.sf, d.sf),
    sw: clamp(o.sw, SUBTITLE_RANGE.sw, d.sw),
  };
}

/** 讀 localStorage 存的字串：壞掉、版本不對、欄位亂填都不會丟錯，該回預設的回預設、超出範圍的夾回範圍 */
export function parseSubtitleState(raw: string | null): SubtitleState {
  let o: Record<string, unknown> | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && parsed.v === 1) o = parsed;
  } catch {
    // 存檔壞掉就當作沒有存過
  }
  if (!o) return DEFAULT_SUBTITLE_STATE;

  const slots = Array.isArray(o.slots) ? o.slots : [];
  const names = Array.isArray(o.names) ? o.names : [];

  const slotList = Array.from({ length: SUBTITLE_SLOT_COUNT }, (_, i) =>
    slots[i] && typeof slots[i] === 'object' ? sanitizeStyle(slots[i]) : null,
  );
  const def = typeof o.def === 'number' && slotList[o.def] ? o.def : null;

  return {
    v: 1,
    on: o.on === true,
    cur: sanitizeStyle(o.cur),
    byVoice: typeof o.byVoice === 'boolean' ? o.byVoice : true,
    nameTag: typeof o.nameTag === 'boolean' ? o.nameTag : true,
    slots: slotList,
    names: Array.from({ length: SUBTITLE_SLOT_COUNT }, (_, i) =>
      typeof names[i] === 'string' ? names[i].trim().slice(0, SUBTITLE_NAME_MAX) : '',
    ),
    def,
    offset: clamp(o.offset, SUBTITLE_RANGE.offset, 0),
  };
}

/**
 * 逐字稿一列一列切，「」常常跨列：開頭在引號裡就補「，結尾還在引號裡就補」。
 * 換人說話就從引號外重算，別人的話不會被包進上一個人沒收的引號。
 * 只改顯示用的字串，不動原始資料。
 * ponytail: 只算一層。原檔裡漏掉的」會一路補到換人為止，要擋就在 validate-content 查。
 */
export function balanceQuotes(texts: readonly string[], speakers: readonly string[] = []): string[] {
  let inside = false;
  return texts.map((text, i) => {
    if (i > 0 && speakers[i] !== speakers[i - 1]) inside = false;
    const startsInside = inside;
    for (const ch of text) {
      if (ch === '「') inside = true;
      else if (ch === '」') inside = false;
    }
    return (startsInside ? '「' : '') + text + (inside ? '」' : '');
  });
}

/** 字幕結束時間：字越多停越久（夾在 2 到 6 秒），而且不會蓋到下一列 */
export function subtitleEnd(start: number, text: string, nextStart: number): number {
  const chars = text.replace(/\s/g, '').length;
  return Math.min(nextStart, start + Math.min(6, Math.max(2, 1.2 + 0.28 * chars)));
}

export interface SubtitleRow {
  start: number;
  end: number;
  /** 顯示用，已補成對的引號 */
  text: string;
  speaker: string;
}

export function buildSubtitleRows(lines: readonly { seconds: number; text: string; speaker: string }[]): SubtitleRow[] {
  const texts = balanceQuotes(
    lines.map(line => line.text),
    lines.map(line => line.speaker),
  );
  return lines.map((line, i) => ({
    start: line.seconds,
    end: subtitleEnd(line.seconds, line.text, i + 1 < lines.length ? lines[i + 1].seconds : Infinity),
    text: texts[i],
    speaker: line.speaker,
  }));
}

/** 二分查找 t 這個時間該顯示哪一列；還沒開始、或已經過了結束時間就回 -1 */
export function rowAt(rows: readonly SubtitleRow[], t: number): number {
  let low = 0;
  let high = rows.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (rows[mid].start <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found >= 0 && t < rows[found].end ? found : -1;
}

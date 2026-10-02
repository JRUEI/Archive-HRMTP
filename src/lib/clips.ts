import type { EpisodeClip, TranscriptLine } from './markdown';

export const HOST = '福嶋晴菜';

// 從 YouTube URL 提取 videoId
export function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v)\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export const toSeconds = (time: string) => time.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);

// 比對精華句時不看空白和 [笑聲] 這類聲音標記（跟 validate-content.mjs 一樣）
const normalize = (text: string) => text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '');

export interface ClipLine extends TranscriptLine {
  isQuote: boolean;
}

// 片段的對話：照起訖從逐字稿切，精華句所在的那一列標起來
export function clipLines(clip: EpisodeClip, transcript: TranscriptLine[] = []): ClipLine[] {
  const from = toSeconds(clip.start), to = toSeconds(clip.end);
  const lines = transcript.filter(l => toSeconds(l.time) >= from && toSeconds(l.time) < to);
  const at = lines.findIndex(l => normalize(l.text).includes(normalize(clip.quote)));
  return lines.map((l, i) => ({ ...l, isQuote: i === at }));
}

// 同一人連續的列併成一段，精華句那一列自成一段
export function mergeLines(lines: ClipLine[]): ClipLine[] {
  const out: ClipLine[] = [];
  for (const l of lines) {
    const last = out.at(-1);
    if (last && !last.isQuote && !l.isQuote && last.speaker === l.speaker) out[out.length - 1] = { ...last, text: last.text + l.text };
    else out.push({ ...l });
  }
  return out;
}

export const shortName = (speaker: string) =>
  speaker.includes('＆') ? '兩人' : speaker === '工作人員' ? speaker : speaker.slice(0, 2);

export function clipLength(clip: EpisodeClip) {
  const d = toSeconds(clip.end) - toSeconds(clip.start);
  return d <= 60 ? `${d} 秒` : `${Math.floor(d / 60)} 分 ${d % 60} 秒`;
}

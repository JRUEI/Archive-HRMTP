// YouTube 自動字幕 VTT → 字幕片段清單（滾動字幕的新行才算，10ms 的過場 cue 跳過）。
//   node scripts/vtt-words.mjs 10 15:40 16:30   → 印出這段日文，一個片段一行，前面標開始時間與距上一片段的空檔
import { readFileSync } from 'node:fs';

const ts = (s) => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x; };

export function vttSegments(src) {
  const segs = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/);
    if (!h) continue;
    const t = ts(h[1]), end = ts(h[2]);
    const body = [];
    for (let j = i + 1; j < lines.length && lines[j] !== ''; j++) body.push(lines[j]);
    if (end - t < 0.05) continue;
    const last = (body[body.length - 1] || '').replace(/<[^>]+>/g, '').trim();
    if (last) segs.push({ t, end, text: last });
  }
  return segs;
}

if (process.argv[1]?.endsWith('vtt-words.mjs')) {
  const [ep, a, b] = process.argv.slice(2);
  const mmss = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  const segs = vttSegments(readFileSync(`content/ep${String(ep).padStart(2, '0')}.ja.vtt`, 'utf8'));
  const lo = mmss(a), hi = mmss(b);
  let prevEnd = null;
  for (const s of segs) {
    if (s.t >= lo && s.t <= hi) {
      const gap = prevEnd == null ? '' : `+${(s.t - prevEnd).toFixed(1)}`;
      console.log(`[${Math.floor(s.t / 60)}:${(s.t % 60).toFixed(1).padStart(4, '0')}] ${gap.padEnd(5)} ${s.text}`);
    }
    prevEnd = s.end;
  }
}

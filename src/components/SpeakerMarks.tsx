'use client';

// 邊聽邊標說話者錯誤，聽完一次套用、寫回 Markdown。只在本機 npm run dev 出現。
// 寫回走 src/app/api/speakers/route.dev.ts，正式站（靜態匯出）沒有這支 API。
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { TranscriptLine } from '@/lib/markdown';

export const SPEAKER_TOOLS = process.env.NODE_ENV === 'development';

const HOST = '福嶋晴菜';
const STAFF = '工作人員';

type MarkType = 'start' | 'end' | 'one' | 'check';
interface Mark { id: number; type: MarkType; i: number }
interface Group { kind: 'range' | 'one' | 'check' | 'warn'; ms: Mark[]; msg?: string }

let seq = 0; // 標記的 id，只拿來當 key 和刪除用

const MK: Record<MarkType, string> = { start: '對調起點', end: '對調終點', one: '單句對調', check: '待查' };
const KEYS: Record<string, MarkType> = { '[': 'start', ']': 'end', s: 'one', S: 'one', '?': 'check' };
const TAG_CLASS: Record<MarkType, string> = {
  start: 'bg-indigo-500', end: 'bg-indigo-500', one: 'bg-cyan-600', check: 'bg-red-600',
};

// 依時間把起點、終點配成段落；配不起來的標紅，不套用
function pairMarks(marks: Mark[]): Group[] {
  const ord: Record<MarkType, number> = { start: 0, one: 1, check: 1, end: 2 };
  const ms = [...marks].sort((a, b) => a.i - b.i || ord[a.type] - ord[b.type]);
  const out: Group[] = [];
  let open: Mark | null = null;
  for (const m of ms) {
    if (m.type === 'start') {
      if (open) out.push({ kind: 'warn', ms: [open], msg: '起點沒有配到終點' });
      open = m;
    } else if (m.type === 'end') {
      if (open) { out.push({ kind: 'range', ms: [open, m] }); open = null; }
      else out.push({ kind: 'warn', ms: [m], msg: '終點前面沒有起點' });
    } else out.push({ kind: m.type, ms: [m] });
  }
  if (open) out.push({ kind: 'warn', ms: [open], msg: '還沒按終點' });
  return out.sort((a, b) => a.ms[0].i - b.ms[0].i);
}

export function useSpeakerTools(id: string, lines: TranscriptLine[], activeIndex: number) {
  const guest = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of lines) if (l.speaker !== HOST && l.speaker !== STAFF && !l.speaker.includes('＆')) count.set(l.speaker, (count.get(l.speaker) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [lines]);
  // 單人回沒有對調的對象，整組不出現
  const enabled = SPEAKER_TOOLS && guest !== null;
  const swap = useCallback((s: string) => (s === HOST ? guest! : s === guest ? HOST : s), [guest]);
  const cycleOrder = useMemo(() => [HOST, guest!, `${HOST}＆${guest}`, STAFF], [guest]);

  const [file, setFile] = useState(() => lines.map(l => l.speaker));
  const [cur, setCur] = useState(file);
  const [undo, setUndo] = useState<string[][]>([]);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);

  // 標記存在瀏覽器裡，重新整理不會不見；存時間一起比對，檔案改過對不上的就丟掉
  const storeKey = `harumatope_speaker_marks_${id}`;
  const [marks, setMarks] = useState<Mark[]>(() => {
    if (!SPEAKER_TOOLS) return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(storeKey) ?? '[]') as { type: MarkType; i: number; t: string }[];
      // 同一列同一種只留一筆（舊版會重複存）
      const seen = new Set<string>();
      return saved
        .filter(m => lines[m.i]?.time === m.t && !seen.has(`${m.type}@${m.i}`) && seen.add(`${m.type}@${m.i}`))
        .map(m => ({ type: m.type, i: m.i, id: seq++ }));
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(marks.map(m => ({ type: m.type, i: m.i, t: lines[m.i].time }))));
    } catch {
      // 記不住就算了，這次還是能用
    }
  }, [enabled, marks, storeKey, lines]);

  const say = useCallback((text: string) => setToast(t => ({ text, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(h);
  }, [toast]);

  const activeRef = useRef(activeIndex);
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

  // 沒給列就標正在播的那列；同一列已有同一種標記就是取消，不會重複
  const marksRef = useRef(marks);
  useEffect(() => { marksRef.current = marks; }, [marks]);
  const addMark = useCallback((type: MarkType, at?: number) => {
    const i = at ?? activeRef.current;
    if (i < 0) { say('影片還沒開始播'); return; }
    const has = marksRef.current.some(m => m.type === type && m.i === i);
    setMarks(ms => (has ? ms.filter(m => !(m.type === type && m.i === i)) : [...ms, { type, i, id: seq++ }]));
    say(`${lines[i].time} ${has ? '取消' : ''}${MK[type]}`);
  }, [lines, say]);

  // 右鍵選單：在哪一列按右鍵就標哪一列
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null);
  const openMenu = useCallback((e: React.MouseEvent, i: number) => {
    if (!enabled) return;
    e.preventDefault();
    setMenu({ i, x: e.clientX, y: e.clientY });
  }, [enabled]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // 邊聽邊按：[ 對調起點、] 對調終點、S 單句對調、? 待查，標的是正在播的那一列
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const type = KEYS[e.key];
      if (type) { e.preventDefault(); addMark(type); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, addMark]);

  const groups = useMemo(() => pairMarks(marks), [marks]);

  const edit = useCallback((idx: number[], fn: (s: string) => string) => {
    const next = cur.slice();
    idx.forEach(i => { next[i] = fn(next[i]); });
    if (next.some((s, i) => s !== cur[i])) { setUndo(u => [...u, cur]); setCur(next); }
  }, [cur]);

  const apply = useCallback(() => {
    const idx: number[] = [];
    for (const g of groups) {
      if (g.kind === 'range') for (let k = g.ms[0].i; k <= g.ms[1].i; k++) idx.push(k);
      if (g.kind === 'one') idx.push(g.ms[0].i);
    }
    edit(idx, swap); // 單句落在段落內會換兩次＝原樣，清單上已提醒
    const used = new Set(groups.filter(g => g.kind === 'range' || g.kind === 'one').flatMap(g => g.ms.map(m => m.id)));
    setMarks(ms => ms.filter(m => !used.has(m.id)));
  }, [groups, edit, swap]);

  const cycle = useCallback((i: number) => {
    edit([i], s => cycleOrder[(cycleOrder.indexOf(s) + 1) % cycleOrder.length]);
  }, [edit, cycleOrder]);

  const changed = useMemo(() => cur.map((s, i) => (s !== file[i] ? i : -1)).filter(i => i >= 0), [cur, file]);

  const [saving, setSaving] = useState(false);
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, changes: changed.map(i => ({ i, time: lines[i].time, from: file[i], to: cur[i] })) }),
      });
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) { say(`沒寫進去：${body.error}`); return; }
      setFile(cur);
      setUndo([]);
      say(`已寫回 ${body.written} 列到 ${id}.md`);
    } catch {
      say('沒寫進去：連不到開發伺服器');
    } finally {
      setSaving(false);
    }
  }, [id, changed, lines, file, cur, say]);

  return {
    enabled, speakers: cur, file, marks, groups, changed, toast, saving,
    addMark, apply, cycle, save, menu, openMenu, closeMenu: () => setMenu(null),
    canUndo: undo.length > 0,
    undo: () => { if (undo.length) { setCur(undo[undo.length - 1]); setUndo(u => u.slice(0, -1)); } },
    nudge: (mid: number, d: number) => setMarks(ms => ms.map(m => (m.id === mid ? { ...m, i: Math.max(0, Math.min(lines.length - 1, m.i + d)) } : m))),
    remove: (ids: number[]) => setMarks(ms => ms.filter(m => !ids.includes(m.id))),
  };
}

export type SpeakerTools = ReturnType<typeof useSpeakerTools>;

// 列上的標記標籤，加上改過的列劃掉檔案裡原本的人名
export function MarkTags({ tools, i }: { tools: SpeakerTools; i: number }) {
  if (!tools.enabled) return null;
  const was = tools.speakers[i] !== tools.file[i] ? tools.file[i] : null;
  return (
    <>
      {was && <span className="text-[11px] text-zinc-400 line-through">{was}</span>}
      {tools.marks.filter(m => m.i === i).map(m => (
        <span key={m.id} className={`text-[11px] font-bold text-white px-2 py-0.5 rounded-full ${TAG_CLASS[m.type]}`}>{MK[m.type]}</span>
      ))}
    </>
  );
}

const btn = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap';
const kbd = 'font-mono text-[11px] leading-4 px-1.5 rounded border border-zinc-300 dark:border-zinc-600 border-b-2';
const MARK_KEYS: [MarkType, string, string][] = [['start', '[', '起點'], ['end', ']', '終點'], ['one', 'S', '單句'], ['check', '?', '待查']];

// 字幕群標題列上的四顆標記鈕；手機沒有鍵盤、也不在手機上校對，不顯示
export function MarkButtons({ tools }: { tools: SpeakerTools }) {
  if (!tools.enabled) return null;
  return (
    <span className="hidden sm:inline-flex items-stretch rounded-[10px] border border-dashed border-indigo-300 dark:border-indigo-700 divide-x divide-dashed divide-indigo-300 dark:divide-indigo-700 bg-white dark:bg-zinc-900 overflow-hidden">
      {MARK_KEYS.map(([t, k, label]) => (
        <button
          key={t}
          type="button"
          onClick={(e) => { e.stopPropagation(); tools.addMark(t); }}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-[background-color] whitespace-nowrap"
          title={`${MK[t]}（快捷鍵 ${k}，本機才有）`}
        >
          <span className={kbd}>{k}</span>{label}
        </button>
      ))}
    </span>
  );
}

// 右鍵選單本體：已有的標記打勾，再點一次就取消
export function MarkMenu({ tools }: { tools: SpeakerTools }) {
  const m = tools.menu;
  if (!tools.enabled || !m) return null;
  const W = 168, H = 4 * 36 + 8;
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: Math.min(m.x, window.innerWidth - W - 8), top: Math.min(m.y, window.innerHeight - H - 8), width: W }}
      className="fixed z-[70] p-1 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 shadow-xl flex flex-col"
    >
      {MARK_KEYS.map(([t, k]) => {
        const on = tools.marks.some(x => x.type === t && x.i === m.i);
        return (
          <button
            key={t}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on}
            onClick={() => { tools.addMark(t, m.i); tools.closeMenu(); }}
            className="flex items-center gap-2 h-9 px-2.5 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-[background-color]"
          >
            <span className={kbd}>{k}</span>
            <span className="flex-1 text-left">{MK[t]}</span>
            {on && <Check size={14} className="text-indigo-500" />}
          </button>
        );
      })}
    </div>
  );
}

export function SpeakerPanel({ tools, lines, onSeek, onFix }: {
  tools: SpeakerTools;
  lines: TranscriptLine[];
  onSeek: (i: number) => void;
  onFix: (i: number) => void;
}) {
  if (!tools.enabled) return null;
  const { groups, changed } = tools;
  const ranges = groups.filter(g => g.kind === 'range').map(g => [g.ms[0].i, g.ms[1].i]);
  const inRange = (i: number) => ranges.some(([a, b]) => i >= a && i <= b);
  const ready = groups.filter(g => g.kind === 'range' || g.kind === 'one').length;

  const nud = (m: Mark) => (
    <span className="inline-flex items-center">
      <button type="button" onClick={() => tools.nudge(m.id, -1)} className={`${btn} px-2 rounded-r-none`} aria-label="往前一列"><ChevronLeft size={12} /></button>
      <button type="button" onClick={() => onSeek(m.i)} className={`${btn} px-2 rounded-none -mx-px font-mono`} title="跳到這裡重聽">{lines[m.i].time}</button>
      <button type="button" onClick={() => tools.nudge(m.id, 1)} className={`${btn} px-2 rounded-l-none`} aria-label="往後一列"><ChevronRight size={12} /></button>
    </span>
  );
  const del = (g: Group) => (
    <button type="button" onClick={() => tools.remove(g.ms.map(m => m.id))} className={`${btn} px-2 border-transparent bg-transparent dark:bg-transparent`} aria-label="刪除標記"><X size={14} /></button>
  );

  // 提示訊息獨立於清單：寫回後清單收起來，訊息還要看得到
  const toast = tools.toast && (
    <div key={tools.toast.n} role="status" className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[60] bg-zinc-900 text-white text-sm px-4 py-2 rounded-xl shadow-xl pointer-events-none">
      {tools.toast.text}
    </div>
  );
  // 沒有標記、沒有未寫回、也沒有可復原的，就不佔版面
  if (!tools.marks.length && !changed.length && !tools.canUndo) return toast;

  return (
    <div className="hidden sm:flex bg-white dark:bg-zinc-900 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-2xl p-4 flex-col gap-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-indigo-600 dark:text-indigo-400">本機才有</span>
        <span className="text-zinc-500 dark:text-zinc-400">{tools.marks.length} 筆標記</span>
      </div>

      {groups.length > 0 && (
        <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {groups.map(g => (
            <div key={g.ms.map(m => m.id).join('-')} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2 text-xs">
              <span className={`font-bold min-w-16 ${g.kind === 'warn' ? 'text-red-600' : 'text-zinc-800 dark:text-zinc-100'}`}>
                {g.kind === 'range' ? '段落對調' : MK[g.ms[0].type]}
              </span>
              {nud(g.ms[0])}
              {g.kind === 'range' && <>–{nud(g.ms[1])}<span className="text-zinc-500">{g.ms[1].i - g.ms[0].i + 1} 列</span></>}
              <span className="flex-1" />
              {g.kind === 'warn' && <span className="font-bold text-red-600">{g.msg}</span>}
              {g.kind === 'one' && inRange(g.ms[0].i) && <span className="font-bold text-red-600">在對調段落裡，套用後會換回原樣</span>}
              {g.kind === 'check' && <button type="button" onClick={() => onFix(g.ms[0].i)} className={btn}>去改</button>}
              {del(g)}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-1 min-w-40">
          {tools.marks.length ? `${ready} 項可套用${groups.some(g => g.kind === 'warn') ? '，紅色的要先補齊' : ''}。` : '還沒有標記。'}
          {changed.length ? <> 未寫回 <b className="text-amber-600 dark:text-amber-400">{changed.length}</b> 列。</> : ''}
          {' '}抽屜裡點人名可以單列切換。
        </span>
        <button type="button" onClick={tools.apply} disabled={!ready} className={`${btn} bg-indigo-500 dark:bg-indigo-500 border-indigo-500 dark:border-indigo-500 text-white dark:text-white`}>全部套用</button>
        <button type="button" onClick={tools.undo} disabled={!tools.canUndo} className={btn}>復原</button>
        <button type="button" onClick={tools.save} disabled={!changed.length || tools.saving} className={`${btn} bg-emerald-600 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-600 text-white dark:text-white`}>
          寫回 Markdown
        </button>
      </div>

      {changed.length > 0 && (
        <pre className="m-0 max-h-48 overflow-auto rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {changed.map(i => (
            <span key={i}>
              <span className="text-red-500">- [{lines[i].time}] [{tools.file[i]}]</span>{'\n'}
              <span className="text-emerald-600 dark:text-emerald-400">+ [{lines[i].time}] [{tools.speakers[i]}]</span>{'\n'}
            </span>
          ))}
        </pre>
      )}

      {toast}
    </div>
  );
}

'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { rowAt, type SubtitleRow, type SubtitleStyle } from '@/lib/subtitle';

/* 底條高 = 字型的 ascent + descent，各平台字型不同就不一樣，所以字型固定 Noto Sans TC（1.16 + 0.288 em）。
   中文字面在基線上 0.88、下 0.12 em：底條上緣到字面 1.16 − 0.88 = 0.28，下緣 0.288 − 0.12 = 0.168，
   下方補 0.112em 兩邊都是 0.28，字面在底條正中。內距用 em，字號、全螢幕放大時一起縮放 */
const BAR = 'rounded-[0.18em] px-[0.4em] pb-[0.112em] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]';

/** 字幕上方常駐的人名標：名字、字色（沒有就白字） */
export interface NameTag {
  name: string;
  color?: string;
}

/**
 * 疊在 YouTube 播放器上的字幕。字幕層整個 pointer-events-none，影片上的任何操作都不受影響；
 * 大小一律用舞台寬度的百分比（cqw），所以舞台是 @container。
 * 要放在舞台裡、放在 YouTube 取代掉的那個 div 後面：React 往它前面插節點會找不到參照。
 */
export default function SubtitleOverlay({
  playerRef,
  rows,
  style,
  offsetMs,
  colorOf,
  tags,
}: {
  playerRef: RefObject<{ getCurrentTime: () => number } | null>;
  rows: readonly SubtitleRow[];
  style: SubtitleStyle;
  offsetMs: number;
  /** 說話者的字色，回 undefined 就是白字 */
  colorOf: (speaker: string) => string | undefined;
  /** 字幕上方常駐的人名標，[左, 右]；不傳就沒有。不跟著字幕出現或消失。
      說話者是左邊那位，字幕靠左；右邊那位靠右；其他人（工作人員、兩人一起）置中 */
  tags?: readonly [NameTag, NameTag];
}) {
  const [index, setIndex] = useState(-1);

  // 每個畫面影格問一次播放器現在幾秒。YouTube 自己會在頁面端往前推算、暫停時就停在那一秒，
  // 所以這裡不另外外插；暫停、拖進度時照樣顯示當下那一列。換列才改 state，不是一秒 60 次重繪
  useEffect(() => {
    let frame = 0;
    let shown = -2;
    const tick = () => {
      const time = playerRef.current?.getCurrentTime?.();
      if (typeof time === 'number') {
        const next = rowAt(rows, time + offsetMs / 1000);
        if (next !== shown) {
          shown = next;
          setIndex(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playerRef, rows, offsetMs]);

  const row = rows[index];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[5%] z-10 text-center leading-[1.35] text-white text-balance [overflow-wrap:anywhere]"
      style={
        {
          '--sb': style.sb,
          '--sf': style.sf,
          '--sw': style.sw,
          bottom: 'calc(var(--sb) * 1%)',
          fontSize: 'calc(var(--sf) * 1cqw)',
          fontWeight: 'var(--sw)',
          fontFamily: 'var(--font-noto-sans-tc)',
        } as CSSProperties
      }
    >
      {/* 人名標掛在字幕正上方，左右各一個。字幕折成幾行它就跟著升降，字幕空檔時下面留一行高的空位，不會掉下去。
          標籤字號是字幕的 0.8 倍，和字幕的間距 0.45em（用標籤自己的字號算）；整塊填字色（沒上色就白）、字近黑、黑邊 0.16em，淡紫、琥珀、白底都和任何背景分得開；內距沿用上面 BAR 的算法，字面在標籤正中 */}
      {tags && (
        <div className="mb-[0.45em] flex justify-between text-[0.8em]">
          {tags.map(tag => (
            <span
              key={tag.name}
              className="rounded-[0.4em] border-[0.16em] border-black text-zinc-950 px-[0.7em] pb-[0.112em]"
              style={{ backgroundColor: tag.color ?? '#fff' }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
      {/* 底條自己一層、整層 75%：多行時上下兩條疊到的地方不會變深，也蓋不到上一行的字；
          字在上面那層，兩層排版一樣所以斷行一致 */}
      <div
        className={`relative min-h-[1.35em] ${
          row && tags?.[0].name === row.speaker ? 'text-left' : row && tags?.[1].name === row.speaker ? 'text-right' : ''
        }`}
      >
        {row && (
          <>
            <div className="opacity-75">
              <span className={`${BAR} bg-black text-transparent`}>{row.text}</span>
            </div>
            <div className="absolute inset-0">
              <span className={BAR} style={{ color: colorOf(row.speaker) }}>
                {row.text}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

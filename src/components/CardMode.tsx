'use client';

import { useState, useRef, useEffect } from 'react';
import { EpisodeData, EpisodeCard } from '@/lib/markdown';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';


interface PaginatedCard {
  tag: string;
  title: string;
  content: string[];
  contentChunk: string[];
  displayTitle: string;
  scale: number;
}

interface RenderableCard {
  type: 'cover' | 'content' | 'summary' | 'ending';
  tag?: string;
  title?: string;
  content?: string[];
  contentChunk?: string[];
  displayTitle?: string;
  scale?: number;
}

interface ExportableCardProps {
  card: RenderableCard;
  index: number;
  isPreview?: boolean;
  episode: EpisodeData;
  isDark: boolean;
  totalCards: number;
}

// --- Card Style Constants (inline styles required for html-to-image export) ---
const CARD_STYLES = {
  // Shared
  footer: { fontSize: '30px', fontWeight: 300 as const, color: '#aaa', margin: 0, letterSpacing: '0.03em' },
  footerDivider: (isDark: boolean) => ({ borderTop: `1px solid ${isDark ? '#444' : '#E5E7EB'}`, paddingTop: '32px', flexShrink: 0 as const }),
  serif: (size: number, weight: number, color: string) => ({
    fontFamily: 'var(--font-serif)', fontSize: `${size}px`, fontWeight: weight, color, lineHeight: 1.35 as const, margin: 0,
  }),
  // Cover
  coverGoldBar: { width: '56px', height: '4px', background: '#E8C97A', marginTop: '60px', marginBottom: '24px' },
  coverBadge: { background: 'rgba(232,201,122,0.12)', border: '1px solid rgba(232,201,122,0.3)', color: '#E8C97A', padding: '10px 22px', borderRadius: '6px', fontSize: '26px', fontWeight: 700 as const, letterSpacing: '0.05em' },
  // Quote block
  quoteBlock: (isDark: boolean) => ({
    background: isDark ? '#333' : '#F3F4F6',
    borderLeft: `6px solid ${isDark ? '#c084fc' : '#9333ea'}`,
    padding: '28px 36px', borderRadius: '0 12px 12px 0', margin: '24px 0',
  }),
  quoteText: (isDark: boolean, scale = 1) => ({
    fontFamily: 'var(--font-serif)', fontSize: `${Q_FS * scale}px`, fontWeight: 700 as const,
    color: isDark ? '#eee' : '#444', lineHeight: Q_LH, margin: 0,
  }),
  // Content card
  contentBody: (isDark: boolean) => ({
    background: isDark ? '#262626' : '#FFFFFF', borderRadius: '16px', padding: '48px 56px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.03)', marginBottom: '32px', flex: 1 as const,
    display: 'flex' as const, flexDirection: 'column' as const, justifyContent: 'flex-start' as const,
  }),
  paragraph: (color: string, scale = 1) => ({ fontSize: `${P_FS * scale}px`, color, lineHeight: P_LH, marginBottom: `${P_MARGIN}px` }),
  bigNumber: (isDark: boolean) => ({
    position: 'absolute' as const, top: '140px', right: '60px',
    fontFamily: 'var(--font-serif)', fontSize: '320px', fontWeight: 900 as const,
    color: isDark ? '#222' : '#EBEBEB', lineHeight: 1, zIndex: 0, userSelect: 'none' as const,
  }),
} as const;

// --- Color System Mapping ---
const getTagStyle = (isDark: boolean) => {
  return {
    background: isDark ? '#27272a' : 'rgba(147,51,234,0.1)', // zinc-800 or purple tinted
    color: isDark ? '#c084fc' : '#9333ea', // vibrant brand-purple
  };
};

// --- Auto Pagination ---
// 分頁用「排版高度估算」而不是字數權重：依欄寬算折行數 × 字級 × 行高 + margin。
// 以下常數必須跟 CARD_STYLES 與 ExportableCard 的 inline style 一致，改版面時要一起改。
const CARD_H = 1920;
const CARD_PAD_Y = 72;
const CONTENT_W = 1080 - 80 * 2;        // 920，標題可用寬
const BODY_W = CONTENT_W - 56 * 2;      // 808，灰底內文框可用寬
const TAG_BLOCK = 79 + 72;              // 標籤列高（14×2 內距 + 34px 字）+ marginBottom
const TITLE_FS = 64;
const TITLE_LINE = TITLE_FS * 1.35;     // 86.4
const TITLE_GAP = 48 + 4 + 52;          // 標題下 margin + 分隔線 + 分隔線下 margin
const BODY_CHROME = 32 + 48 * 2;        // 內文框 marginBottom + 上下內距
const FOOTER_BLOCK = 78;                // 頁尾框線 + paddingTop + 30px 字
const SAFETY = 24;                      // 安全邊界，估算誤差的緩衝

const P_FS = 36, P_LH = 1.8;            // 段落與條列
const Q_FS = 34, Q_LH = 1.65;           // 引用
const P_MARGIN = 28;                    // 段落 marginBottom
// 連續的 * 會被 markdown 併成同一個 loose list，每個 li 內層再包一層 <p>。
// 實測 li 高 = 行數 × 行高，條目間距是 28（內層 p 的 28 與 li 的 16 合併取大），
// ul 自己的 32px marginBottom 整串只算一次（見 bodyBudget 的 UL_MARGIN）。
const LI_MARGIN = 28;
const UL_MARGIN = 32;
const BULLET_INDENT = 40;               // ul margin-left
const Q_MARGIN = 28 * 2 + 24 * 2;       // 引用上下內距 + 上下 margin
const Q_INSET = 6 + 36 * 2;             // 引用左框線 + 左右內距

// 全形字寬算 1，半形（ASCII 與半形假名）算 0.55
function widthInChars(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ -ÿ｡-ﾟ]/.test(ch) ? 0.55 : 1;
  return w;
}

// 估算前先剝掉 markdown 記號，只算畫面上看得見的字
function stripMarks(text: string): string {
  return text.replace(/^QUOTE:/, '').replace(/^>\s*/, '').replace(/^\*\s+/, '').replace(/\*\*/g, '');
}

function lineCount(text: string, colWidth: number, fontSize: number): number {
  return Math.max(1, Math.ceil(widthInChars(text) / (colWidth / fontSize)));
}

// 單一條目在卡片上實際佔掉的高度（內文框是 flex column，margin 不會合併，直接相加）
function blockHeight(item: string, scale = 1): number {
  const text = stripMarks(item);
  if (item.startsWith('QUOTE:') || item.startsWith('>')) {
    const fs = Q_FS * scale;
    return lineCount(text, BODY_W - Q_INSET, fs) * fs * Q_LH + Q_MARGIN;
  }
  const fs = P_FS * scale;
  if (item.startsWith('* ')) {
    return lineCount(text, BODY_W - BULLET_INDENT, fs) * fs * P_LH + LI_MARGIN;
  }
  return lineCount(text, BODY_W, fs) * fs * P_LH + P_MARGIN;
}

// 灰底內文框的可用高度。標題行數要實際算，1 行跟 2 行差 86px
function bodyBudget(title: string): number {
  const titleLines = lineCount(title, CONTENT_W, TITLE_FS);
  return CARD_H - CARD_PAD_Y * 2 - TAG_BLOCK - titleLines * TITLE_LINE
    - TITLE_GAP - BODY_CHROME - FOOTER_BLOCK - UL_MARGIN - SAFETY;
}

function packChunks(items: string[], budget: number): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let used = 0;
  for (const item of items) {
    const h = blockHeight(item);
    if (cur.length > 0 && used + h > budget) {
      chunks.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(item);
    used += h;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

// 貪婪切會把內容全塞進前幾張、最後一張只剩一兩條留一大片白。
// 先用完整預算貪婪切一次得到張數 k，再二分搜「還能維持 k 張的最小高度上限」，用那個上限重切。
function evenChunks(items: string[], budget: number): string[][] {
  const k = packChunks(items, budget).length;
  if (k <= 1) return packChunks(items, budget);
  let lo = Math.max(...items.map(i => blockHeight(i)));
  let hi = budget;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (packChunks(items, mid).length <= k) hi = mid;
    else lo = mid;
  }
  return packChunks(items, hi);
}

// 單一條目本身就超過一張卡時縮字級。高度大致與字級平方成正比（字小 → 每行字多、行高也小）
function chunkScale(chunk: string[], budget: number): number {
  const h = chunk.reduce((a, i) => a + blockHeight(i), 0);
  return h <= budget ? 1 : Math.max(0.7, Math.sqrt(budget / h));
}

// 精簡總結是一張塞完、不能分頁的海報，超出只會被 overflow:hidden 默默裁掉，
// 畫面上完全看不出來，所以同樣估高度再縮字級。
const SUM_TITLE_W = CONTENT_W - 40 * 2;   // h1 左右各 40 內距
const SUM_LI_W = CONTENT_W - 56 * 2 - 2 - 60; // 內文框內寬扣掉 ✦ 與 gap
const SUM_LI_FS = 32, SUM_LI_LH = 1.65, SUM_LI_MARGIN = 36;
const SUM_CHROME = 116 + 60 + 130 + 102;  // 標籤列 + 標題下 margin + 內文框內距框線 + 頁尾

function summaryScale(points: string[], title: string): number {
  const titleLines = lineCount(title, SUM_TITLE_W, 64);
  const budget = CARD_H - 80 * 2 - SUM_CHROME - titleLines * (64 * 1.4) - SAFETY;
  const h = points.reduce((a, p, i) =>
    a + lineCount(p, SUM_LI_W, SUM_LI_FS) * SUM_LI_FS * SUM_LI_LH
      + (i === points.length - 1 ? 0 : SUM_LI_MARGIN), 0);
  return h <= budget ? 1 : Math.max(0.6, Math.sqrt(budget / h));
}

function paginateCards(cards: EpisodeCard[]) {
  const paginated: PaginatedCard[] = [];

  cards.forEach(card => {
    // 「(1/9)」這種分頁後綴會讓標題多一行，預算得照切開後的標題算，所以反覆到張數收斂
    let chunks = evenChunks(card.content, bodyBudget(card.title));
    for (let pass = 0; pass < 3; pass++) {
      const suffix = chunks.length > 1 ? ` (${chunks.length}/${chunks.length})` : '';
      const next = evenChunks(card.content, bodyBudget(card.title + suffix));
      const settled = next.length === chunks.length;
      chunks = next;
      if (settled) break;
    }
    const suffix = chunks.length > 1 ? ` (${chunks.length}/${chunks.length})` : '';
    const budget = bodyBudget(card.title + suffix);
    chunks.forEach(chunk => {
      paginated.push({ ...card, contentChunk: chunk, displayTitle: '', scale: chunkScale(chunk, budget) });
    });
  });

  // Number them if split
  const titleCounts: Record<string, number> = {};
  paginated.forEach(card => {
    titleCounts[card.title] = (titleCounts[card.title] || 0) + 1;
  });

  const titleCurrentIndex: Record<string, number> = {};
  
  for (let i = 0; i < paginated.length; i++) {
    const title = paginated[i].title;
    const totalForTitle = titleCounts[title];
    
    if (totalForTitle > 1) {
      titleCurrentIndex[title] = (titleCurrentIndex[title] || 0) + 1;
      paginated[i].displayTitle = `${title} (${titleCurrentIndex[title]}/${totalForTitle})`;
    } else {
      paginated[i].displayTitle = title;
    }
  }

  return paginated;
}

// --- Reusable Component for 1080x1920 Card ---
const ExportableCard = ({ card, index, isPreview = false, episode, isDark, totalCards }: ExportableCardProps) => {
  if (!card) return null;
  
  // Cover Card
  if (card.type === 'cover') {
    return (
      <div className={`export-card ${isPreview ? 'absolute inset-0' : 'relative'} w-[1080px] h-[1920px] bg-[#111111] overflow-hidden box-border flex flex-col p-[80px]`}>
        <div style={CARD_STYLES.coverGoldBar}></div>
        <div style={{ marginBottom: 'auto' }}>
          <span className="whitespace-nowrap" style={CARD_STYLES.coverBadge}>
            節目拆解 / 完整收錄
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '84px', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.35, margin: '0 0 40px 0' }}>
          {episode.title}
        </h1>
        <div style={{ borderLeft: '4px solid #E8C97A', paddingLeft: '32px', marginBottom: '120px' }}>
          <p style={{ fontSize: '32px', fontWeight: 300, color: '#aaa', margin: 0, lineHeight: 1.6 }}>
            第 {episode.episodeNumber} 回精華完整收錄。
          </p>
        </div>
        <div style={{ borderTop: '1px solid #2A2A2A', paddingTop: '36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={CARD_STYLES.footer}>主講人 / 福嶋晴菜</p>
        </div>
      </div>
    );
  }

  // Ending Card
  if (card.type === 'ending') {
    return (
      <div className={`export-card ${isPreview ? 'absolute inset-0' : 'relative'} w-[1080px] h-[1920px] bg-[#111111] overflow-hidden box-border flex flex-col justify-center p-[80px]`}>
        <div style={{ border: '1px solid rgba(232,201,122,0.3)', borderRadius: '16px', padding: '52px', marginBottom: '80px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '80px', color: 'rgba(232,201,122,0.2)', lineHeight: 0.8, marginBottom: '20px', fontWeight: 900 }}>&ldquo;</div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '38px', fontWeight: 700, color: '#E8C97A', lineHeight: 1.7, margin: '0 0 28px 0' }}>
            本集內容到此結束。
          </p>
          <p style={{ fontSize: '26px', fontWeight: 300, color: '#888', margin: 0 }}>— はるまとぺーじ</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ flex: 1, height: '1px', background: '#2A2A2A' }}></div>
          <span style={{ fontSize: '24px', fontWeight: 700, color: '#555', letterSpacing: '0.2em' }}>END</span>
          <div style={{ flex: 1, height: '1px', background: '#2A2A2A' }}></div>
        </div>
      </div>
    );
  }

  // Summary Card (Standalone Poster Style)
  if (card.type === 'summary') {
    const ss = card.scale ?? 1;
    return (
      <div className={`export-card ${isPreview ? 'absolute inset-0' : 'relative'} w-[1080px] h-[1920px] overflow-hidden box-border flex flex-col justify-center p-[80px]`} style={{ background: isDark ? '#111' : '#F9FAFB' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '800px', height: '800px', background: isDark ? 'radial-gradient(circle, rgba(192,132,252,0.08) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(147,51,234,0.08) 0%, transparent 70%)', borderRadius: '50%' }}></div>
        <div style={{ position: 'absolute', bottom: '-10%', left: '-10%', width: '800px', height: '800px', background: isDark ? 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(5,150,105,0.08) 0%, transparent 70%)', borderRadius: '50%' }}></div>
        
        <div style={{ zIndex: 10 }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <span style={{ display: 'inline-block', background: isDark ? 'rgba(232,201,122,0.15)' : 'rgba(212,175,55,0.1)', border: isDark ? '1px solid rgba(232,201,122,0.4)' : '1px solid rgba(212,175,55,0.4)', color: isDark ? '#E8C97A' : '#D4AF37', padding: '12px 28px', borderRadius: '8px', fontSize: '28px', fontWeight: 700, letterSpacing: '0.1em' }}>
              第 {episode.episodeNumber} 回精華
            </span>
          </div>
          
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '64px', fontWeight: 900, color: isDark ? '#FFFFFF' : '#111111', lineHeight: 1.4, marginBottom: '60px', textAlign: 'center', padding: '0 40px' }}>
            {episode.title}
          </h1>
          
          <div style={{ background: isDark ? '#222' : '#FFFFFF', borderRadius: '24px', padding: '64px 56px', border: isDark ? '1px solid #333' : '1px solid #E5E7EB', boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.4)' : '0 20px 40px rgba(0,0,0,0.05)' }}>
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {(card.contentChunk || []).map((point: string, i: number) => (
                <li key={i} style={{ fontSize: `${SUM_LI_FS * ss}px`, color: isDark ? '#EBEBEB' : '#333333', lineHeight: SUM_LI_LH, marginBottom: i === (card.contentChunk || []).length - 1 ? 0 : `${SUM_LI_MARGIN * ss}px`, display: 'flex', gap: '24px' }}>
                  <span style={{ color: isDark ? '#C084FC' : '#9333EA', fontSize: `${36 * ss}px`, lineHeight: 1.4, flexShrink: 0 }}>✦</span>
                  <div>{point}</div>
                </li>
              ))}
            </ul>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <p style={{ fontSize: '28px', color: isDark ? '#666' : '#9ca3af', letterSpacing: '0.05em', margin: 0 }}>
              主講人 / 福嶋晴菜 • はるまとぺーじ
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Content Card
  const cardBg = isDark ? '#1a1a1a' : '#F9FAFB';
  const titleColor = isDark ? '#FFFFFF' : '#111111';
  const textColor = isDark ? '#DDDDDD' : '#333333';
  
  const contentIndex = index;
  const totalContent = Math.max(1, totalCards - 2);
  const s = card.scale ?? 1;

  return (
    <div className={`export-card ${isPreview ? 'absolute inset-0' : 'relative'} w-[1080px] h-[1920px] overflow-hidden box-border flex flex-col p-[72px_80px]`} style={{ background: cardBg }}>
      
      <div className="whitespace-nowrap" style={{ position: 'absolute', top: '72px', right: '80px', fontSize: '28px', fontWeight: 300, color: '#aaa', letterSpacing: '0.05em' }}>
        {contentIndex} / {totalContent}
      </div>
      
      <div style={{ marginBottom: '72px' }}>
        {card.tag && (
          <div className="whitespace-nowrap inline-flex items-center" style={{ ...getTagStyle(isDark), borderRadius: '8px', padding: '14px 28px' }}>
            <span style={{ fontSize: '34px', fontWeight: 700, letterSpacing: '0.06em' }}>{card.tag}</span>
          </div>
        )}
      </div>

      <div style={CARD_STYLES.bigNumber(isDark)}>
        {String(contentIndex).padStart(2, '0')}
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '64px', fontWeight: 900, color: titleColor, lineHeight: 1.35, margin: '0 0 48px 0' }}>
          {card.displayTitle}
        </h2>
        <div style={{ width: '48px', height: '4px', background: isDark ? '#c084fc' : '#9333ea', borderRadius: '2px', marginBottom: '52px' }}></div>
        
        <div style={CARD_STYLES.contentBody(isDark)}>
          
          <ReactMarkdown
            components={{
              p: ({node, ...props}) => {
                void node;
                if (typeof props.children === 'string' && props.children.startsWith('QUOTE:')) {
                  const quoteText = props.children.replace('QUOTE:', '');
                  return (
                    <div style={CARD_STYLES.quoteBlock(isDark)}>
                      <p style={CARD_STYLES.quoteText(isDark, s)}>
                        「{quoteText}」
                      </p>
                    </div>
                  );
                }
                return <p style={CARD_STYLES.paragraph(textColor, s)} {...props} />;
              },
              strong: ({node, ...props}) => {
                void node;
                return <strong style={{ color: isDark ? '#4ade80' : '#9333ea', fontWeight: 900 }} {...props} />;
              },
              ul: ({node, ...props}) => {
                void node;
                return <ul className={isDark ? "marker:text-[#c084fc]" : "marker:text-[#059669]"} style={{ margin: `0 0 32px ${BULLET_INDENT}px`, padding: 0 }} {...props} />;
              },
              li: ({node, ...props}) => {
                void node;
                return <li style={{ fontSize: `${P_FS * s}px`, color: textColor, lineHeight: P_LH, marginBottom: '16px', listStyleType: 'disc' }} {...props} />;
              },
              blockquote: ({node, ...props}) => {
                void node;
                return (
                  <div style={CARD_STYLES.quoteBlock(isDark)}>
                    <p style={CARD_STYLES.quoteText(isDark)}>
                      {props.children}
                    </p>
                  </div>
                );
              },
            }}
          >
            {card.contentChunk?.join('\n\n') || ''}
          </ReactMarkdown>

        </div>
      </div>

      <div style={CARD_STYLES.footerDivider(isDark)}>
        <p className="whitespace-nowrap" style={CARD_STYLES.footer}>主講人 / 福嶋晴菜</p>
      </div>
    </div>
  );
};

export default function CardMode({ episode, isLossless }: { episode: EpisodeData, isLossless: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { theme } = useTheme();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullScale, setFullScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  
  // Touch swipe states
  const touchStartRef = useRef<number | null>(null);
  const touchEndRef = useRef<number | null>(null);

  const minSwipeDistance = 40; // Only requires a 40px swipe, very sensitive!

  const handleTouchStart = (e: React.TouchEvent) => {
    touchEndRef.current = null;
    touchStartRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEndAction = () => {
    if (touchStartRef.current === null || touchEndRef.current === null) return;
    const distance = touchStartRef.current - touchEndRef.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };
  
  useEffect(() => {
    if (isFullscreen) {
      const updateFullScale = () => {
        // Reserve 32px horizontal padding and 88px vertical padding (for top action bar and margins)
        const paddingX = 32;
        const paddingY = 88;
        const availW = Math.max(200, window.innerWidth - paddingX);
        const availH = Math.max(300, window.innerHeight - paddingY);
        
        const scaleX = availW / 1080;
        const scaleY = availH / 1920;
        setFullScale(Math.min(scaleX, scaleY));
      };
      updateFullScale();
      window.addEventListener('resize', updateFullScale);
      
      // Prevent scrolling on body when in fullscreen
      document.body.style.overflow = 'hidden';
      
      return () => {
        window.removeEventListener('resize', updateFullScale);
        document.body.style.overflow = '';
      };
    }
  }, [isFullscreen]);

  // Determine cards
  let cardsToRender: RenderableCard[] = [];
  
  if (!isLossless) {
    cardsToRender = [
      { type: 'summary', contentChunk: episode.summary, scale: summaryScale(episode.summary, episode.title) }
    ];
  } else {
    const pCards = paginateCards(episode.cards);
    cardsToRender = [
      { type: 'cover' },
      ...pCards.map(c => ({ type: 'content' as const, ...c })),
      { type: 'ending' }
    ];
  }

  const handleNext = () => {
    if (currentIndex < cardsToRender.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const downloadAllCards = async () => {
    if (!hiddenContainerRef.current) return;
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: 0 });
    try {
      const htmlToImage = await import('html-to-image');
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');

      const cardElements = hiddenContainerRef.current.querySelectorAll('.export-card');
      const total = cardElements.length;
      setDownloadProgress({ current: 0, total });
      const zip = new JSZip();
      const failedCards: number[] = [];
      
      for (let i = 0; i < cardElements.length; i++) {
        setDownloadProgress({ current: i + 1, total });
        try {
          const node = cardElements[i] as HTMLElement;
          const dataUrl = await htmlToImage.toPng(node, { 
            pixelRatio: 1,
            quality: 1.0,
            style: { transform: 'scale(1)', transformOrigin: 'top left' },
            cacheBust: true
          });
          const base64Data = dataUrl.split(',')[1];
          zip.file(`Card-${String(i+1).padStart(2, '0')}.png`, base64Data, {base64: true});
        } catch (cardErr) {
          console.error(`Failed to export card ${i + 1}:`, cardErr);
          failedCards.push(i + 1);
        }
      }
      
      if (Object.keys(zip.files).length === 0) {
        console.error('All cards failed to export');
        return;
      }
      
      const content = await zip.generateAsync({type: 'blob'});
      saveAs(content, `${episode.title}-Cards.zip`);
      
      if (failedCards.length > 0) {
        console.warn(`Cards ${failedCards.join(', ')} failed to export`);
      }
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  };

  // Guard against an out-of-bounds index while the card collection changes.
  const currentCard = cardsToRender[currentIndex] || cardsToRender[0];
  const isDark = theme === 'dark';

  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Fallback for older browsers
    if (typeof ResizeObserver === 'undefined') {
      const updateScale = () => {
        if (containerRef.current) {
          setScale(containerRef.current.offsetWidth / 1080);
        }
      };
      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setScale(entry.contentRect.width / 1080);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(prev => Math.min(prev + 1, cardsToRender.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cardsToRender.length]);


  return (
    <>
      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-zinc-950/98 backdrop-blur-2xl flex flex-col justify-center items-center overflow-hidden touch-none select-none"
            onClick={() => setIsFullscreen(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEndAction}
          >
            {/* Top Navigation Bar - Cleanly positioned at top, zero collision with card */}
            <div 
              className="absolute top-0 inset-x-0 h-16 z-[10000] flex items-center justify-between px-6 pointer-events-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress counter badge (top-left) */}
              <div className="pointer-events-auto bg-zinc-900/90 text-zinc-100 text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full border border-zinc-700/60 shadow-lg tracking-wider">
                {Math.min(currentIndex + 1, cardsToRender.length)} / {cardsToRender.length}
              </div>

              {/* Close Button (top-right) */}
              <button 
                onClick={() => setIsFullscreen(false)}
                className="pointer-events-auto bg-zinc-900/90 hover:bg-zinc-800 text-white p-2.5 rounded-full transition-all border border-zinc-700/60 shadow-lg hover:scale-105 active:scale-95"
                title="關閉放大 (ESC)"
                aria-label="Close fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Desktop Navigation Arrows (Side controls) */}
            {currentIndex > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                className="hidden sm:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-[10000] bg-zinc-900/80 hover:bg-zinc-800 text-white p-3.5 rounded-full transition-all border border-zinc-700/60 shadow-xl hover:scale-110 active:scale-95"
                aria-label="上一張"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {currentIndex < cardsToRender.length - 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="hidden sm:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-[10000] bg-zinc-900/80 hover:bg-zinc-800 text-white p-3.5 rounded-full transition-all border border-zinc-700/60 shadow-xl hover:scale-110 active:scale-95"
                aria-label="下一張"
              >
                <ChevronRight size={24} />
              </button>
            )}

            {/* Scaled Container for Fullscreen - 100% Mathematically Centered */}
            <div 
              className="relative rounded-2xl sm:rounded-[36px] overflow-hidden shadow-2xl border border-zinc-800/80 bg-zinc-950 flex-shrink-0"
              style={{ 
                width: `${Math.round(1080 * fullScale)}px`, 
                height: `${Math.round(1920 * fullScale)}px` 
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tap Left/Right zones for navigation on mobile / touch */}
              <div className="absolute inset-y-0 left-0 w-1/4 z-30 cursor-w-resize" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
              <div className="absolute inset-y-0 right-0 w-1/4 z-30 cursor-e-resize" onClick={(e) => { e.stopPropagation(); handleNext(); }} />

              <div 
                className="absolute top-0 left-0 origin-top-left w-[1080px] h-[1920px]" 
                style={{ transform: `scale(${fullScale})` }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -60 }}
                    transition={{ duration: 0.18 }}
                    className="w-full h-full"
                  >
                    <ExportableCard card={currentCard} index={currentIndex} isPreview={true} episode={episode} isDark={isDark} totalCards={cardsToRender.length} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center w-full max-w-lg">
        
        {/* Controls */}
        <div className="w-full flex justify-between items-center mb-4 px-2">
          <div className="w-16 sm:w-24"></div>
          <div className="text-zinc-500 dark:text-zinc-400 font-bold bg-zinc-100 dark:bg-zinc-900 px-4 py-1.5 rounded-full text-xs sm:text-sm border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm tracking-wider">
            {Math.min(currentIndex + 1, cardsToRender.length)} / {cardsToRender.length}
          </div>
          <button 
            onClick={() => setIsFullscreen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-full font-bold text-xs transition-all shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 hover:scale-105 active:scale-95"
            aria-label="放大全螢幕"
            title="放大全螢幕檢視"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
            <span>放大</span>
          </button>
        </div>

        {/* The viewport container that scales down the 1080x1920 card */}
        <div 
          ref={containerRef}
          className="relative w-full aspect-[9/16] box-content bg-zinc-950 dark:bg-zinc-950 rounded-xl sm:rounded-3xl shadow-2xl border-4 border-zinc-800 dark:border-zinc-800 overflow-hidden flex items-center justify-center select-none group"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEndAction}
        >
          {/* Navigation Overlays */}
          <div className="absolute inset-y-0 left-0 w-1/6 z-50 cursor-w-resize" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
          <div className="absolute inset-y-0 right-0 w-1/6 z-50 cursor-e-resize" onClick={(e) => { e.stopPropagation(); handleNext(); }} />
          
          {/* Visual Arrows (Only show on hover for better immersion) */}
          {currentIndex > 0 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 bg-black/50 p-3 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <ChevronLeft size={28} />
            </div>
          )}
          {currentIndex < cardsToRender.length - 1 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 bg-black/50 p-3 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <ChevronRight size={28} />
            </div>
          )}

          {/* Scaled Container. We use a container that is exactly 1080x1920, and scale it down to fit the parent. */}
          <div className="absolute top-0 left-0 origin-top-left w-[1080px] h-[1920px] transition-opacity duration-300" 
               style={{ transform: `scale(${scale})`, opacity: scale > 0 ? 1 : 0 }}
          >
             <AnimatePresence mode="wait">
               <motion.div
                 key={currentIndex}
                 initial={{ opacity: 0, x: 100 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: -100 }}
                 transition={{ duration: 0.2 }}
                 className="w-full h-full"
               >
                 <ExportableCard card={currentCard} index={currentIndex} isPreview={true} episode={episode} isDark={isDark} totalCards={cardsToRender.length} />
               </motion.div>
             </AnimatePresence>
          </div>
        </div>

      {/* --- Hidden Container for Exporting All Cards --- */}
      <div 
        ref={hiddenContainerRef} 
        style={{ position: 'absolute', width: '1080px', visibility: 'hidden', overflow: 'hidden', height: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {cardsToRender.map((card, i) => (
          <ExportableCard key={i} card={card} index={i} isPreview={false} episode={episode} isDark={isDark} totalCards={cardsToRender.length} />
        ))}
      </div>

      {/* Download Section (Collapsible) */}
      <div className="w-full mt-8 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <button 
          onClick={() => setIsDownloadOpen(!isDownloadOpen)}
          className="w-full flex justify-between items-center p-4 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-brand-green/20 text-brand-green p-2 rounded-lg">
              <Download size={20} />
            </div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">圖卡下載區</span>
          </div>
          <div className={`transform transition-transform ${isDownloadOpen ? 'rotate-180' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-zinc-500">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        
        {isDownloadOpen && (
          <div className="p-6 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4 leading-relaxed">
              將會把目前預覽的所有圖卡（共 {cardsToRender.length} 張）打包成單一 ZIP 壓縮檔下載。手機版若跳出提示請允許下載。
            </p>
            <button 
              onClick={downloadAllCards}
              disabled={isDownloading}
              className="w-full flex justify-center items-center gap-2 bg-brand-green hover:bg-emerald-500 text-zinc-950 px-6 py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-zinc-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {downloadProgress.total > 0 ? `轉換中 ${downloadProgress.current}/${downloadProgress.total}` : '準備中...'}
                </>
              ) : (
                <>
                  <Download size={20} />
                  確認下載 {cardsToRender.length} 張圖卡 (ZIP)
                </>
              )}
            </button>
          </div>
        )}
      </div>

    </div>
    </>
  );
}

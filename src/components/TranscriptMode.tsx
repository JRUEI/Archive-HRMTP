'use client';

import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { EpisodeData } from '@/lib/markdown';
import { HOST, extractYouTubeId } from '@/lib/clips';
import { readStoredString, useHydrated, writeStoredString } from '@/lib/client-state';
import {
  buildSubtitleRows,
  DEFAULT_SUBTITLE_STATE,
  parseSubtitleState,
  SUBTITLE_STORAGE_KEY,
  type SubtitleState,
} from '@/lib/subtitle';
import { Search, X, FileText, Crosshair } from 'lucide-react';
import { useSpeakerTools, SpeakerPanel, MarkTags, MarkButtons, MarkMenu } from './SpeakerMarks';
import SubtitleOverlay from './SubtitleOverlay';
import SubtitleToolbar, { BAR_BTN, LABEL } from './SubtitleToolbar';

// 只宣告這裡用得到的 YouTube IFrame API
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
  /** 沒有文件、但嵌入播放器有：關掉原生字幕模組。缺了就當沒這個功能 */
  unloadModule?(name: string): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: object) => YTPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

const GROUP_SIZE_KEY = 'harumatope_transcript_groupsize_v2';
const GROUP_CARD_KEY = 'harumatope_transcript_groupcard_v1';

/** 實心強調色：#059669／#34d399 上放近黑字（5.3:1／10.4:1），白字只有 3.8:1 */
const SOLID_ACCENT = 'bg-brand-green text-zinc-950';

/** 說話者配色：人名標籤、影片上的字幕共用一張表。
    字幕底是半透明黑、疊在影片上，名牌的紫在亮畫面上不夠亮，字幕另用 globals.css 裡亮一階的字色 */
const VOICE = {
  host: { label: 'bg-purple-500/10 text-brand-purple border-purple-500/20', subtitle: 'var(--color-subtitle-host)' },
  guest: { label: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', subtitle: 'var(--color-subtitle-guest)' },
};

// 抽屜的時間戳：MM:SS 固定 5 字，給固定寬讓每列內文左緣對齊；高 22px 等於人名標籤的高
const TIME_TAG = 'shrink-0 inline-flex items-center justify-center w-12 h-[22px] rounded-md border font-mono text-xs font-bold transition-colors';

// 時間字串轉換為秒數 (支援 MM:SS 或 HH:MM:SS)
function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  } else if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

/** startAt：從精華分頁按「播放」進來時的起點秒數，播放器一準備好就跳過去播 */
export default function TranscriptMode({ episode, startAt }: { episode: EpisodeData; startAt?: number }) {
  const videoId = extractYouTubeId(episode.youtubeUrl);

  // 帶著起點進來時，字幕群一開始就停在那一句，不用等播放器
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    startAt === undefined ? -1 : (episode.transcript ?? []).findLastIndex(l => timeToSeconds(l.time) <= startAt),
  );
  // 只認掛載當下的起點：之後上層把它清掉也不會讓播放器重來
  const startAtRef = useRef(startAt);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  // 自訂字幕群句數（預設 4 句，可自訂 1~5 句，純狀態調整，絕不中斷或重啟影片）
  // 逐字稿模式只在點擊後才掛載，這裡一定在瀏覽器端執行
  const [groupSize, setGroupSize] = useState<number>(() => {
    try {
      const parsed = parseInt(window.localStorage.getItem(GROUP_SIZE_KEY) ?? '', 10);
      if (parsed >= 1 && parsed <= 5) return parsed;
    } catch {
      // 無痕模式或停用 Cookie 時讀不到儲存空間，沿用預設
    }
    return 4;
  });

  const handleSetGroupSize = useCallback((num: number) => {
    setGroupSize(num);
    try {
      window.localStorage.setItem(GROUP_SIZE_KEY, String(num));
    } catch {
      // 記不住就算了，不影響本次操作
    }
  }, []);

  const hydrated = useHydrated();

  // 影片下方「即時字幕群」卡片的開關（跟影片上的字幕是兩回事），預設開，記住上次選擇
  const [storedShowGroupCard, setStoredShowGroupCard] = useState(() => readStoredString(GROUP_CARD_KEY) !== '0');
  // 伺服器不知道使用者存了什麼，所以水合前一律先照預設值畫，避免對不起來
  const showGroupCard = hydrated ? storedShowGroupCard : true;
  const handleGroupCardChange = (on: boolean) => {
    setStoredShowGroupCard(on);
    writeStoredString(GROUP_CARD_KEY, on ? '1' : '0');
  };

  // 影片上的字幕：開關、樣式、快捷、延遲整包存在同一個 key。水合前一律用預設（預設是關）
  const [storedSubtitle, setStoredSubtitle] = useState(() => parseSubtitleState(readStoredString(SUBTITLE_STORAGE_KEY)));
  const subtitle = hydrated ? storedSubtitle : DEFAULT_SUBTITLE_STATE;
  const handleSubtitleChange = (patch: Partial<SubtitleState>) => {
    const next = { ...subtitle, ...patch };
    setStoredSubtitle(next);
    writeStoredString(SUBTITLE_STORAGE_KEY, JSON.stringify(next));
  };

  const playerRef = useRef<YTPlayer | null>(null);
  const theaterRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 一鍵平滑滾動畫面：底部對齊字幕群底下 10px，剛好露出上方影片時間軸
  const scrollToTheaterView = useCallback(() => {
    const subtitleEl = document.getElementById('transcript-subtitle-group');
    const playerEl = document.getElementById('transcript-player-stage');

    if (subtitleEl) {
      const subtitleRect = subtitleEl.getBoundingClientRect();
      const subtitleBottom = window.scrollY + subtitleRect.bottom;

      // 定位後的底部對齊字幕群底下 10px (window.scrollY + window.innerHeight = subtitleBottom + 10)
      let targetScrollY = subtitleBottom + 10 - window.innerHeight;

      // 安全限制：若視窗極高，最多只往上捲至播放器頂部（與 sticky navbar 保持 16px 間隔）
      if (playerEl) {
        const playerRect = playerEl.getBoundingClientRect();
        const playerTop = window.scrollY + playerRect.top;
        const navbarHeight = 64;
        const minScrollY = playerTop - navbarHeight - 16;
        if (targetScrollY < minScrollY) {
          targetScrollY = minScrollY;
        }
      }

      window.scrollTo({
        top: Math.max(0, targetScrollY),
        behavior: 'smooth',
      });
    } else if (playerEl) {
      playerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 預先計算並快取包含秒數的逐字稿
  const parsedLines = useMemo(() => {
    return (episode.transcript || []).map((line, idx) => ({
      ...line,
      index: idx,
      seconds: timeToSeconds(line.time),
    }));
  }, [episode.transcript]);

  // 個人回（只有福嶋晴菜與工作人員）：每句都是主持人，人名標籤只留工作人員的
  const solo = useMemo(() => parsedLines.every(l => l.speaker === '福嶋晴菜' || l.speaker === '工作人員'), [parsedLines]);

  // 本機開發時的說話者標記與修正（正式站 enabled 為 false，什麼都不畫）
  const speakerTools = useSpeakerTools(episode.id, parsedLines, activeIndex);
  const shownLines = useMemo(
    () => (speakerTools.enabled ? parsedLines.map(l => ({ ...l, speaker: speakerTools.speakers[l.index] })) : parsedLines),
    [parsedLines, speakerTools.enabled, speakerTools.speakers],
  );

  // 影片上的字幕：每列的起訖與補成對的引號。用 shownLines，本機改過的說話者字色跟著變
  const subtitleRows = useMemo(() => buildSubtitleRows(shownLines), [shownLines]);
  // 只有主持人、來賓有字色；工作人員、兩人一起說、或關掉「依說話者上色」都是白字
  const subtitleColor = (speaker: string) =>
    !subtitle.byVoice ? undefined : speaker === HOST ? VOICE.host.subtitle : speaker === episode.guest ? VOICE.guest.subtitle : undefined;

  // 字幕群時間欄寬（ch）：時間遞增，最後一列字最多；整集固定寬，播放中不會跳動
  const timeCh = parsedLines.at(-1)?.time.length ?? 5;

  // 正下方顯示的即時字幕群（預設 4 句，目前 timecode 對應第二句，容錯時間延遲並方便提前預讀）
  const currentGroupLines = useMemo(() => {
    if (shownLines.length === 0) return [];
    const offset = groupSize >= 2 ? 1 : 0;
    const baseIdx = Math.max(0, activeIndex >= 0 ? activeIndex - offset : 0);
    return shownLines.slice(baseIdx, baseIdx + groupSize);
  }, [shownLines, activeIndex, groupSize]);

  // 二分查找當前秒數落在哪一句話
  const findActiveIndex = useCallback((time: number): number => {
    if (parsedLines.length === 0) return -1;
    let low = 0;
    let high = parsedLines.length - 1;
    let result = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (parsedLines[mid].seconds <= time) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }, [parsedLines]);

  const findActiveIndexRef = useRef(findActiveIndex);
  useEffect(() => {
    findActiveIndexRef.current = findActiveIndex;
  }, [findActiveIndex]);

  // 跳轉至特定秒數並播放
  const seekTo = useCallback((sec: number, targetIdx?: number) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(sec, true);
      if (typeof playerRef.current.playVideo === 'function') {
        playerRef.current.playVideo();
      }
    }
    if (typeof targetIdx === 'number') {
      setActiveIndex(targetIdx);
    }
  }, []);

  // 往前／往後跳幾秒：跟 YouTube 的 ← → 一樣，不改變播放或暫停
  const seekBy = useCallback((delta: number) => {
    const player = playerRef.current;
    if (typeof player?.getCurrentTime !== 'function') return;
    const sec = Math.max(0, player.getCurrentTime() + delta);
    player.seekTo(sec, true);
    setActiveIndex(findActiveIndex(sec));
  }, [findActiveIndex]);

  // 立即平滑滾動定位至當前播放句（免手動滑動滾輪）
  const scrollToActive = useCallback(() => {
    if (activeIndex < 0) return;
    const targetEl = lineRefs.current[activeIndex];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  // 啟動進度輪詢器 (每 200ms)
  const startProgressLoop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const time = playerRef.current.getCurrentTime();
        if (typeof time === 'number') {
          const idx = findActiveIndexRef.current(time);
          if (idx !== -1) {
            setActiveIndex(prev => {
              if (prev !== idx) return idx;
              return prev;
            });
          }
        }
      }
    }, 200);
  }, []);

  const startProgressLoopRef = useRef(startProgressLoop);
  useEffect(() => {
    startProgressLoopRef.current = startProgressLoop;
  }, [startProgressLoop]);

  // 當 activeIndex 改變且開啟 autoScroll 時，平滑置中滾動抽屜內的逐字稿
  useEffect(() => {
    if (!autoScroll || activeIndex < 0 || !isDrawerOpen) return;
    const targetEl = lineRefs.current[activeIndex];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, autoScroll, isDrawerOpen]);

  // 抽屜開啟時自動平滑置中當前句
  useEffect(() => {
    if (isDrawerOpen && activeIndex >= 0) {
      const timer = setTimeout(() => {
        const targetEl = lineRefs.current[activeIndex];
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isDrawerOpen, activeIndex]);

  // 監聽鍵盤 Escape 鍵關閉抽屜
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  // 初始化 YouTube IFrame API
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;

    // 站上有自己的字幕（疊層與字幕群），YouTube 原生 CC 一律關掉，不然帳號或瀏覽器開了 CC 就會兩層字幕疊在一起
    function closeNativeCaptions() {
      try {
        playerRef.current?.unloadModule?.('captions');
      } catch {
        // 播放器還沒準備好或這支沒有該方法，下次狀態變化再試
      }
    }

    function initPlayer() {
      if (!window.YT || !window.YT.Player) return;
      if (playerRef.current) return;

      const container = document.getElementById('transcript-yt-player');
      if (!container) return;

      try {
        playerRef.current = new window.YT.Player('transcript-yt-player', {
          videoId: videoId,
          playerVars: {
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            cc_load_policy: 0, // 0 是「照觀看者自己的 YouTube 設定」，不是強制關；真正關掉靠 closeNativeCaptions
            iv_load_policy: 3,  // 關閉註解
          },
          events: {
            onReady: () => {
              if (!isMounted) return;
              closeNativeCaptions();
              const start = startAtRef.current;
              if (start !== undefined) {
                playerRef.current?.seekTo(start, true);
                playerRef.current?.playVideo();
              }
              startProgressLoopRef.current();
            },
            onStateChange: (event: { data: number }) => {
              if (!isMounted) return;
              if (event.data === window.YT?.PlayerState.PLAYING) {
                // 字幕模組常在第一次播放才載入，ready 時關過一次還不夠
                closeNativeCaptions();
                startProgressLoopRef.current();
              }
            },
          },
        });
      } catch (err) {
        console.error('Failed to initialize YouTube player:', err);
      }
    }

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      // 載入 YouTube API Script
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        if (isMounted) initPlayer();
      };
    }

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  if (!episode.transcript || episode.transcript.length === 0) {
    return (
      <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 md:p-12 shadow-xl flex items-center justify-center min-h-[300px]">
        <p className="text-zinc-500 text-lg">目前此集數尚未提供逐字稿。</p>
      </div>
    );
  }

  // 搜尋過濾
  const filteredLines = shownLines.filter(line => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return line.text.toLowerCase().includes(kw) || line.speaker.toLowerCase().includes(kw);
  });

  return (
    <div className="w-full">
      {/* 劇院居中主容器：播放器 → 工具列 → 即時字幕群 */}
      <div className="max-w-4xl mx-auto flex flex-col gap-4">

        {/* 1. 居中 YouTube 播放器 (16:9)，底下接工具列。
            影片上的字幕預設關閉；開了也是 pointer-events-none，影片上的操作與時間軸都不受影響。
            字幕層放在 YouTube 取代掉的那個 div 後面，React 往它前面插節點會找不到參照 */}
        {videoId && (
          <div className="flex flex-col gap-4">
            <div
              id="transcript-player-stage"
              ref={theaterRef}
              className="@container scroll-mt-20 relative w-full aspect-video bg-black rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
            >
              <div id="transcript-yt-player" className="w-full h-full"></div>
              {subtitle.on && (
                <SubtitleOverlay
                  playerRef={playerRef}
                  rows={subtitleRows}
                  style={subtitle.cur}
                  offsetMs={subtitle.offset}
                  colorOf={subtitleColor}
                />
              )}
            </div>
            <SubtitleToolbar
              state={subtitle}
              stageRef={theaterRef}
              onChange={handleSubtitleChange}
              groupOn={showGroupCard}
              onGroupChange={handleGroupCardChange}
              onSkip={seekBy}
            >
              <button
                type="button"
                onClick={scrollToTheaterView}
                aria-label="畫面定位"
                title="畫面定位：一鍵將畫面視角平滑置中對齊至播放器與字幕"
                className={BAR_BTN}
              >
                <Crosshair size={16} aria-hidden="true" className="shrink-0" />
                <span className={LABEL}>畫面定位</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                aria-label={`完整字幕（${parsedLines.length} 句）`}
                title={`展開完整逐字稿與搜尋（${parsedLines.length} 句）`}
                className={BAR_BTN}
              >
                <Search size={16} aria-hidden="true" className="shrink-0" />
                <span className={LABEL}>完整字幕</span>
              </button>
            </SubtitleToolbar>
          </div>
        )}

        {/* 2. 影片正下方「即時字幕群卡片」（可自訂 1~5 句） */}
        {showGroupCard && currentGroupLines.length > 0 && (
          <div
            id="transcript-subtitle-group"
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 pt-3 sm:pt-4 shadow-lg flex flex-col gap-2.5"
          >
            {/* 標題列的 pb 跟卡片的 pt-3 sm:pt-4 同值：上緣離卡片邊 = 下緣離分隔線，字才會落在這一段的正中；要調鬆緊兩處一起改 */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pb-3 sm:pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 font-bold text-zinc-700 dark:text-zinc-200">
                  <span className="w-2 h-2 rounded-full bg-brand-green animate-ping"></span>
                  即時字幕群<span className="max-sm:hidden">（{groupSize} 句同步）</span>
                </span>
                <MarkButtons tools={speakerTools} />
              </div>
              {/* 手機只留標題和按鈕一排；句數按鈕本身就看得出目前幾句 */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="max-sm:hidden text-[13px] text-zinc-500 dark:text-zinc-400">顯示句數：</span>
                <div className="inline-flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetGroupSize(num);
                      }}
                      className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold transition-all ${
                        groupSize === num
                          ? `${SOLID_ACCENT} shadow-sm`
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                      title={`字幕群顯示 ${num} 句`}
                    >
                      {num}句
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 無框對話流（劇本台詞風，消除多餘方框） */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 flex flex-col">
              {currentGroupLines.map((line) => {
                const isHost = line.speaker === '福嶋晴菜';
                const hideName = solo && isHost;

                return (
                  // 桌面兩欄：左欄時間、右欄人名＋內文。人名那格先排進右欄第一列，時間指定左欄、
                  // 比前一格的欄號小，自動排列就換到下一列，跟內文同一列；沒有人名時（empty:hidden）三者都在第一列。
                  // 只讓底色有動畫：transition-all 會連分隔線一起漸變，字幕往上推時新長出的線會從白色淡入（閃白線）
                  <button
                    key={line.index}
                    type="button"
                    onClick={() => seekTo(line.seconds, line.index)}
                    onContextMenu={(e) => speakerTools.openMenu(e, line.index)}
                    title="點擊跳轉影片至此秒數"
                    className="group w-full text-left py-2.5 sm:py-3 px-2 sm:px-3 grid sm:grid-cols-[auto_minmax(0,1fr)] items-start sm:gap-x-3 rounded-xl cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-[background-color] duration-200"
                  >
                    {/* button 裡只能放 phrasing content，所以這幾層都是 span */}
                    <span className="sm:col-start-2 flex items-center gap-2 mb-1 empty:hidden">
                      {!hideName && (
                        <span className={`font-bold text-xs px-2 py-0.5 rounded-full border ${isHost ? VOICE.host.label : VOICE.guest.label}`}>
                          {line.speaker}
                        </span>
                      )}
                      <MarkTags tools={speakerTools} i={line.index} />
                    </span>
                    {/* 時間：桌面是純數字欄，手機只留給螢幕閱讀器（max-sm:sr-only）省下欄寬。
                        欄寬 = 整集最長的時間字數（ch），各列文字左緣才切齊。
                        高度 = 內文行高（sm:text-base × leading-relaxed = 26px），時間在裡面置中，
                        對到內文第一行；sm:top-[…] 是字型字面中心的校正值，換字型或字級要重量 */}
                    <span
                      className="max-sm:sr-only sm:col-start-1 sm:flex sm:h-[26px] sm:w-(--time-w) sm:shrink-0 sm:items-center sm:relative sm:top-[1px] font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-500 transition-colors group-hover:text-emerald-700 dark:group-hover:text-brand-green"
                      style={{ '--time-w': `${timeCh}ch` } as CSSProperties}
                    >
                      {line.time}
                    </span>
                    <span className="sm:col-start-2 min-w-0 text-sm sm:text-base leading-relaxed font-medium text-zinc-900 dark:text-zinc-100">
                      {line.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <MarkMenu tools={speakerTools} />
        <SpeakerPanel
          tools={speakerTools}
          lines={parsedLines}
          onSeek={(i) => seekTo(parsedLines[i].seconds, i)}
          onFix={(i) => { seekTo(parsedLines[i].seconds, i); setIsDrawerOpen(true); }}
        />

      </div>

      {/* 4. 常駐畫面右側邊緣的懸浮快捷按鈕群 */}
      {/* 內容欄最寬 max-w-4xl(896px)，兩側餘白放得下這組鈕才顯示（xl 起）；
          更窄時會壓在影片、工具列上，同樣兩個動作工具列裡都有 */}
      <div className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col gap-2.5">
        {/* 畫面定位按鈕 */}
        <button
          type="button"
          onClick={scrollToTheaterView}
          className="bg-white/95 dark:bg-zinc-900/95 hover:bg-brand-green/10 text-emerald-700 dark:text-brand-green font-bold p-2.5 sm:p-3 rounded-2xl shadow-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 border border-brand-green/30 backdrop-blur group"
          title="畫面定位：一鍵平滑滾動畫面對齊至播放器與字幕"
        >
          <Crosshair size={18} className="transition group-hover:rotate-45" />
          <span className="text-[13px] tracking-wider [writing-mode:vertical-lr] font-bold">
            畫面定位
          </span>
        </button>

        {/* 逐字稿抽屜按鈕 */}
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={`font-bold px-2.5 sm:px-3 py-3 sm:py-3.5 rounded-2xl shadow-2xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 group ${SOLID_ACCENT}`}
          title="展開逐字稿抽屜 (支援全文搜尋)"
        >
          <FileText size={18} className="transition group-hover:rotate-6" />
          <span className="text-[13px] tracking-wider [writing-mode:vertical-lr] font-black">
            逐字稿抽屜
          </span>
          <span className="text-[10px] bg-black/15 dark:bg-black/20 px-1.5 py-0.5 rounded-full font-mono font-bold">
            {parsedLines.length}
          </span>
        </button>
      </div>

      {/* 5. 側邊抽屜 Backdrop 遮罩 */}
      {isDrawerOpen && (
        <div
          onClick={() => setIsDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        />
      )}

      {/* 6. 側邊滑動抽屜面板 */}
      {/* 關閉時 inert：移出 Tab 順序與無障礙樹，也擋掉點擊 */}
      <aside
        inert={!isDrawerOpen}
        className={`fixed top-0 right-0 h-full w-full sm:w-[500px] md:w-[540px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 抽屜頂部 Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          {/* 手機寬度放不下整列：句數在搜尋框右側已有，這裡先藏；標題過長時截斷而不是逐字折行 */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">完整逐字稿列表</h2>
            <span className="hidden sm:inline text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full font-mono font-medium">
              {parsedLines.length} 句
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap">
            {/* 定位當前播放句按鈕 */}
            <button
              type="button"
              onClick={scrollToActive}
              disabled={activeIndex < 0}
              className="flex items-center gap-1.5 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:scale-105 active:scale-95"
              title="立即定位滾動至目前播放句"
            >
              <Crosshair size={13} />
              <span>定位當前句</span>
            </button>

            {/* 跟隨播放開關 */}
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-emerald-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
              />
              <span>跟隨播放</span>
            </label>

            {/* 關閉按鈕 */}
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title="關閉抽屜 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 抽屜內搜尋框（完整保留原有搜尋功能） */}
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/30">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜尋逐字稿關鍵字（如：素麵、三河腔、合宿）..."
              className="w-full pl-10 pr-20 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 shadow-sm transition"
            />
            {searchKeyword ? (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                title="清除搜尋"
              >
                <X size={14} />
              </button>
            ) : (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 font-mono">
                {filteredLines.length} 句
              </span>
            )}
          </div>
          {searchKeyword && (
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between px-1">
              <span>找到 {filteredLines.length} 句包含「{searchKeyword}」</span>
              <button
                onClick={() => setSearchKeyword('')}
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                清除篩選
              </button>
            </div>
          )}
        </div>

        {/* 抽屜內滾動逐字稿列表（同步高亮自訂句數） */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {filteredLines.map((line) => {
            const isHost = line.speaker === '福嶋晴菜';
            const hideName = solo && isHost && !speakerTools.enabled;
            const offset = groupSize >= 2 ? 1 : 0;
            const startGroupIdx = Math.max(0, activeIndex - offset);
            const isActive = activeIndex >= 0 && (line.index >= startGroupIdx && line.index < startGroupIdx + groupSize);

            return (
              <div
                key={line.index}
                ref={(el) => {
                  lineRefs.current[line.index] = el;
                }}
                onClick={() => seekTo(line.seconds, line.index)}
                onContextMenu={(e) => speakerTools.openMenu(e, line.index)}
                className={`group flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-all duration-200 border ${
                  isActive
                    ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/90 dark:bg-emerald-500/10 shadow-[0_0_16px_rgba(52,211,153,0.12)]'
                    : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                {/* 時間戳 */}
                <span
                  className={`${TIME_TAG} ${hideName ? 'sm:mt-0.5' : ''} ${
                    isActive
                      ? 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-zinc-950 border-transparent'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-transparent group-hover:bg-emerald-500 group-hover:text-white dark:group-hover:bg-emerald-400 dark:group-hover:text-zinc-950'
                  }`}
                  title="點擊跳轉影片至此秒數"
                >
                  {line.time}
                </span>

                {/* 對話內文 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 empty:hidden">
                    {!hideName && <span
                      {...(speakerTools.enabled && {
                        role: 'button',
                        title: '點一下換人（本機才有）',
                        onClick: (e: React.MouseEvent) => { e.stopPropagation(); speakerTools.cycle(line.index); },
                      })}
                      className={`font-bold text-xs px-2 py-0.5 rounded-full border ${
                        isHost
                          ? 'bg-purple-500/10 text-brand-purple border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      } ${speakerTools.enabled ? 'hover:border-dashed hover:border-current' : ''}`}
                    >
                      {line.speaker}
                    </span>}
                    <MarkTags tools={speakerTools} i={line.index} />
                  </div>
                  <p className={`text-sm sm:text-base leading-relaxed m-0 transition-colors ${
                    isActive
                      ? 'text-zinc-950 dark:text-zinc-50 font-medium'
                      : 'text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100'
                  }`}>
                    {searchKeyword ? (
                      highlightText(line.text, searchKeyword)
                    ) : (
                      line.text
                    )}
                  </p>
                </div>
              </div>
            );
          })}

          {filteredLines.length === 0 && (
            <div className="py-12 text-center text-zinc-500">
              沒有找到符合「{searchKeyword}」的逐字稿內容。
            </div>
          )}
        </div>

        {/* 抽屜懸浮快速定位鈕（滾動遠離時一鍵跳回播放處） */}
        {activeIndex >= 0 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
            <button
              type="button"
              onClick={scrollToActive}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-zinc-950 px-4 py-2.5 rounded-full font-bold text-xs shadow-2xl transition-all hover:scale-105 border border-emerald-200 dark:border-emerald-300/50"
              title="立即平滑滾動定位至目前播放句"
            >
              <Crosshair size={14} className="text-zinc-950" />
              <span>定位至播放句 ({parsedLines[activeIndex]?.time || '00:00'})</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

// 關鍵字高亮輔助函式
function highlightText(text: string, keyword: string) {
  if (!keyword.trim()) return text;
  const parts = text.split(new RegExp(`(${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={i} className="bg-emerald-400/30 text-emerald-800 dark:text-emerald-300 px-1 rounded font-bold">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

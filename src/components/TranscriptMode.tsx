'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { EpisodeData } from '@/lib/markdown';
import { Search, Play, X, FileText, Crosshair } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

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

// 格式化秒數為 MM:SS
function formatSeconds(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 從 YouTube URL 提取 videoId
function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v)\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function TranscriptMode({ episode }: { episode: EpisodeData }) {
  const videoId = extractYouTubeId(episode.youtubeUrl);

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  // 自訂字幕群句數（預設 4 句，可自訂 1~5 句，純狀態調整，絕不中斷或重啟影片）
  const [groupSize, setGroupSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('harumatope_transcript_groupsize_v2');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 1 && parsed <= 5) return parsed;
      }
    }
    return 4;
  });

  const handleSetGroupSize = useCallback((num: number) => {
    setGroupSize(num);
    if (typeof window !== 'undefined') {
      localStorage.setItem('harumatope_transcript_groupsize_v2', String(num));
    }
  }, []);

  const playerRef = useRef<any>(null);
  const theaterRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 一鍵平滑滾動畫面：底部對齊字幕群底下空白的中間，剛好露出上方影片時間軸
  const scrollToTheaterView = useCallback(() => {
    const subtitleEl = document.getElementById('transcript-subtitle-group');
    const controlsEl = document.getElementById('transcript-controls');
    const playerEl = document.getElementById('transcript-player-stage');

    if (subtitleEl) {
      const subtitleRect = subtitleEl.getBoundingClientRect();
      const subtitleBottom = window.scrollY + subtitleRect.bottom;

      // 計算字幕群底下留白區域的中間點
      let midBlankY = subtitleBottom + 10;
      if (controlsEl) {
        const controlsRect = controlsEl.getBoundingClientRect();
        const controlsTop = window.scrollY + controlsRect.top;
        const gap = controlsTop - subtitleBottom;
        if (gap > 0) {
          midBlankY = subtitleBottom + gap / 2;
        }
      }

      // 定位後的底部對齊字幕群底下空白的中間 (window.scrollY + window.innerHeight = midBlankY)
      let targetScrollY = midBlankY - window.innerHeight;

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

  // 正下方顯示的即時字幕群（預設 4 句，目前 timecode 對應第二句，容錯時間延遲並方便提前預讀）
  const currentGroupLines = useMemo(() => {
    if (parsedLines.length === 0) return [];
    const offset = groupSize >= 2 ? 1 : 0;
    const baseIdx = Math.max(0, activeIndex >= 0 ? activeIndex - offset : 0);
    return parsedLines.slice(baseIdx, baseIdx + groupSize);
  }, [parsedLines, activeIndex, groupSize]);

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
    setCurrentTime(sec);
    if (typeof targetIdx === 'number') {
      setActiveIndex(targetIdx);
    }
  }, []);

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
          setCurrentTime(time);
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
            cc_load_policy: 0, // 預設關閉 YouTube 原生字幕，防止干擾
            iv_load_policy: 3,  // 關閉註解
          },
          events: {
            onReady: () => {
              if (!isMounted) return;
              setIsPlayerReady(true);
              startProgressLoopRef.current();
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
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
  const filteredLines = parsedLines.filter(line => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return line.text.toLowerCase().includes(kw) || line.speaker.toLowerCase().includes(kw);
  });

  const activeLine = activeIndex >= 0 ? parsedLines[activeIndex] : null;

  return (
    <div className="w-full">
      {/* 劇院居中主容器 (Option B) */}
      <div className="max-w-4xl mx-auto flex flex-col gap-5">

        {/* 1. 居中 YouTube 播放器 (16:9) - 保持純淨，無任何覆蓋層，時間軸 100% 原生流暢 */}
        {videoId && (
          <div
            id="transcript-player-stage"
            ref={theaterRef}
            className="scroll-mt-20 relative w-full aspect-video bg-black rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl"
          >
            <div id="transcript-yt-player" className="w-full h-full"></div>
          </div>
        )}

        {/* 2. 【核心亮點】：影片正下方「即時字幕群卡片」（可自訂 1~5 句） */}
        {showOverlay && currentGroupLines.length > 0 && (
          <div
            id="transcript-subtitle-group"
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-lg flex flex-col gap-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
              <span className="flex items-center gap-1.5 font-bold text-zinc-700 dark:text-zinc-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                即時字幕群 ({groupSize}句同步)
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] text-zinc-400">顯示句數：</span>
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
                          ? 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-zinc-950 shadow-sm'
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

            {/* 方案 C：無框對話流（劇本台詞風，消除多餘方框） */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 flex flex-col">
              {currentGroupLines.map((line) => {
                const isHost = line.speaker === '福嶋晴菜';

                return (
                  <div
                    key={line.index}
                    onClick={() => seekTo(line.seconds, line.index)}
                    className="group py-2.5 sm:py-3 px-2 sm:px-3 flex items-start gap-3 sm:gap-4 rounded-xl cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-all duration-200"
                  >
                    {/* 時間戳播放按鈕 */}
                    <div className="shrink-0 pt-0.5">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-xs font-semibold bg-zinc-100 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/60 group-hover:bg-emerald-500 group-hover:text-zinc-950 group-hover:border-emerald-400 transition-all shadow-sm"
                        title="點擊跳轉影片至此秒數"
                      >
                        <Play size={10} className="fill-current" />
                        <span>{line.time}</span>
                      </span>
                    </div>

                    {/* 對話內文 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`font-bold text-xs px-2 py-0.5 rounded-full border ${
                            isHost
                              ? 'bg-purple-500/10 text-brand-purple border-purple-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {line.speaker}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base leading-relaxed m-0 text-zinc-900 dark:text-zinc-100 font-medium">
                        {line.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. 控制與導航列 */}
        <div
          id="transcript-controls"
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm"
        >
          
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* 播放進度 */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">目前進度:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                {formatSeconds(currentTime)}
              </span>
            </div>

            {/* API 連線標籤 */}
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{isPlayerReady ? '雙向同步連動中' : '連線播放器中...'}</span>
            </div>

            {/* 畫面定位按鈕 */}
            <button
              type="button"
              onClick={scrollToTheaterView}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-2.5 sm:px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 transition shadow-sm hover:scale-105 active:scale-95"
              title="畫面定位：一鍵將畫面視角平滑置中對齊至播放器與字幕"
            >
              <Crosshair size={13} />
              <span>畫面定位</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* 字幕群開關 */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white">
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
              />
              <span>即時字幕群 ({groupSize}句)</span>
            </label>

            {/* 展開抽屜主按鈕 */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-xl transition shadow-md hover:scale-105"
            >
              <Search size={14} />
              <span>展開完整逐字稿與搜尋 ({parsedLines.length} 句)</span>
            </button>
          </div>

        </div>

      </div>

      {/* 4. 常駐畫面右側邊緣的懸浮快捷按鈕群（僅 xl 以上顯示：字幕群卡片最寬 max-w-4xl，視窗小於 1280px 時懸浮鈕會壓到卡片，故改用下方控制列的同功能按鈕） */}
      <div className="hidden xl:flex fixed right-5 top-1/2 -translate-y-1/2 z-40 flex-col gap-2.5">
        {/* 畫面定位按鈕 */}
        <button
          type="button"
          onClick={scrollToTheaterView}
          className="bg-white/95 dark:bg-zinc-900/95 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold p-3 rounded-2xl shadow-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 border border-emerald-200 dark:border-emerald-800/60 backdrop-blur group"
          title="畫面定位：一鍵平滑滾動畫面對齊至播放器與字幕"
        >
          <Crosshair size={18} className="text-emerald-600 dark:text-emerald-400 transition group-hover:rotate-45" />
          <span className="text-[10px] tracking-wider [writing-mode:vertical-lr] font-bold">
            畫面定位
          </span>
        </button>

        {/* 逐字稿抽屜按鈕 */}
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 py-3.5 rounded-2xl shadow-2xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 border border-emerald-300/40 group"
          title="展開逐字稿抽屜 (支援全文搜尋)"
        >
          <FileText size={18} className="text-zinc-950 transition group-hover:rotate-6" />
          <span className="text-[11px] tracking-wider [writing-mode:vertical-lr] font-black">
            逐字稿抽屜
          </span>
          <span className="text-[10px] bg-zinc-950 text-emerald-400 px-1.5 py-0.2 rounded-full font-mono font-bold">
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
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[500px] md:w-[540px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* 抽屜頂部 Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">完整逐字稿列表</h2>
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-full font-mono font-medium">
              {parsedLines.length} 句
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
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
                className={`group flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl cursor-pointer transition-all duration-200 border ${
                  isActive
                    ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/90 dark:bg-emerald-500/10 shadow-[0_0_16px_rgba(52,211,153,0.12)]'
                    : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                {/* 時間戳播放按鈕 */}
                <div className="shrink-0 pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-zinc-950 shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 group-hover:bg-emerald-500 group-hover:text-white dark:group-hover:bg-emerald-400 dark:group-hover:text-zinc-950'
                    }`}
                    title="點擊跳轉影片至此秒數"
                  >
                    <Play size={10} className="fill-current" />
                    <span>{line.time}</span>
                  </span>
                </div>

                {/* 對話內文 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-bold text-xs px-2 py-0.5 rounded-full border ${
                        isHost
                          ? 'bg-purple-500/10 text-brand-purple border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {line.speaker}
                    </span>
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

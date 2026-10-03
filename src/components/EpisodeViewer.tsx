'use client';

import { useState } from 'react';
import { EpisodeData } from '@/lib/markdown';
import { toSeconds } from '@/lib/clips';
import dynamic from 'next/dynamic';
import TextMode from './TextMode';
import ClipsMode from './ClipsMode';

const CardMode = dynamic(() => import('./CardMode'), { 
  ssr: false, 
  loading: () => <div className="w-full h-[500px] flex items-center justify-center text-zinc-500">載入中...</div> 
});
import { LayoutGrid, AlignLeft, Crosshair } from 'lucide-react';

import TranscriptMode from './TranscriptMode';

export default function EpisodeViewer({ episode }: { episode: EpisodeData }) {
  const [viewType, setViewType] = useState<'summary' | 'lossless' | 'clips' | 'transcript'>('summary');
  const [isCardMode, setIsCardMode] = useState(false);
  // 精華分頁的「播放」「查看圖卡」帶過去的起點；自己點分頁或切圖卡／文字就清掉，下次進去從頭
  const [startAt, setStartAt] = useState<number>();
  const [cardStartClip, setCardStartClip] = useState<number>();

  const pickView = (view: typeof viewType) => {
    setViewType(view);
    setStartAt(undefined);
    setCardStartClip(undefined);
  };
  const pickCardMode = (on: boolean) => {
    setIsCardMode(on);
    setCardStartClip(undefined);
  };

  // 畫面視角定位：底部對齊字幕群底下 10px，剛好露出上方影片時間軸（免手動滑動滾輪）
  const scrollToPlayerStage = () => {
    const tryScroll = () => {
      const subtitleEl = document.getElementById('transcript-subtitle-group');
      const playerEl = document.getElementById('transcript-player-stage');

      if (subtitleEl) {
        const subtitleRect = subtitleEl.getBoundingClientRect();
        const subtitleBottom = window.scrollY + subtitleRect.bottom;

        let targetScrollY = subtitleBottom + 10 - window.innerHeight;
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
        return true;
      } else if (playerEl) {
        playerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    if (!tryScroll()) {
      setTimeout(tryScroll, 100);
      setTimeout(tryScroll, 300);
    }
  };

  return (
    <div className="mx-auto pt-4 sm:pt-5 pb-10 px-4 transition-all duration-300 max-w-4xl">
      {/* Header */}
      <header className="mb-5 sm:mb-6 flex flex-col items-center w-full">
        <div className="flex flex-wrap justify-center gap-3 mb-3.5 sm:mb-4">
          <span className="px-6 py-2 bg-brand-purple/10 dark:bg-zinc-800 text-brand-purple rounded-full text-lg font-bold tracking-wider">
            第 {episode.episodeNumber} 回
          </span>
          <span className={`px-6 py-2 rounded-full text-lg font-bold tracking-wider shadow-sm ${episode.guest ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'}`}>
            {episode.guest ? `來賓：${episode.guest}` : '個人回'}
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3.5 sm:mb-4 text-center leading-tight">{episode.title}</h1>
        
        <div className="w-full max-w-2xl flex items-center justify-center gap-4">
          {/* 左側漸層線條 */}
          <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-brand-purple/50"></div>
          {/* 日期 (置中) */}
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium whitespace-nowrap tracking-wider">
            {episode.date} 配信
          </p>
          {/* 右側漸層線條 */}
          <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-brand-purple/50"></div>
        </div>
      </header>

      {/* Toolbar Area */}
      <div className="w-full flex flex-col lg:flex-row gap-4 mb-6">
        {/* YouTube Link */}
        {episode.youtubeUrl && (
          <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:px-5 flex items-center justify-between shadow-sm transition-colors">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/10 text-red-500 p-2.5 rounded-full flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 whitespace-nowrap">官方 YouTube 收聽</h3>
            </div>
            <a 
              href={episode.youtubeUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 text-red-700 dark:text-red-400 font-bold rounded-xl transition-colors text-sm whitespace-nowrap ml-2 flex-shrink-0 shadow-sm border border-red-200 dark:border-red-500/30"
            >
              前往
            </a>
          </div>
        )}

        {/* Control Panel */}
        <div className="flex-1 lg:flex-none relative z-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:px-5 flex flex-col sm:flex-row justify-between items-center gap-2 lg:gap-3 shadow-sm overflow-x-auto">
          
          {/* Content Toggle */}
          <div className="flex w-full sm:w-auto bg-zinc-100 dark:bg-zinc-950 p-1.5 rounded-xl shrink-0 min-w-min">
            <button
              onClick={() => pickView('summary')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${viewType === 'summary' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border-transparent dark:border-zinc-700/50' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
            >
              精簡總結
            </button>
            <button
              onClick={() => pickView('lossless')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${viewType === 'lossless' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border-transparent dark:border-zinc-700/50' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
            >
              段落紀錄
            </button>
            {episode.clips.length > 0 && (
              <button
                onClick={() => pickView('clips')}
                className={`flex-1 sm:flex-none px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${viewType === 'clips' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border-transparent dark:border-zinc-700/50' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
              >
                精華
              </button>
            )}
            <button
              onClick={() => {
                pickView('transcript');
                setTimeout(scrollToPlayerStage, 100);
              }}
              className={`flex-1 sm:flex-none px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${viewType === 'transcript' ? 'bg-[#ebdfff] dark:bg-brand-purple/20 text-brand-purple shadow-sm border-transparent dark:border-brand-purple/20' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
            >
              逐字稿
            </button>
          </div>

          {/* Mode Toggle 或 逐字稿畫面定位按鈕 */}
          {viewType === 'transcript' ? (
            <button
              type="button"
              onClick={scrollToPlayerStage}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl text-xs sm:text-sm border border-emerald-200 dark:border-emerald-800/60 transition shadow-sm hover:scale-105 active:scale-95"
              title="畫面定位：一鍵平滑滾動對齊至播放器與字幕視角（免自己滾動滾輪）"
            >
              <Crosshair size={15} />
              <span>畫面定位</span>
            </button>
          ) : (
            <div className="flex w-full sm:w-auto bg-zinc-100 dark:bg-zinc-950 p-1.5 rounded-xl shrink-0 min-w-min">
              <button
                onClick={() => pickCardMode(true)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${isCardMode ? 'bg-[#ebdfff] dark:bg-brand-purple/20 text-brand-purple shadow-sm border-transparent dark:border-brand-purple/20' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
              >
                <LayoutGrid size={18} strokeWidth={2.5} className="shrink-0" />
                <span className="whitespace-nowrap">圖卡</span>
              </button>
              <button
                onClick={() => pickCardMode(false)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 lg:px-3 py-2 rounded-lg font-bold transition-all text-sm border ${!isCardMode ? 'bg-[#ebdfff] dark:bg-brand-purple/20 text-brand-purple shadow-sm border-transparent dark:border-brand-purple/20' : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
              >
                <AlignLeft size={18} strokeWidth={2.5} className="shrink-0" />
                <span className="whitespace-nowrap">文字</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="w-full flex justify-center">
        {viewType === 'transcript' ? (
          <TranscriptMode episode={episode} startAt={startAt} />
        ) : isCardMode ? (
          <CardMode key={viewType} episode={episode} view={viewType} startClip={cardStartClip} />
        ) : viewType === 'clips' ? (
          <ClipsMode
            episode={episode}
            onPlay={(clip) => {
              setStartAt(toSeconds(clip.start));
              setViewType('transcript');
              setTimeout(scrollToPlayerStage, 100);
            }}
            onCards={(index) => {
              setCardStartClip(index);
              setIsCardMode(true);
            }}
          />
        ) : (
          <TextMode episode={episode} isLossless={viewType === 'lossless'} />
        )}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import type { EpisodeListItem } from '@/lib/markdown';
import { useHomeLayout } from './HomeLayoutProvider';

export default function HomeEpisodeList({ episodes }: { episodes: EpisodeListItem[] }) {
  const { isTimeline, isDateInside, isCompact } = useHomeLayout();
  
  // The episodes are already sorted from the source

  return (
    <div className="max-w-4xl mx-auto mb-20">
      {/* 列表區塊 */}
      <div className="relative">
        <div className="flex flex-col gap-6 sm:gap-8">
          {episodes.map((ep, index) => {
            const isLatest = index === 0;

            return (
              <div key={ep.id} className={`flex relative group transition-all duration-300 ${isTimeline ? 'gap-0 sm:gap-4' : 'gap-0'}`}>
                {/* 左側外部日期 */}
                <div className={`hidden sm:flex shrink-0 items-start text-right overflow-hidden transition-all duration-500 ${isTimeline && !isDateInside ? 'w-24 md:w-28 opacity-100 pr-3 pt-[26px]' : 'w-0 opacity-0 pr-0 pt-0'}`}>
                  <div className={`font-medium tracking-wide text-sm transition-colors ml-auto whitespace-nowrap ${isLatest ? 'text-brand-purple' : 'text-zinc-500 dark:text-zinc-400 group-hover:text-brand-purple'}`}>
                    {ep.date}
                  </div>
                </div>

                {/* 中央時間軸節點與線 */}
                <div className={`relative flex flex-col shrink-0 transition-all duration-500 ${isTimeline ? 'w-6 sm:w-8 opacity-100 mr-3 sm:mr-4' : 'w-0 opacity-0 mr-0 pointer-events-none'}`}>
                  {/* 節點圓圈 (固定 Y 軸: top 36px) */}
                  <div className={`
                    absolute top-[36px] -translate-y-1/2 left-1/2 -translate-x-1/2 rounded-full z-10 ring-4 ring-slate-50 dark:ring-zinc-950 transition-all duration-300 
                    ${isLatest ? 'w-5 h-5 bg-brand-green' : 'w-4 h-4 bg-zinc-300 dark:bg-zinc-700 group-hover:bg-brand-purple'}
                  `}></div>

                  {/* 連接下一集的垂直線 (起點 36px, 終點跨越 Gap 抵達下一個 36px：36 + 列表 gap 24/32) */}
                  <div className={`absolute w-1 left-1/2 -translate-x-1/2 transition-all duration-300 z-0 ${
                    index === episodes.length - 1
                      ? 'top-[36px] h-32 bg-gradient-to-b from-zinc-200 dark:from-zinc-800 to-transparent'
                      : (isLatest
                          ? 'top-[36px] bottom-[-60px] sm:bottom-[-68px] bg-gradient-to-b from-brand-green to-zinc-200 dark:to-zinc-800'
                          : 'top-[36px] bottom-[-60px] sm:bottom-[-68px] bg-zinc-200 dark:bg-zinc-800 group-hover:bg-brand-purple/50')
                  }`}></div>
                </div>

                {/* 右側卡片內容 */}
                <div className="flex-1 transition-all duration-300 min-w-0">
                  {/* 手機版或外部日期顯示 (當 isDateInside 為 false 時才顯示) */}
                  {!isDateInside && (
                    <div className={`
                      font-medium tracking-wide mb-2 transition-all duration-300
                      ${isTimeline ? 'sm:hidden pt-6' : 'block pt-2'}
                      ${isLatest ? 'text-brand-purple' : 'text-zinc-500 dark:text-zinc-400'}
                    `}>
                      {ep.date} {isLatest && <span className="text-xs text-zinc-400 font-normal ml-2">最新發布</span>}
                    </div>
                  )}
                  
                  <Link href={`/episodes/${ep.id}`} className={`block bg-white dark:bg-zinc-900 rounded-2xl transition-all duration-300 relative overflow-hidden group/card
                    ${isCompact ? 'p-4 md:p-5' : 'p-6 md:p-8'}
                    border border-zinc-200 dark:border-zinc-800 hover:shadow-lg hover:-translate-y-1 hover:border-brand-green/30 dark:hover:border-brand-green/30
                  `}>
                    {/* 特效光暈 */}
                    
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4 relative z-10 transition-all duration-300">
                        <div className="flex flex-wrap gap-2">
                            {/* Option A (Modified): Latest is bright green, others are original purple */}
                            {isLatest ? (
                              <span className="bg-brand-green text-white px-4 py-1.5 rounded-full text-sm font-bold tracking-wider shadow-sm transition-colors">
                                  第 {ep.episodeNumber} 回
                              </span>
                            ) : (
                              <span className="bg-brand-purple/10 dark:bg-zinc-800 text-brand-purple px-4 py-1.5 rounded-full text-sm font-bold tracking-wider transition-colors">
                                  第 {ep.episodeNumber} 回
                              </span>
                            )}
                            <span className={`px-4 py-1.5 rounded-full text-sm font-bold tracking-wider ${ep.guest ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'}`}>
                                {ep.guest ? `來賓：${ep.guest}` : '個人回'}
                            </span>
                        </div>
                        
                        {/* 內部日期 (原版樣式，當 isDateInside 為 true 時顯示) */}
                        {isDateInside && (
                          <div className="text-zinc-500 dark:text-zinc-400 text-sm font-medium tracking-wide whitespace-nowrap mt-2 sm:mt-0">
                              {ep.date} {isLatest && <span className="text-xs text-brand-purple ml-1">最新</span>}
                          </div>
                        )}
                    </div>
                    
                    <h2 className={`font-bold text-zinc-900 dark:text-zinc-100 group-hover/card:text-brand-green transition-all duration-300 leading-snug relative z-10 
                      ${isCompact ? 'text-xl md:text-xl mb-0' : 'text-2xl md:text-3xl mb-4'}
                    `}>
                        {ep.title}
                    </h2>
                    
                    <div className={`transition-all duration-300 overflow-hidden relative z-10 ${isCompact ? 'max-h-0 opacity-0' : 'max-h-[200px] opacity-100 mt-4'}`}>
                        <p className="text-zinc-600 dark:text-zinc-400 text-base md:text-lg line-clamp-2 leading-relaxed">
                            {ep.summary || '點擊查看本集精華與完整文字紀錄。'}
                        </p>
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

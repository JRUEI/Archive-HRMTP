'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { Menu, PlayCircle } from 'lucide-react';
import { XIcon } from './BrandIcons';
import { useEffect, useState, useRef } from 'react';
import { useFocusMode } from './FocusModeProvider';
import { useHomeLayout } from './HomeLayoutProvider';
import { useHydrated } from '@/lib/client-state';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const { isFocusMode, toggleFocusMode } = useFocusMode();
  const { isTimeline, setIsTimeline, isDateInside, setIsDateInside, isCompact, setIsCompact } = useHomeLayout();
  const pathname = usePathname();
  const isHome = pathname === '/';

  const mounted = useHydrated();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close dropdown on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
      {/* 外層比照內文外框，內層再收到 max-w-4xl，讓頁首左右緣對齊集數列表 */}
      <div className="max-w-6xl mx-auto px-6">
      <div className="max-w-4xl mx-auto h-14 md:h-16 flex items-center justify-center relative">
        {/* 站名置中，與下方標語同一條中線 */}
        <Link
          href="/"
          className="text-lg md:text-2xl font-black tracking-tight whitespace-nowrap transition-opacity hover:opacity-80"
        >
          <span className="hidden sm:inline text-zinc-900 dark:text-white">福嶋晴菜の</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-green">
            「はるまとぺーじ」
          </span>
        </Link>

        {/* 右上角：外部連結與設定收合成一份清單 */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full transition-all shadow-sm focus:outline-none hover:-translate-y-0.5 hover:shadow-md ${isOpen ? 'bg-brand-purple text-white shadow-brand-purple/20' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-brand-purple dark:hover:text-brand-purple hover:bg-brand-purple/10 dark:hover:bg-brand-purple/20'}`}
              title="選單"
              aria-label="Toggle Menu"
              aria-expanded={isOpen}
            >
              <Menu size={18} />
            </button>

            {/* Dropdown Menu */}
            <div className={`absolute top-full right-0 mt-2 w-56 sm:w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 origin-top-right transition-all duration-200 p-2 sm:p-3 ${isOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible'}`}>
                <div className="px-3 pb-2 pt-1 border-b border-zinc-100 dark:border-zinc-800 mb-2">
                    <span className="text-xs font-black text-zinc-400 dark:text-zinc-500 tracking-wider">外部連結</span>
                </div>

                <div className="flex flex-col gap-1">
                    <a
                      href="https://www.youtube.com/playlist?list=PLR2DEPLZ9lvFrj9JFZJtRgCSS1gJb3Dvd"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors"
                    >
                        <span className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full bg-red-100 text-red-800 dark:bg-red-500/30 dark:text-red-300">
                          <PlayCircle size={14} />
                        </span>
                        <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">YouTube 播放清單</span>
                    </a>

                    <a
                      href="https://x.com/voradi_official"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors"
                    >
                        <span className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          <XIcon size={12} />
                        </span>
                        <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">官方 X</span>
                    </a>
                </div>

                {mounted && (
                  <>
                    <div className="px-3 pb-2 pt-1 border-t border-zinc-100 dark:border-zinc-800 mt-2 mb-2">
                        <span className="text-xs font-black text-zinc-400 dark:text-zinc-500 tracking-wider">排版與主題設定</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {isHome && (
                        <>
                          <label className="flex justify-between items-center cursor-pointer group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors">
                              <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">時間軸</span>
                              <div className="relative">
                                  <input type="checkbox" className="sr-only" checked={isTimeline} onChange={() => setIsTimeline(!isTimeline)} />
                                  <div className={`block w-10 sm:w-11 h-6 rounded-full shadow-inner transition-colors duration-300 ${isTimeline ? 'bg-brand-purple' : 'bg-zinc-200 dark:bg-zinc-700'}`}></div>
                                  <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300 ease-in-out ${isTimeline ? 'left-[calc(100%-1.25rem)] sm:left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
                              </div>
                          </label>

                          <label className="flex justify-between items-center cursor-pointer group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors">
                              <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">日期顯示於卡片外</span>
                              <div className="relative">
                                  <input type="checkbox" className="sr-only" checked={!isDateInside} onChange={() => setIsDateInside(!isDateInside)} />
                                  <div className={`block w-10 sm:w-11 h-6 rounded-full shadow-inner transition-colors duration-300 ${!isDateInside ? 'bg-brand-purple' : 'bg-zinc-200 dark:bg-zinc-700'}`}></div>
                                  <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300 ease-in-out ${!isDateInside ? 'left-[calc(100%-1.25rem)] sm:left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
                              </div>
                          </label>

                          <label className="flex justify-between items-center cursor-pointer group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors">
                              <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">預設展開卡片</span>
                              <div className="relative">
                                  <input type="checkbox" className="sr-only" checked={!isCompact} onChange={() => setIsCompact(!isCompact)} />
                                  <div className={`block w-10 sm:w-11 h-6 rounded-full shadow-inner transition-colors duration-300 ${!isCompact ? 'bg-brand-purple' : 'bg-zinc-200 dark:bg-zinc-700'}`}></div>
                                  <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300 ease-in-out ${!isCompact ? 'left-[calc(100%-1.25rem)] sm:left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
                              </div>
                          </label>
                        </>
                      )}

                      {!isHome && (
                        <label className="flex justify-between items-center cursor-pointer group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors">
                            <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">發光特效</span>
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={isFocusMode} onChange={toggleFocusMode} />
                                <div className={`block w-10 sm:w-11 h-6 rounded-full shadow-inner transition-colors duration-300 ${isFocusMode ? 'bg-brand-purple' : 'bg-zinc-200 dark:bg-zinc-700'}`}></div>
                                <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300 ease-in-out ${isFocusMode ? 'left-[calc(100%-1.25rem)] sm:left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
                            </div>
                        </label>
                      )}

                      <label className={`flex justify-between items-center cursor-pointer group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 rounded-lg transition-colors ${isHome ? 'border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-2' : ''}`}>
                          <span className="text-sm font-bold transition-colors text-zinc-700 dark:text-zinc-300 group-hover:text-brand-purple">亮色主題</span>
                          <div className="relative">
                              <input type="checkbox" className="sr-only" checked={theme === 'light'} onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
                              <div className={`block w-10 sm:w-11 h-6 rounded-full shadow-inner transition-colors duration-300 ${theme === 'light' ? 'bg-amber-400' : 'bg-zinc-200 dark:bg-zinc-700'}`}></div>
                              <div className={`absolute top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300 ease-in-out ${theme === 'light' ? 'left-[calc(100%-1.25rem)] sm:left-[calc(100%-1.25rem)]' : 'left-1'}`}></div>
                          </div>
                      </label>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </nav>
  );
}

import { getAllEpisodeListItems } from '@/lib/markdown';
import HomeEpisodeList from '@/components/HomeEpisodeList';

export default function Home() {
  const episodes = getAllEpisodeListItems();

  return (
    <div className="max-w-6xl mx-auto px-6 pt-10 sm:pt-16 md:pt-3 pb-10 sm:pb-16">
      {/* 站名已移至頁首；說明文字改放在頁首與首卡之間，與置中的站名同一條中線 */}
      <p className="hidden md:block mb-3 text-center text-xs font-medium tracking-wider text-zinc-500 dark:text-zinc-400">
        非公式節目內容檔案庫・全 10 回收錄
      </p>

      {/* Episodes List */}
      <HomeEpisodeList episodes={episodes} />
    </div>
  );
}

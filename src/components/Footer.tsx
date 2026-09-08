import { GithubIcon } from './BrandIcons';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      {/* 外層比照內文外框，內層收到 max-w-4xl，與頁首和集數列表共用同一組左右緣 */}
      <div className="max-w-6xl mx-auto px-6 py-10 sm:py-12">
        <div className="max-w-4xl mx-auto flex flex-col gap-7">

          {/* 站名與原始碼連結 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-base font-black tracking-tight">
              <span className="text-zinc-900 dark:text-white">福嶋晴菜の</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-brand-green">
                「はるまとぺーじ」
              </span>
            </div>

            <a
              href="https://github.com/JRUEI/Archive-HRMTP"
              target="_blank"
              rel="noopener noreferrer"
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-brand-purple dark:hover:text-brand-purple hover:border-brand-purple/40 dark:hover:border-brand-purple/40 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <GithubIcon size={16} />
              原始碼 · GitHub
            </a>
          </div>

          {/* 免責聲明 */}
          <div className="border-t border-zinc-100 dark:border-zinc-900 pt-6">
            <h2 className="text-xs font-black tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              免責聲明
            </h2>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              <li>
                本專案為粉絲自製的<span className="font-bold text-zinc-700 dark:text-zinc-300">非官方（非公式）</span>
                內容整理與影音檔案庫，與福嶋晴菜本人及節目相關權利方均無隸屬或合作關係。
              </li>
              <li>
                本站重製之文字內容僅供粉絲學習、推廣與文化交流之用，著作權均歸原權利人所有。
              </li>
              <li>
                若權利人對本站內容有任何疑慮，請透過{' '}
                <a
                  href="https://github.com/JRUEI/Archive-HRMTP/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:underline underline-offset-4 font-medium"
                >
                  GitHub Issue
                </a>{' '}
                告知，將儘速配合處理。
              </li>
            </ul>
          </div>

        </div>
      </div>
    </footer>
  );
}

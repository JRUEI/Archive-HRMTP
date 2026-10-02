# Agent 工作流

給接手的 AI session 用。這裡只寫「做過、驗證過、會再用到」的東西，不寫計畫。
版面比較、方案提案一律做成 `docs/demos/demo_xxx.html`，不要寫成 Markdown 報告。

## 1. 部署事實

- Repo：`JRUEI/Archive-HRMTP`（**public**）。舊 repo 已刪除，沒有轉址。
- 站台：<https://jruei.github.io/Archive-HRMTP/>，GitHub Pages，只從 `main` 發佈
  （`.github/workflows/deploy.yml`，`on: push: branches: ["main"]`）。
- `next.config.ts` 的 `repoName` 必須等於 repo 名。改名沒同步改這裡 → 全站資產 404。
  `output: 'export'` 與 `basePath` 都只在 `GITHUB_ACTIONS` 有值時開啟。
- **不要加 `robots.ts`。** Pages 是子路徑站（`/Archive-HRMTP/`），爬蟲只認網域根目錄的
  `jruei.github.io/robots.txt`，那個路徑屬於別的 repo，我們寫不到。有效機制是
  `src/app/layout.tsx` 的 `metadata.robots`，它會產出 `<meta name="robots">` 與 `googlebot`。
- `public/` 底下的靜態 HTML **不經過 Next 的 metadata**，noindex 要自己寫進 `<head>`。
  目前只有 `public/shorts-catalog.html` 會進 CI；`/public/*_demo.html` 被 `.gitignore` 擋掉。

## 2. 量測與截圖

Browser pane 的截圖是全黑的，不要用。可行路徑是 headless Chrome + CDP：

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --remote-debugging-port=9222 --user-data-dir=<scratchpad>/cdp-prof
```

然後在 Node 24 用內建 `WebSocket`（不需要裝套件）：

1. `fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })` 開分頁
2. `Page.enable` / `Runtime.enable`
3. `Emulation.setDeviceMetricsOverride`（1280 桌機、375 手機）
4. `Page.navigate` → 等 `Page.loadEventFired` → **再多等 2.5–4 秒**（webfont 與 client component）
5. `Page.getLayoutMetrics` 取 `cssContentSize.height`
6. `Page.captureScreenshot { captureBeyondViewport: true, clip: {...} }`

CDP 的寫法照抄 `scripts/card-probe.mjs`（開分頁、等 `loadEventFired`、把函式丟進頁面執行）。
scratchpad 的檔案不會留到下個 session（以前的範本都已不在），要留下來的腳本放 `scripts/`。

量測注意：

- `innerWidth / 2 = 640` 是假中線，含捲軸。1280 視窗下內容欄真正的中線是 **633**。
- 先講數字再動手。改版面前後都量，兩組數字一起報。

圖卡（`CardMode.tsx`）改了字級、內文框寬、頁尾或折行估算，要重量。開好 headless Chrome 與 `npm run dev` 後：

```bash
node scripts/card-probe.mjs [輸出.json] [1-12]   # 每集一行：內容卡張數、被切開的段落、溢出、餘裕
```

它逐集切到「圖卡 → 段落紀錄」與「精簡總結」，量隱藏匯出容器裡每張 1080×1920 原尺寸卡，有溢出就 exit 1。

- 內容卡：每張 `.export-card` 的 `scrollHeight - clientHeight` 要是 0。
- 精簡總結：看 `z-index: 10` 內層的餘裕 `clientHeight - 160 - offsetHeight`，要 ≥ 0。
  左下裝飾圓（`bottom: -10%`）會撐大 `scrollHeight`，不能拿來判斷。
- dev server 的網址要有結尾 `/`（`/episodes/ep12/`），少了會 308。
- 分頁不量 DOM，靠 `lineCount` 逐字模擬折行：全形字 1 字寬；`，。」）…` 等不放行首、`「（《` 等不放行尾；
  英數字連成一段不拆、`——` 不拆；行尾空白不佔寬。英數字寬度取 iPhone（SF Pro）與 Noto Sans TC 中偏寬的值。
- 2026-09 實測：12 回 1,354 個條目 0 低估；字級從 1.0 縮到 0.7（精簡總結到 0.6）重排 32,003 次也是 0 低估。
  舊公式 `ceil(字寬 / (floor(欄寬 / 字級) - 0.5))` 縮字級時會低估 10 段（會被裁字），
  又會把剛好排滿的段落多估一行，6 個段落因此被多切一張（內容卡 329 → 323）。
- 還會多估的只有含英數字的條目（故意估寬），以及 `SAFETY = 24`：常見的「4 條各 3 行 + 1 行引用」實際 1,189px，
  1 行標題的預算是 1,172.6px，所以會切成兩張。
- Chrome 153 與 Safari 的 `text-autospace` 預設都是 `no-autospace`（中英之間不自動加空隙）。
  規格預設是 `normal`，哪天瀏覽器跟進，中英交界各多 1/8 字寬，`lineCount` 要跟著加。

## 3. Demo HTML 規範

`docs/demos/demo_xxx.html`，單檔、可直接開。已驗證的做法：

- 間距做成真的 `<div class="gapband" data-who data-px>`，用 `getBoundingClientRect()` 量，
  **量完才套 `transform: scale(k)`**；標尺畫在沒被縮放的 overlay 上。
- `.mock` 一定要自己寫死 `width: 1280px`。少了它，外層 `.vp` 一縮，mock 的排版寬度會跟著塌，
  量到的比例會整組錯掉（踩過：k 量成 0.1759，實際應為 0.42）。
- 視窗高度用 `Math.ceil(fullH * SCALE) + 1`。少那個 `+1`，最後一列會被裁掉 1px。
- 產 Tailwind class 的對照表要注意前綴：傳 `'md:pt'`、`'mb'`，不要傳結尾已有連字號的字串，
  否則會生出 `md:pt--8`。非整數階的值走 `prefix + '-[' + n + 'px]'`。

## 4. 內容批次改寫

`content/episodes/*.md` 是本專案唯一的資料來源，動它之前**必須先讀、先取得同意**。流程：

1. 先備份到 scratchpad（`tc-backup-<timestamp>/`）。
2. 正規表示式收窄到只吃該吃的（例：`/\[00:(\d{2}):(\d{2})\]/g`，小時位非 `00` 的一律不碰）。
3. 自我檢查：算出預期字元差（每次替換少 3 個字元 → `3n`），跟實際 `src.length - out.length` 比。
4. 正規化 diff：把兩邊的目標樣式全部抹平後逐字比對，證明**其餘內容 byte 相同**。
5. `git diff --stat` 的增刪行數要跟替換次數對得上。

2,068 筆時間碼轉換就是照這個流程做的。

## 5. 編碼與工具禁忌

- **不要對 CJK 內容用 `sed`。** 一律寫 `.mjs`，`readFileSync(f, 'utf8')` / `writeFileSync(f, s, 'utf8')`。
- **不要把正則塞進 `node -e` 或 shell heredoc。** 反斜線會被吃掉。用 Write 工具把檔案寫進
  scratchpad 再 `node` 執行。
- 暫存一律放 scratchpad，不要落進 repo。

## 6. 不可亂動

- `src/components/TranscriptMode.tsx` 的 `const isHost = line.speaker === '福嶋晴菜';`
  （目前 495 與 734 行，字幕群與抽屜各一處）是承重的，改名會讓主持人樣式整組失效。
- 說話者標記工具（`SpeakerMarks.tsx` + `src/app/api/speakers/route.dev.ts`）只在 `npm run dev` 出現。
  `.dev.ts` 靠 `next.config.ts` 的 `pageExtensions` 才被當成路由，而且**只能在非 GitHub Actions 時設定**：
  `GITHUB_ACTIONS=1` 建置時就算寫成預設值 `['tsx','ts','jsx','js']`，Turbopack 也會噴 324 個
  `next/font/google queries have exactly one entry` 而失敗。
- 品牌色只能改 `src/app/globals.css` 的 `:root` 變數（`--color-brand-purple` / `--color-brand-green`，
  light/dark 兩組），**不准寫死在 component 裡**。
- 時間碼統一 `MM:SS`。`timeToSeconds()` 兩種格式都吃，但顯示端只輸出 `MM:SS`，
  寫回 Markdown 時不要又長出小時位。`content/*.ja.vtt` 是 WebVTT 規格，不在此列。
- 版面基準：首頁卡片間距 `gap-6 sm:gap-8`（桌機 32px）；標語上下留白 16/16
  （`md:pt-4` + `mb-4`），是使用者選定的值。

## 7. 驗證清單

改完照這個順序，每一步都要看到結果再往下：

```bash
npm run verify                     # lint + typecheck + build，要零 error、零 warning
GITHUB_ACTIONS=1 npm run build     # 要能產出 out/
grep -rl "noindex" out --include=*.html | wc -l   # 要等於 HTML 頁數（目前 21）；不加 --include 會連 RSC 的 .txt 一起算
git push
gh run watch                       # build ✓ 且 deploy ✓
curl -sI https://jruei.github.io/Archive-HRMTP/
```

## 8. 已知未解

- ep04 的五列 `[工作人員]`（38:15、38:39、43:32、43:40、44:08）是照上下文判斷，字幕沒有說話者。
- 字幕聽不出來、別回也對不上的名字寫成「……」：ep05 35:39、37:56、38:56（冰淇淋撲克的牌），ep09 09:40（字幕「しおりば葉さん」）、10:05（劇本作者，字幕「おさん」），ep10 24:01（字幕「しさん」）、24:07 與 24:15（信裡對福嶋的稱呼，字幕「徳さん」「ゆこちゃんさん」，可能是福ちゃんさん），ep12 23:38（字幕只剩「ネームさん」）。查法：`Select-String -Path content\episodes\*.md -Pattern '……' -Encoding utf8`。
- たけのこの山是判斷：字幕 9 次聽成たのこの山，但慢慢唸的幾次都是たけのこの山。
- 圖卡的 `var(--font-serif)`（標題、引用、大數字）沒有作用：`--font-serif` 寫在 globals.css 的 `@theme inline` 裡，
  實測 `:root` 上沒有這個變數，實際畫出來是無襯線字。要不要改成真的宋體由使用者決定；改了英數字寬度會變，要重量。

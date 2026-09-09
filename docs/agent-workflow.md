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

範本在 scratchpad 的 `shoot.mjs`（純截圖）與 `pillmeasure.mjs`（`getBoundingClientRect` 量測）。

量測注意：

- `innerWidth / 2 = 640` 是假中線，含捲軸。1280 視窗下內容欄真正的中線是 **633**。
- 先講數字再動手。改版面前後都量，兩組數字一起報。

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

範本：scratchpad 的 `shorten_tc.mjs`（2,068 筆時間碼轉換就是這樣做的）。

## 5. 編碼與工具禁忌

- **不要對 CJK 內容用 `sed`。** 一律寫 `.mjs`，`readFileSync(f, 'utf8')` / `writeFileSync(f, s, 'utf8')`。
- **不要把正則塞進 `node -e` 或 shell heredoc。** 反斜線會被吃掉。用 Write 工具把檔案寫進
  scratchpad 再 `node` 執行。
- 暫存一律放 scratchpad，不要落進 repo。

## 6. 不可亂動

- `src/components/TranscriptMode.tsx` 的 `const isHost = line.speaker === '福嶋晴菜';`
  （389 與 622 行）是承重的，改名會讓主持人樣式整組失效。
- 品牌色只能改 `src/app/globals.css` 的 `:root` 變數（`--color-brand-purple` / `--color-brand-green`，
  light/dark 兩組），**不准寫死在 component 裡**。
- 時間碼統一 `MM:SS`。`timeToSeconds()` 兩種格式都吃，但顯示端只輸出 `MM:SS`，
  寫回 Markdown 時不要又長出小時位。`content/*.ja.vtt` 是 WebVTT 規格，不在此列。
- 版面基準：首頁卡片間距 `gap-6 sm:gap-8`（桌機 32px）；標語上下留白 16/16
  （`md:pt-4` + `mb-4`），是使用者選定的值。

## 7. 驗證清單

改完照這個順序，每一步都要看到結果再往下：

```bash
GITHUB_ACTIONS=1 npm run build     # 要能產出 out/
grep -rl "noindex" out | wc -l     # 頁數要對得上
git push
gh run watch                       # build ✓ 且 deploy ✓
curl -sI https://jruei.github.io/Archive-HRMTP/
```

`npm run verify` 目前**過不了**，見下一節。

## 8. 已知未解

- `npm run lint` 有 3 個既存 `@typescript-eslint/no-explicit-any`
  （`TranscriptMode.tsx` 第 9、69、270 行）加 1 個 warning（第 332 行 `activeLine` 沒用到），
  連帶 `npm run verify` 失敗。`npm run build` 正常。
- 本機殘留分支：`feat/compact-header-wordmark`（已併入，`-d` 可刪）、
  `master`（`5a31732 Initial commit from Create Next App`，要 `-D`）。
- `content/ep08.ja.vtt` 仍缺。
- ep04 的四列 `[工作人員]` 沒有文本佐證。

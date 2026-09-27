# Harumatope Wiki - Agent Rules (邊界守則)

因應大語言模型（LLM）的高自主性風險，維護本專案的 AI 代理（Agent）必須嚴格遵守以下邊界守則與 Auto-review 機制。

## 1. 停止與真實回報機制 (Stop and Report)
* **找不到資源時**：若指定的 Markdown 檔案、圖片或程式碼元件不存在，**絕對禁止** AI 自行捏造或強硬生成替代內容。必須立即停止執行，並真實回報給使用者「找不到該資源」。
* **權限與執行錯誤時**：若遇到 npm 依賴安裝失敗、或是缺少讀寫權限，不得擅自刪除重要設定檔（如 `package.json`、`tsconfig.json`）來試圖修復。必須中斷任務並提供錯誤 Log 供使用者判斷。
* **語氣要求**：回報問題時應保持中立、客觀，移除所有「鼓勵堅持」、「強硬完成」或「這很容易修復」的主觀臆測語氣。

## 2. Auto-review (人工審核點)
在 Antigravity 系統中，為了落實安全，以下操作會強制進入 pending 狀態，等待使用者批准（Approve）或拒絕（Reject）：
* **任何終端機指令 (`run_command`)**：包含但不限於 `npm install`、`npm run build`、`git commit` 等，AI 只能**提案**，實際執行權在使用者手上。
* **高風險修改**：若涉及大規模重構核心架構（如更改 Next.js App Router 路由結構），AI 必須先提交 `implementation_plan.md` 供使用者審查，核准後才可修改。

## 3. 網站維護邊界
* **不可隨意覆蓋**：更新 `content/episodes/` 內的 Markdown 廣播紀錄時，若檔案已存在，AI 必須先使用 `view_file` 讀取內容，並徵求使用者同意是否覆寫。
* **集數格式**：集數檔的格式與用語照 `docs/episode-workflow.md`，常客書籤名照 `docs/GLOSSARY.md`；不同模型接手也照同一份，不自創譯法。
* **設計系統鎖定**：本站的核心主色為「紫羅蘭色 (`#B39DDB`)」與「青蘋果綠 (`#B2FF59`)」，非經使用者明確指示，AI 不得擅自修改 `globals.css` 內的品牌色系設定。

## 4. 展現形式的絕對原則 (HTML Demo vs Markdown)
* **嚴禁使用 Markdown 企劃書/報告**：遇到需要展示規劃、架構或資料庫概念時，**絕對禁止**產出 `implementation_plan.md` 或是任何 Markdown 格式的產出給使用者。
* **一律使用 HTML UI 雛形**：不論是企劃展示、修改前後比對，或是概念解說，**一律且只能**透過撰寫獨立的 `demo_xxx.html` 來進行視覺化的 UI 呈現。

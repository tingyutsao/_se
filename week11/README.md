# StudyBox · AI 讀書助手

> 把筆記貼進來,AI 幫你整理重點、出題考你、做成閃卡,再用圖表告訴你哪裡最需要複習。
>
> 全端網站,部署於 Cloudflare Workers,使用 D1 資料庫與 Workers AI。

| 欄位 | 內容 |
| --- | --- |
| 課程 | 現代軟體工程(課程名稱 / 學期) |
| 作業 | 期末專案 |
| 學生 | (姓名) |
| 學號 | (學號) |
| 線上網址 | `https://studybox.<帳號>.workers.dev`(部署後填入) |
| 原始碼 | `https://github.com/<帳號>/studybox` |
| 預計報告時間 | 約 8 分鐘 |

---

## 📖 1. 專案背景與解決痛點

期末考前要讀的內容很多,但實際讀書時常遇到這些問題:

1. **整理筆記很花時間**:把課堂內容濃縮成重點,有時比讀書本身還累。
2. **不知道自己哪裡不熟**:讀完一遍覺得都懂,考試才發現盲點。
3. **複習方式單調**:只是反覆重讀,效率低又容易分心。

**StudyBox 的解法:** 把「整理 → 自測 → 複習 → 檢討」整合在同一個網站。使用者只要貼上筆記,其餘的摘要、題目、閃卡都交給 AI 產生,並記錄每次作答結果,用統計圖表找出薄弱科目。

## ✨ 2. 核心功能亮點

- **📝 筆記庫**:新增、編輯、刪除筆記,依科目分類、關鍵字搜尋、釘選重要內容。
- **🤖 AI 摘要**:一鍵把長篇筆記濃縮成重點整理,並抽出關鍵字。
- **❓ AI 自動出題**:根據筆記產生選擇題,附正確答案與解析。
- **✅ 作答與批改**:選擇答案後立即批改,並記錄每次作答結果。
- **🃏 閃卡複習**:把重點做成翻面卡片,標記「記得 / 不記得」。
- **📊 學習統計**:以圖表呈現答對率、複習次數與各科目弱點。
- **💾 資料持久化**:所有資料存在 Cloudflare D1,重新整理或換裝置都還在。

## 🏗️ 3. 系統架構

### 架構圖

```mermaid
graph TD
    subgraph Browser ["瀏覽器端"]
        UI["HTML / CSS / JavaScript 介面"]
        Chart["統計圖表(Canvas)"]
        UI --> Chart
    end

    subgraph Edge ["Cloudflare Workers"]
        Worker["Worker:API 路由 + 靜態頁面"]
    end

    D1[("D1 資料庫")]
    AI["Workers AI"]

    UI <==>|fetch /api/*| Worker
    Worker <--> D1
    Worker <--> AI
```

### 資料流程(以「AI 出題」為例)

1. 使用者在筆記頁按下「產生題目」。
2. 前端呼叫 `POST /api/notes/:id/questions`。
3. Worker 從 D1 讀出筆記內容,組成提示詞,呼叫 Workers AI。
4. 檢查 AI 回傳的格式是否正確(題目、四個選項、答案索引)。
5. 格式正確才寫入 D1,並回傳給前端顯示。

### 技術選型與理由

| 層級 | 技術 | 選用理由 |
| :--- | :--- | :--- |
| 前端 | HTML + CSS + JavaScript | 不需打包工具,結構簡單,適合單人快速開發。 |
| 後端 | Cloudflare Workers | 沒有伺服器要維護,API 與靜態頁面由同一個 Worker 提供。 |
| 資料庫 | Cloudflare D1(SQLite) | 與 Workers 原生整合,關聯式資料適合存筆記、題目、紀錄。 |
| AI | Workers AI | 與 Worker 在同一平台,不需另外申請與管理 API 金鑰。 |
| 部署 | Wrangler | 一行指令即可部署,與課堂教的流程一致。 |

## 📦 4. 資料格式

### 筆記(`notes`)

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 主鍵 |
| `subject` | text | 科目 |
| `title` | text | 標題 |
| `content` | text | 筆記內容 |
| `summary` | text | AI 摘要(可為空) |
| `keywords` | text | AI 關鍵字,JSON 陣列 |
| `pinned` | integer | 是否釘選(0 / 1) |
| `created_at` | text | 建立時間 |

### 題目(`questions`)

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | integer | 主鍵 |
| `note_id` | integer | 所屬筆記 |
| `question` | text | 題目 |
| `options` | text | 四個選項,JSON 陣列 |
| `answer` | integer | 正確選項索引(0–3) |
| `explanation` | text | 解析 |

### 答題紀錄(`attempts`)與閃卡(`cards`)

| 資料表 | 主要欄位 |
| --- | --- |
| `attempts` | `id`、`question_id`、`is_correct`、`created_at` |
| `cards` | `id`、`note_id`、`front`、`back`、`remembered`、`forgotten` |

完整建表語法請見 `schema.sql`。

## 🔌 5. API 規格

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康檢查 |
| `GET` | `/api/notes` | 筆記列表,支援 `?q=` 搜尋、`?subject=` 篩選 |
| `POST` | `/api/notes` | 新增筆記 |
| `PUT` | `/api/notes/:id` | 修改筆記(含釘選) |
| `DELETE` | `/api/notes/:id` | 刪除筆記 |
| `POST` | `/api/notes/:id/summarize` | AI 產生摘要與關鍵字 |
| `POST` | `/api/notes/:id/questions` | AI 產生題目 |
| `POST` | `/api/notes/:id/cards` | AI 產生閃卡 |
| `POST` | `/api/questions/:id/answer` | 送出答案並記錄結果 |
| `POST` | `/api/cards/:id/review` | 記錄「記得 / 不記得」 |
| `GET` | `/api/stats` | 學習統計資料 |

成功回應:

```json
{ "ok": true, "data": { } }
```

失敗回應:

```json
{ "ok": false, "error": "AI_INVALID_OUTPUT", "message": "AI 回傳的格式不正確,請重試" }
```

## 📂 6. 專案目錄結構

```text
studybox/
├── wrangler.toml          # Workers 設定:D1、AI 綁定、靜態資源目錄
├── package.json           # dev / deploy / db 指令
├── schema.sql             # 資料表定義
├── src/
│   ├── index.js           # Worker 入口:API 路由 + 靜態資源
│   ├── ai.js              # Workers AI 呼叫與回傳格式檢查
│   └── db.js              # D1 資料存取函式
├── public/
│   ├── index.html         # 主頁面(筆記庫)
│   ├── study.html         # 出題與閃卡複習頁
│   ├── stats.html         # 學習統計頁
│   ├── style.css          # 樣式與響應式版面
│   └── app.js             # 前端邏輯:呼叫 API、畫面更新、圖表
└── README.md
```

## 🚀 7. 快速開始

### 環境需求

- Node.js 18 以上
- Cloudflare 帳號(免費方案即可)

### 本機開發

```bash
git clone https://github.com/<帳號>/studybox.git
cd studybox
npm install

# 建立本機資料表並啟動
npx wrangler d1 execute studybox-db --local --file=./schema.sql
npx wrangler dev
```

開啟 http://localhost:8787 。

### 部署到 Cloudflare

```bash
npx wrangler login
npx wrangler d1 create studybox-db      # 將輸出的 database_id 填入 wrangler.toml
npx wrangler d1 execute studybox-db --remote --file=./schema.sql
npx wrangler deploy
```

部署完成後,Wrangler 會印出 `*.workers.dev` 網址。

## 🧭 8. 使用方式

1. **開啟網站**,進入筆記庫。
2. **新增筆記**:輸入科目、標題與內容後儲存。
3. **產生摘要**:點開筆記,按「AI 摘要」,等待重點與關鍵字出現。
4. **產生題目**:按「AI 出題」,系統會產生數題選擇題。
5. **開始作答**:選擇答案,送出後立即顯示對錯與解析。
6. **閃卡複習**:進入閃卡頁,翻面查看答案並標記「記得 / 不記得」。
7. **查看統計**:進入統計頁,從圖表找出答對率低的科目,針對性複習。
8. **管理筆記**:可釘選重要筆記、搜尋、依科目篩選,或刪除不需要的內容。

## 🧪 9. 功能測試

開發完成後,逐項手動測試並更新結果:

| 測試項目 | 測試結果 |
| --- | --- |
| 新增 / 編輯 / 刪除筆記 | 尚未測試 |
| 搜尋與科目篩選 | 尚未測試 |
| 釘選筆記 | 尚未測試 |
| AI 摘要 | 尚未測試 |
| AI 出題 | 尚未測試 |
| 作答與批改 | 尚未測試 |
| 閃卡翻面與標記 | 尚未測試 |
| 統計圖表數字正確 | 尚未測試 |
| AI 回傳格式錯誤時的錯誤提示 | 尚未測試 |
| 手機版 / 平板 / 桌機版面 | 尚未測試 |

### 驗收檢查表

- [ ] `GET /api/health` 回傳 `ok: true`
- [ ] 重新整理頁面後,筆記與紀錄仍然保留(D1 持久化)
- [ ] AI 產生的題目有 4 個選項,且有正確答案
- [ ] 答錯題目後,統計頁的答對率會同步更新
- [ ] AI 失敗時,畫面顯示錯誤提示而不是當掉
- [ ] 1440 / 768 / 390 三種寬度沒有水平捲動

## 🤖 10. AI 輔助開發說明

本專案以 AI 輔助規劃與撰寫程式碼。開發流程:

1. 先自行決定功能範圍與資料表設計(見本文件第 4、5 節)。
2. 依 README 的規格,請 AI 分模組產生程式碼(資料庫、API、前端各自獨立)。
3. 自行閱讀、執行並手動測試,發現問題再請 AI 修正。

(請依實際開發情況修改。)

## ⚠️ 11. 目前限制

- 沒有使用者登入,所有資料屬於同一個使用者。
- AI 產生的題目可能有錯誤或不夠精確,仍需自行判斷。
- 題目數量與筆記長度受 Workers AI 的輸入限制影響。
- 免費方案的 D1 與 Workers AI 有每日用量上限。

## 🔮 12. 未來改進方向

- 加入使用者登入,支援多人使用。
- 依遺忘曲線安排複習時間(間隔重複)。
- 支援上傳 PDF 或圖片筆記。
- 匯出摘要與題目為 PDF。
- 深色模式。

## 📝 13. 專案成果與心得

(完成專案後填寫:實作了什麼、遇到什麼困難、學到什麼。)

## 🔗 14. 專案連結

| 項目 | 連結 |
| --- | --- |
| GitHub | `https://github.com/<帳號>/studybox` |
| 線上展示 | `https://studybox.<帳號>.workers.dev` |

## 📚 15. 參考資料

- [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文件](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers AI 文件](https://developers.cloudflare.com/workers-ai/)
- 課程範例:[rucloud](https://rucloud.cc/)、[EdgeMemo](https://edgememo.edgememo.workers.dev/)
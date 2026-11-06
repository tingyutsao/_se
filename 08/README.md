# 待辦清單 Todo（Cloudflare 全端站）

一個部署在 Cloudflare 的待辦清單網站：前台新增 / 勾選完成 / 刪除，並可依「全部 / 未完成 / 已完成」篩選。整站只有一個 Cloudflare Worker，同時服務網頁與 API，資料存放在 Cloudflare D1。

**正式網址：<https://todo-cloudflare-app.se08-111410555.workers.dev>**

## 1. 快速導覽

| 區塊 | 路徑 | 說明 |
| --- | --- | --- |
| 待辦清單頁面 | `/` | React 前端（Vite 建置的靜態資產） |
| 公開 API | `/api/todos` | 列表、新增、更新（勾選完成 / 改標題）、刪除 |

## 2. 功能

### 前台（待辦清單）

- 新增待辦：輸入標題（最長 200 字，自動去除前後空白），不需註冊
- 勾選完成 / 取消完成（樂觀更新，先改畫面再打 API，失敗自動回滾）
- 刪除待辦（刪除時在畫面上先移除，API 失敗自動還原）
- 篩選：全部 / 未完成 / 已完成
- 頁尾統計顯示「還有 N 項未完成」
- 深色主題設計，手機上可正常操作
- 資料存於資料庫，換裝置、重開瀏覽器都看得到

### 應用程式安全

- XSS 防護：React 一律以文字節點渲染留言內容，等同純文字顯示（另有 `overflow-wrap` 防爆板排版）
- SQL injection 防護：全程 D1 prepared statement，無字串拼接 SQL
- 欄位長度驗證：標題 200 字上限，且秀 API 傳回的錯誤訊息

## 3. 架構與流程

```
瀏覽器
   │  HTTPS
   ▼
Cloudflare 邊緣網路（全球 300+ 節點，自動 DDoS 阻擋）
   │
   ▼
Cloudflare Worker「todo-cloudflare-app」（單一 Worker = 前 + 後端）
   ├─ GET /            → 靜態資產（Vite 建置的 React SPA，Workers Static Assets）
   ├─ 非資產路徑        → 回 index.html（single-page-application fallback）
   ├─ GET/POST /api/todos*     → Hono API（run_worker_first 優先路由）
   └─ PATCH/DELETE /api/todos/:id
   │
   ▼（binding：DB）
Cloudflare D1「todo-db」（邊緣 SQLite 資料庫）
   └─ todos             待辦資料（id、title、done、created_at）
```

### 一次新增待辦的完整流程

1. 使用者在頁面輸入標題、按「新增」
2. `src/App.tsx` 以 fetch 打 `POST /api/todos`（JSON body：`title`）
3. Worker 驗證欄位（非空、≤ 200 字）
4. `INSERT INTO todos (title) ...` prepared statement 寫入 D1
5. Worker 讀回該筆紀錄，201 回 `{ todo }`
6. 前端把該筆插入列表最上方，清空輸入框

### 架構特點：React + API 同在一個 Worker

和留言板一樣，前端靜態資產與後端 API 由同一個 Worker 服務；差別在本專案前端使用 **React 19 + Vite** 建置（非手寫 HTML/JS），透過 `@cloudflare/vite-plugin` 讓 `vite dev` 一同啟動 Worker 與本機 D1，開發體驗與正式環境一致；`run_worker_first: ["/api/*"]` 確保 API 優先路由，SPA fallback 讓前端路由不會 404。

## 4. 專案結構

```
.
├── index.html                 # 前端進入點（Vite 根 HTML）
├── src/
│   ├── main.tsx               # React 掛載點
│   ├── App.tsx                # 待辦清單 UI 與前端邏輯（fetch + 樂觀更新 + 篩選）
│   ├── index.css              # 全站樣式（深色主題）
│   └── worker/
│       └── index.ts           # Worker 主程式：Hono 路由 + D1 查詢（API）
├── migrations/                # D1 資料表結構（用 wrangler d1 migrations 套用）
│   └── 0001_create_todos.sql
├── wrangler.jsonc             # Worker 設定：名稱、D1 binding、資產策略
├── vite.config.ts             # Vite + @cloudflare/vite-plugin 設定
├── package.json               # 指令與相依套件（React / Hono / Wrangler / Vite）
├── tsconfig.json              # TypeScript 設定（含 @cloudflare/workers-types）
├── .gitignore                 # 不進 git：node_modules、dist、.wrangler 等
└── README.md                  # 本文件
```

`wrangler.jsonc` 核心內容：

```jsonc
{
  "name": "todo-cloudflare-app",
  "main": "src/worker/index.ts",
  "assets": {
    "not_found_handling": "single-page-application", // 未命中資產回 index.html（SPA）
    "run_worker_first": ["/api/*"]                   // API 優先交給 Worker
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "todo-db",
      "database_id": "baed43b9-1e15-4841-975b-e1f8f0d74510",
      "migrations_dir": "migrations"
    }
  ]
}
```

## 5. API 文件

| Method | 路徑 | 說明 | 參數/Body |
| --- | --- | --- | --- |
| GET | `/api/todos` | 全部待辦，時間倒序 | — |
| POST | `/api/todos` | 新增待辦 | `{ "title": "..." }` |
| PATCH | `/api/todos/:id` | 更新待辦 | `{ "done": true }` 或 `{ "title": "..." }` 或兩者 |
| DELETE | `/api/todos/:id` | 刪除待辦 | — |

- `done` 一律回 `boolean`；`created_at` 為 `YYYY-MM-DD HH:MM:SS`（UTC）
- 新增成功回 **201** `{ todo }`；更新/刪除成功回 **200** `{ todo }` / `{ ok: true }`
- 欄位無效回 **400** `{ error }`；找不到該筆回 **404** `{ error }`
- 待辦刪除後資料庫 ID 永久空出不再重用（`AUTOINCREMENT`），避免誤認或誤觸他人待辦

### curl 範例

```bash
# 列出全部
curl https://todo-cloudflare-app.se08-111410555.workers.dev/api/todos

# 新增
curl -X POST https://todo-cloudflare-app.se08-111410555.workers.dev/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"買牛奶"}'

# 勾選完成（id = 1）
curl -X PATCH https://todo-cloudflare-app.se08-111410555.workers.dev/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# 刪除（id = 1）
curl -X DELETE https://todo-cloudflare-app.se08-111410555.workers.dev/api/todos/1
```

## 6. 如何使用

### 首次建置（本地）

```bash
npm install               # 安裝所有相依（React、Hono、Vite、Wrangler…）
npx wrangler d1 migrations apply todo-db --local   # 本地建表
```

### 本地開發

```bash
npm run dev               # 打開 http://localhost:5173
```

`vite dev` 會一併啟動 Worker（Hono API + 本機 D1），開發體驗等同正式環境；本機 D1 資料存在 `.wrangler/state/`（不影響線上）。

### 部署到線上（首次）

```bash
npx wrangler login                                   # 登入 Cloudflare（開瀏覽器授權）
npx wrangler d1 create todo-db                       # 建立 D1，把 database_id 寫回 wrangler.jsonc
npm run db:remote                                    # 遠端建表（= wrangler d1 migrations apply --remote）
npm run deploy                                       # 建置 + 部署
```

首次部署時，若帳號尚未註冊 `workers.dev` 子網域，Wrangler 會互動式詢問；本專案的子網域為 `se08-111410555.workers.dev`。子網域新增後 DNS 需要約 1–2 分鐘生效。

### 日常更新

```bash
npm run deploy            # 改 code 之後重新部署（會先自動 vite build）
```

### 備份資料

```bash
npx wrangler d1 export todo-db --remote --output backup.sql
```

## 7. Cloudflare 應用說明

| 使用的 Cloudflare 服務 | 在本專案的應用 |
| --- | --- |
| Workers | 執行 Hono API（前 + 後端在同一個 Worker），2 ms 啟動、全球邊緣計算 |
| Static Assets | Vite 建置的 React 靜態資產自動上傳，全球 CDN 分發 + SPA fallback |
| D1 | 邊緣 SQLite 資料庫，存放待辦資料；全部 prepared statement 查詢 |
| workers.dev 子網域 | 帳號層級子網域 `se08-111410555.workers.dev`，與本 Worker 一起自動可用 |
| SSL/TLS（免費 Universal SSL） | 自動簽發憑證，全站 HTTPS |
| DDoS 保護 | 邊緣內建 L3/L4/L7 攻擊防護 |
| 可搭配 WAF / Cloudflare Access | 未來若要加管理後台，可用 WAF 限制路徑或 Access 做 SSO 登入 |

### 免費方案限額（足夠一個待辦清單）

- Workers：每日 100,000 請求
- D1：每日 5,000,000 列讀取 / 100,000 列寫入、5 GB 儲存
- 網址只要 Cloudflare 帳號存在就會一直有效；建議帳號開啟 two-factor 2FA 防帳號被偷

## 8. 已知限制 / 未來方向

- **單一共享清單**：沒有任何登入機制，所有人共用同一份待辦（也都能改），若要個人化需再加使用者登入與 per-user 資料過濾
- **無分頁**：一次載入全部待辦，資料量大時應加分頁或時間篩選
- **無速率限制 / 封鎖**：目前任何人（配合 IP 輪替也一樣）可以在額度內大量寫入，可參考留言板的 D1 IP 計數 + 封鎖名單做法
- **沒有管理後台**：目前無後台介面；若有需要（查看紀錄來源 IP、批量清理、封鎖），可參考留言板的後台 + Bearer token + Secret 架構複刻
- **刪除即消失**：沒有軟刪除或復原 / 回收站，可加 `deleted_at` 欄位做成軟刪
- **無自動化測試腳本**：本專案驗證靠手動與 curl 測試；可仿留言板的 `test.ps1` 模式整理成形證
- Todo 與留言板的作文要求不同：留言板的核心挑戰在多人互動（匿名共寫、去識別、防濫用），待辦清單的核心在互動體驗（樂觀更新、狀態篩選）；未來若兩者整合（留言式待辦），可先評估 UI 再調整

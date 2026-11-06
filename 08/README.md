# 待辦清單（Cloudflare 全端應用）

一個部署在 **Cloudflare Workers** 的待辦清單應用，前後端都跑在同一個 Worker 上，資料存在 Cloudflare D1。

- **前端**：React 19 + Vite（靜態資產由 Workers 免費託管）
- **後端**：Hono（REST API）
- **資料庫**：Cloudflare D1（SQLite），免費方案即可使用
- **部署**：單一指令 `npm run deploy`，全球 CDN 分佈

## 功能

- ✅ 新增待辦（最長 200 字，自動去除前後空白）
- ✅ 勾選完成 / 取消完成
- ✅ 刪除待辦
- ✅ 篩選：全部 / 未完成 / 已完成
- ✅ 未完成數量統計
- ✅ 深色主題，手機版可正常顯示

## 環境需求

- Node.js 20 以上（建議 22 或 24）
- 免費的 [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)（要部署才有需要）

## 專案結構

```
├── index.html                  # 前端進入點
├── src/
│   ├── main.tsx                # React 掛載
│   ├── App.tsx                 # 待辦清單 UI
│   ├── index.css               # 樣式（深色主題）
│   └── worker/index.ts         # Hono API（部署到 Cloudflare 的 Worker）
├── migrations/                 # D1 資料庫遷移（SQL）
├── wrangler.jsonc              # Cloudflare 設定（D1 綁定、靜態資產）
└── vite.config.ts              # Vite + Cloudflare 外掛
```

## 可用的 npm 指令

| 指令               | 用途                                   |
| ------------------ | -------------------------------------- |
| `npm run dev`      | 啟動本機開發伺服器（前端 + Worker）     |
| `npm run build`    | 生產建置                               |
| `npm run deploy`   | 建置並部署到 Cloudflare Workers        |
| `npm run db:local` | 套用 D1 遷移到本機資料庫               |
| `npm run db:remote`| 套用 D1 遷移到線上資料庫               |
| `npm run preview`  | 建置後用本機 Worker 預覽正式版         |

## 本機開發

```bash
npm install         # 第一次需要的話
npm run db:local    # 套用本機 D1 資料庫遷移（僅第一次需要）
npm run dev         # 啟動開發伺服器 → http://localhost:5173
```

`vite dev` 會一併啟動 Worker（API + 本機 D1），開發體驗和正式環境一致。

## 部署到 Cloudflare（三步驟）

1. **登入 Cloudflare**

   ```bash
   npx wrangler login
   ```

   會開瀏覽器授權，需要一個免費的 Cloudflare 帳號。

2. **建立 D1 資料庫並填入 ID**

   ```bash
   npx wrangler d1 create todo-db
   ```

   複製輸出中的 `database_id`，貼到 `wrangler.jsonc` 裡取代
   `REPLACE_WITH_YOUR_D1_DATABASE_ID`，然後把資料表建到線上：

   ```bash
   npm run db:remote
   ```

3. **部署**

   ```bash
   npm run deploy
   ```

   完成後會顯示上線網址，例如
   `https://todo-cloudflare-app.<你的子網域>.workers.dev`。

### 之後更新程式

改完程式碼後只要重新執行：

```bash
npm run deploy
```

資料庫的資料不會受影響。若這次有改資料表結構，先跑 `npm run db:remote` 再部署。

## API 一覽

| 方法   | 路徑             | 說明                                                        |
| ------ | ---------------- | ----------------------------------------------------------- |
| GET    | `/api/todos`     | 取得全部待辦                                                 |
| POST   | `/api/todos`     | 新增待辦，body：`{ "title": "..." }`                          |
| PATCH  | `/api/todos/:id` | 更新待辦，body：`{ "done": true }` 或 `{ "title": "..." }`    |
| DELETE | `/api/todos/:id` | 刪除待辦                                                     |

回應格式中的 `done` 一律是 `boolean`，`created_at` 為 `YYYY-MM-DD HH:MM:SS`（UTC）。
錯誤時會回適當的 HTTP 狀態碼（400／404）並附上 `{ "error": "原因" }`。

### curl 範例

```bash
# 新增
curl -X POST https://你的網址/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"買牛奶"}'

# 勾選完成
curl -X PATCH https://你的網址/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# 刪除
curl -X DELETE https://你的網址/api/todos/1
```

## 常見問題

- **部署時出現「database_id not found」**：代表第 2 步還沒做，先建立 D1 並填入 ID。
- **線上 API 回 500**：通常是線上資料庫還沒建表，重跑 `npm run db:remote`。
- **改了資料庫結構**：在 `migrations/` 新增一個 SQL 檔（例如 `0002_add_xxx.sql`），再跑一次 `db:local` / `db:remote`。
- **本機清單有資料但線上看不到**：本機 D1 和線上 D1 是兩個獨立資料庫，資料不會同步，這是正常現象。

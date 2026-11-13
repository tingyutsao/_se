# hono-todo-d1

[![npm version](https://img.shields.io/npm/v/hono-todo-d1.svg)](https://www.npmjs.com/package/hono-todo-d1)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-todo--cloudflare--app-ff6900)](https://todo-cloudflare-app.se08-111410555.workers.dev)

可重用的 **Hono 待辦清單 REST API**，後端用 **Cloudflare D1**（邊緣 SQLite）。
從一個實際部署上線的 Cloudflare Todo 應用抽出來的套件，路由、驗證、SQL 全都
經過實戰測試。

**[線上示範（原始應用）](https://todo-cloudflare-app.se08-111410555.workers.dev)**
— 這個套件就是它的後端 API 抽出來的版本，前端用同一組 API。

只要你有 Cloudflare Worker 和一個 D1 資料庫，就能一行掛上完整的待辦 API。

## 功能

- **CRUD 完整**：列出 / 新增 / 更新（勾選完成、改標題）/ 刪除
- **安全**：全程 prepared statement（防 SQL injection）、標題長度驗證、
  資料表名稱白名單檢查
- **無強依賴**：只需要 `hono`；D1 binding 用結構相容的 TypeScript 介面描述，
  不強迫安裝 `@cloudflare/workers-types`（但安裝了也完全相容）
- **可自訂**：資料表名稱、標題長度上限都能調整
- **零狀態**：不會建立或修改資料表，schema 由你（或 migrations）控制

## 安裝

```bash
npm install hono-todo-d1
```

## 快速開始（Cloudflare Workers + Hono）

```ts
// src/index.ts
import { Hono } from "hono";
import { createTodoApi } from "hono-todo-d1";

type Env = { DB: D1Database };

const app = new Hono<Env>();

app.get("/health", (c) => c.text("ok"));

// 把 Todo API 掛在 /api/todos 之下
app.all("/api/todos/*", (c) =>
  createTodoApi({ db: c.env.DB }).fetch(c.req.raw)
);

export default app;
```

### 建立資料表

```bash
npx wrangler d1 create todo-db            # 把 database_id 寫回 wrangler.jsonc
npx wrangler d1 execute todo-db --remote --command \
  "CREATE TABLE todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
```

### 部署

```bash
npx wrangler deploy
```

## API

掛載於 `/api/todos`（以上面的用法為例）：

| Method | 路徑 | 說明 | Body |
| --- | --- | --- | --- |
| GET | `/api/todos` | 全部待辦（時間倒序） | — |
| POST | `/api/todos` | 新增待辦 | `{ "title": "買牛奶" }` |
| PATCH | `/api/todos/:id` | 更新待辦 | `{ "done": true }`、`{ "title": "..." }` 或兩者 |
| DELETE | `/api/todos/:id` | 刪除待辦 | — |

- 回應格式：`{ todos: [...] }` / `{ todo: {...} }` / `{ ok: true }` / `{ error: "..." }`
- 欄位驗證失敗回 **400**，找不到該筆回 **404**，新增成功回 **201**
- `done` 一律回 `boolean`；`created_at` 為 `YYYY-MM-DD HH:MM:SS`（UTC）

### curl 範例

```bash
curl https://your-worker.example.workers.dev/api/todos

curl -X POST https://your-worker.example.workers.dev/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"買牛奶"}'

curl -X PATCH https://your-worker.example.workers.dev/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

curl -X DELETE https://your-worker.example.workers.dev/api/todos/1
```

## 不用 Hono 主應用？一行搞定

```ts
export default {
  fetch: (req, env) =>
    createTodoApp({ db: env.DB }).fetch(req), // 已掛好 /api/todos 前綴
};
```

## 進階選項

```ts
createTodoApi({
  db: env.DB,
  table: "todos",        // 預設 "todos"；只接受 [A-Za-z_][A-Za-z0-9_]*
  titleMaxLength: 200,   // 預設 200
});
```

任何結構相容 D1 的資料庫 binding 都能傳入（測試環境用 `node:sqlite`
做假的 binding 也行），所以本地測試不需要真的開 Cloudflare。

## 在 Node 測試環境使用

套件不依賴 Workers runtime，只要 binding 長得像 D1 就能用。用 Node 內建的
`node:sqlite` 包一層即可在本機或 CI 測試 API 邏輯：

```js
import { DatabaseSync } from "node:sqlite";
import { createTodoApi } from "hono-todo-d1";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec("CREATE TABLE todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");

const db = {
  prepare: (sql) => {
    const stmt = sqlite.prepare(sql);
    const makeStatement = (vals = []) => ({
      bind: (...next) => makeStatement([...vals, ...next]),
      run: () => stmt.run(...vals),
      first: () => stmt.get(...vals) ?? null,
      all: () => ({ results: stmt.all(...vals) }),
    });
    return makeStatement();
  },
};

const app = createTodoApp({ db });
const res = await app.request("/api/todos"); // GET
```

## 資料表結構（預設）

```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 來源與授權

從部署於 Cloudflare Workers 的待辦清單應用
（`todo-cloudflare-app`，React 前端 + Hono API + D1）抽出後端而成。

- 作者：**tyt2026**
- 線上示範：<https://todo-cloudflare-app.se08-111410555.workers.dev>
- MIT License

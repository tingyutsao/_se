# 待辦清單(Todo)網站應用 + 三層測試

一個用 **Rust (Axum)** 寫的待辦清單網頁應用,附上完整的三種測試:

| 測試層級 | 測什麼 | 工具 | 位置 |
|---|---|---|---|
| **1. 單元測試** | server 的純資料邏輯(Rust) | `cargo test` / Rust 內建測試框架 | `src/store.rs` |
| **2. 系統測試** | web API(HTTP 路由 → 驗證 → 儲存 → 回應) | `tower::ServiceExt::oneshot` | `tests/system.rs` |
| **3. E2E 測試** | 真實頁面上的使用者操作 | Playwright(無頭瀏覽器) | `e2e/tests/todo.spec.js` |

前端是純 HTML/JS 單頁,由同一個 Rust server 直接提供;依照需求 client 端(Node.js/JS 部分)不做單元測試。

---

## 專案結構

```text
.
├── Cargo.toml              # Rust 專案設定
├── src/
│   ├── lib.rs              # 模組宣告(供測試與 main 引用)
│   ├── store.rs            # 待辦資料邏輯 + 單元測試
│   ├── routes.rs           # axum 路由與 handlers
│   └── main.rs             # 啟動 server + 掛靜態檔案
├── tests/
│   └── system.rs           # 系統測試(tower oneshot 打 Router)
├── public/                 # 前端單頁
│   ├── index.html
│   ├── app.js
│   └── style.css
└── e2e/                    # Playwright E2E 測試
    ├── package.json
    ├── playwright.config.js
    └── tests/todo.spec.js
```

## 環境需求

- [Rust](https://rustup.dev/) 1.75+(開發時使用 1.99)
- [Node.js](https://nodejs.org/) 18+(僅 e2e 測試用;開發時為 v24)

## 快速開始

```bash
# 安裝依賴並啟動(預設 http://localhost:3000)
cargo run
```

啟動後打開瀏覽器連到 `http://localhost:3000` 即可使用。可用 `PORT` 環境變數換 port:

```bash
PORT=8787 cargo run          # Windows PowerShell: $env:PORT="8787"; cargo run
```

## API 說明

| Method | Path | 說明 | 成功 | 失敗 |
|---|---|---|---|---|
| `GET` | `/api/todos` | 列出全部待辦 | `200` | — |
| `POST` | `/api/todos` | 新增待辦(body: `{"title": "..."}`) | `201` | `400` 空標題/超過 100 字 |
| `PATCH` | `/api/todos/{id}` | 切換完成狀態 | `200` | `404` id 不存在 |
| `DELETE` | `/api/todos/{id}` | 刪除待辦 | `204` | `404` id 不存在 |

待辦存在記憶體中,重啟 server 後資料會清空(刻意不設資料庫,讓測試簡單且可重現)。

---

## 三種測試:概念分層

```text
┌──────────────────────────────────────────────┐
│  E2E(Playwright 無頭瀏覽器)                │  頁面上的使用者操作
│  ┌────────────────────────────────────────┐  │
│  │  系統測試(oneshot 打 axum Router)    │  │  Web API 合約
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  單元測試(cargo test)          │  │  │  純 Rust 邏輯
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 1. 單元測試(server 一定要測)

- **範圍**:`src/store.rs` 的 `Store` 純邏輯——新增時的管理(id 遞增、去頭尾空白、空/過長標題拒絕、中文按字元數計算長度)、切換完成狀態、刪除、id 不會重複。
- **不測**的:client 端 JS(依需求不做單元測試)。

```bash
cargo test          # 跑全部;用 cargo test store::tests 可只跑單元測試
```

### 2. 系統測試(web API)

- **範圍**:`tests/system.rs`,不啟真 TCP server,而是用 `tower::ServiceExt::oneshot` 把 `http::Request` 直接送進完整的 axum `Router`,驗證:
  - 正向:GET 空 list、POST 回 `201` 含完整 body、PATCH 切換 `done`、DELETE 回 `204` 且清單正確更新
  - 負向:空/空白標題 `400` 帶錯誤訊息、過長標題 `400`、不存在 id 的 PATCH/DELETE `404`

```bash
cargo test --test system
```

### 3. E2E 測試(無頭瀏覽器)

- **範圍**:`e2e/tests/todo.spec.js`,由 Playwright 自動用 `cargo run` 起真 server(`webServer` 設定,port 8787),在無頭 Chromium 操作真實頁面:
  - 載入後空清單、新增後顯示、快速連續新增多筆、空白標題顯示錯誤訊息不可新增、勾選加刪節線可復原、刪除指定項

第一次使用要安裝瀏覽器:

```bash
cd e2e
npm install
npx playwright install chromium
```

之後跑:

```bash
cd e2e
npm test           # 或 npx playwright test
```

`playwright.config.js` 的 `reuseExistingServer: true` 意思是若 8787 port 已有 server 就直接重用,方便一邊手動看畫面一邊跑測試。

> E2E 曾抓到一個真 bug:提交表單後才 `await` 清空輸入框,連續快速新增時舊請求的回呼會蓋掉剛輸入的值,送出空標題。已修正為提交當下同步清空,並讓 `loadTodos()` 用序號丟棄過期回應。

## 全部測試一次跑

```bash
cargo test && (cd e2e && npm test)
```

## 常用指令備忘

| 指令 | 用途 |
|---|---|
| `cargo run` | 啟動 server(同時提供前端頁面) |
| `cargo test` | 單元測試 + 系統測試 |
| `cargo test --test system` | 只跑系統測試 |
| `cd e2e && npm test` | E2E 測試 |
| `cd e2e && npx playwright show-report` | 看上次測試報告 |

產物(`target/`、`e2e/test-results/` 等)皆已在 `.gitignore` 排除。

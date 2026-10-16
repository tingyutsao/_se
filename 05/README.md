# 🐳 Docker 微服務示範系統

用 **Docker + Docker Compose** 建置的一個小型微服務系統：前端由 **nginx** 提供並擔任反向代理，
後端有 **Node.js / Python / Rust** 三個 API 服務，資料存放在 **PostgreSQL**，
最後附上一個會即時顯示整個 Docker 系統狀態的簡易網頁。

> 本文件同時是 **Docker 學習記錄**：包含核心概念筆記、Dockerfile 逐檔解說、
> 常用指令備忘錄、以及實際建置與測試的驗證結果。

---

## 目錄

1. [需求對照表](#1-需求對照表)
2. [快速開始](#2-快速開始)
3. [系統架構](#3-系統架構)
4. [服務清單](#4-服務清單)
5. [專案結構](#5-專案結構)
6. [API 端點總表](#6-api-端點總表)
7. [Docker 學習筆記](#7-docker-學習筆記)
8. [Dockerfile 逐檔解說](#8-dockerfile-逐檔解說)
9. [docker-compose.yml 重點解說](#9-docker-composeyml-重點解說)
10. [常用指令備忘錄](#10-常用指令備忘錄)
11. [驗證紀錄（實際測試結果）](#11-驗證紀錄實際測試結果)
12. [疑難排解](#12-疑難排解)
13. [學習歷程與心得](#13-學習歷程與心得)

---

## 1. 需求對照表

| 需求 | 實作內容 | 位置 |
| --- | --- | --- |
| 學會使用 Docker 並做記錄 | 本 README 的學習筆記、指令備忘錄、驗證紀錄 | `README.md` |
| `Dockerfile` | 共 4 個：nginx、node-api、python-api、rust-api | `nginx/Dockerfile`、`services/*/Dockerfile` |
| `docker-compose.yml` | 5 個服務、2 個網路、1 個具名 volume | `docker-compose.yml` |
| 微服務架構 | 每個服務各自一個容器、各自獨立建置 | 全專案 |
| nginx（web server + reverse proxy） | 提供靜態網頁，並代理 `/api/*` 到三個後端 | `nginx/nginx.conf` |
| PostgreSQL（資料庫） | 儲存造訪紀錄與服務事件，使用 volume 持久化 | `db/init.sql` |
| 開發執行環境：Node.js | Express API，唯一連接資料庫的服務 | `services/node-api/` |
| 開發執行環境：Rust | 純標準函式庫 HTTP 服務（零第三方依賴） | `services/rust-api/` |
| 開發執行環境：Python | FastAPI + Uvicorn 服務 | `services/python-api/` |
| 簡易 Web 介面 | 即時顯示各容器狀態、可寫入資料庫、可呼叫運算 | `web/`（由 nginx 提供） |

**驗證環境（實際執行本專案用的版本）**

| 元件 | 版本 |
| --- | --- |
| Docker Engine | 29.8.2 |
| Docker Compose | v5.6.0 |
| 主機作業系統 | Windows（Docker Desktop） |
| Node.js 容器 | v22.23.3（`node:22-alpine`） |
| Python 容器 | 3.12.15（`python:3.12-slim`） |
| Rust 容器 | rustc 1.83.0（`rust:1.83-slim`） |
| nginx 容器 | 1.27.5（`nginx:1.27-alpine`） |
| PostgreSQL 容器 | 16.15（`postgres:16-alpine`） |

---

## 2. 快速開始

### 2.1 前置需求

* 已安裝 Docker Desktop（或 Docker Engine + Compose plugin）
* 確認 daemon 有在跑：

```bash
docker version          # 能看到 Client 與 Server 兩段才正常
docker compose version
```

### 2.2 啟動

```bash
# 1) 準備環境變數檔（Windows PowerShell）
Copy-Item .env.example .env
#    macOS / Linux:  cp .env.example .env

# 2) 建置映像檔並啟動所有容器（第一次會下載基礎映像檔，需要幾分鐘）
docker compose up -d --build

# 3) 查看狀態（等到全部 healthy）
docker compose ps
```

### 2.3 開啟網頁

瀏覽器打開 **<http://localhost:8080>**

你應該會看到「Docker 微服務示範系統」儀表板，上面有 5 張服務卡片（nginx、node-api、
python-api、rust-api、PostgreSQL），可以按按鈕寫入資料庫、呼叫 Python 算質數。

### 2.4 停止 / 清理

```bash
docker compose stop            # 停止容器（保留容器與資料）
docker compose down            # 移除容器與網路（保留 volume，資料還在）
docker compose down -v         # 連 volume 一起刪掉（資料歸零，下次重新初始化）
```

---

## 3. 系統架構

```text
                    瀏覽器（你）
                        │  http://localhost:8080
                        ▼
        ┌───────────────────────────────────────────────┐
        │  nginx 容器（唯一對外開放的容器）             │
        │  ─ 靜態網站：/  → /usr/share/nginx/html       │
        │  ─ 反向代理：/api/node/   → node-api:3000      │
        │              /api/python/ → python-api:8000    │
        │              /api/rust/   → rust-api:8080      │
        └──────┬──────────────────┬──────────────┬──────┘
               │  網路 webnet      │              │
               ▼                  ▼              ▼
      ┌────────────────┐  ┌───────────────┐  ┌──────────────┐
      │ node-api:3000  │  │ python-api:8000│  │ rust-api:8080│
      │ Node.js/Express│  │ Python/FastAPI │  │ Rust（純標準 │
      │ 唯一連資料庫   │  │ 無狀態         │  │ 函式庫）無狀態│
      └───────┬────────┘  └───────────────┘  └──────────────┘
              │ 網路 datanet（internal，無外網）
              ▼
      ┌──────────────────────────────────────┐
      │  db 容器：PostgreSQL 16.15  :5432    │
      │  資料存放於具名 volume demo-db-data  │
      └──────────────────────────────────────┘
```

**設計重點**

1. **只有 nginx 對外開放埠號**（主機 `8080` → 容器 `80`）。
   三個 API 與資料庫都只用 `expose`/內部埠，從主機連不到，必須經過 nginx —— 這是反向代理的核心價值。
2. **兩段網路**：
   * `demo-webnet`：nginx ↔ 三個 API。
   * `demo-datanet`：`internal: true`，node-api ↔ db，**不能連外網**，降低資料庫被當跳板的風險。
3. **只有 node-api 連資料庫**：在網頁上可以看到「資料庫連線：成功/不需要」的差異。
4. **資料持久化**：PostgreSQL 的資料在具名 volume `demo-db-data`，`docker compose down` 後再啟動資料仍在（見 [11.4](#114-資料持久化驗證)）。

---

## 4. 服務清單

| 服務名稱 | 映像檔 | 技術 | 容器內埠 | 對外埠 | 角色 |
| --- | --- | --- | --- | --- | --- |
| `nginx` | `demo/nginx-web:1.0.0` | nginx 1.27-alpine | 80 | **8080** | 靜態網站 + 反向代理 |
| `node-api` | `demo/node-api:1.0.0` | Node.js 22 + Express 4 | 3000 | — | REST API、資料庫存取 |
| `python-api` | `demo/python-api:1.0.0` | Python 3.12 + FastAPI | 8000 | — | REST API、運算示範 |
| `rust-api` | `demo/rust-api:1.0.0` | Rust（零第三方依賴） | 8080 | — | REST API、輕量高效示範 |
| `db` | `postgres:16-alpine` | PostgreSQL 16 | 5432 | — | 資料庫 |

---

## 5. 專案結構

```text
05/
├── docker-compose.yml            # 整個系統的宣告式定義（5 服務 / 2 網路 / 1 volume）
├── .env.example                  # 環境變數範本（複製成 .env 使用）
├── .dockerignore                 # 根目錄建置排除清單（nginx 映像檔的 build context 是根目錄）
├── README.md                     # 本文件（含學習記錄）
│
├── nginx/
│   ├── Dockerfile                # nginx 映像檔（含靜態網站與代理設定）
│   └── nginx.conf                # 反向代理規則 + gzip + /healthz
│
├── db/
│   └── init.sql                  # 資料庫初始化（建表 + 種子資料），只在第一次啟動執行
│
├── web/                          # 前端（會被 COPY 進 nginx 映像檔）
│   ├── index.html                # 儀表板頁面
│   ├── style.css                 # 樣式（深色主題、RWD）
│   └── app.js                    # 前端邏輯：呼叫 /api/*（全部經過 nginx）
│
└── services/
    ├── node-api/
    │   ├── Dockerfile            # 多階段建置、非 root、HEALTHCHECK
    │   ├── package.json          # express + pg
    │   └── src/server.js         # API 實作（唯一連 PostgreSQL 的服務）
    ├── python-api/
    │   ├── Dockerfile            # python:3.12-slim、非 root、HEALTHCHECK
    │   ├── requirements.txt      # fastapi + uvicorn
    │   └── app/main.py           # API 實作（質數計算示範）
    └── rust-api/
        ├── Dockerfile            # 多階段：rust:1.83-slim 編譯 → debian:bookworm-slim 執行
        ├── Cargo.toml / Cargo.lock
        └── src/main.rs           # 用 std::net 手寫的極簡 HTTP 服務
```

---

## 6. API 端點總表

所有路徑都是「經過 nginx」的對外路徑。

### nginx

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/` | 儀表板網頁 |
| GET | `/healthz` | nginx 自身健康檢查（回 `ok`） |

### node-api（`/api/node/`）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/node/health` | 健康檢查 |
| GET | `/api/node/info` | 服務資訊（Node 版本、記憶體、CPU、DB 狀態…） |
| GET | `/api/node/visits` | 讀取造訪筆數（查 PostgreSQL） |
| POST | `/api/node/visits` | 新增一筆造訪紀錄（寫 PostgreSQL） |
| GET | `/api/node/events` | 最近的服務事件 |
| GET | `/api/node/db` | 資料庫版本 / 大小 / 查詢延遲 |

### python-api（`/api/python/`）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/python/health` | 健康檢查 |
| GET | `/api/python/info` | 服務資訊 |
| GET | `/api/python/compute/primes?limit=1000000` | 計算質數個數（CPU 運算示範） |
| GET | `/api/python/env` | 顯示容器內可見的環境變數 |
| GET | `/api/python/docs` | FastAPI 自動產生的 Swagger UI |

### rust-api（`/api/rust/`）

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/rust/health` | 健康檢查 |
| GET | `/api/rust/info` | 服務 / 編譯資訊 |
| GET | `/api/rust/` | 端點清單 |

---

## 7. Docker 學習筆記

### 7.1 映像檔（Image）與容器（Container）

* **映像檔**是唯讀的「範本」，由 Dockerfile 一層一層建置而成（每個指令一層 layer，有快取）。
* **容器**是映像檔的執行實例，可以有很多個、可以隨時刪掉重建。
* 一句話記法：**映像檔 = 類別，容器 = 物件**；資料不該存在容器裡，要放在 volume。

```bash
docker images                     # 我有哪些映像檔
docker ps                        # 正在跑的容器
docker ps -a                     # 包含已停止的容器
docker run hello-world           # 最小實驗：下載映像檔並執行
docker run -it --rm alpine sh    # 進入容器互動，離開就刪掉
```

### 7.2 Dockerfile 常用指令

| 指令 | 用途 | 本專案範例 |
| --- | --- | --- |
| `FROM` | 基底映像檔 | `FROM node:22-alpine` |
| `WORKDIR` | 設定工作目錄 | `WORKDIR /app` |
| `COPY` | 複製檔案進映像檔 | `COPY src ./src` |
| `RUN` | 建置時執行指令 | `RUN npm install --omit=dev` |
| `ENV` | 設定環境變數（會留在映像檔） | `ENV NODE_ENV=production` |
| `ARG` | 建置參數（可用 `--build-arg` 覆蓋） | `ARG RUST_VERSION=1.83.0` |
| `EXPOSE` | 宣告容器監聽的埠（**只是宣告**） | `EXPOSE 3000` |
| `USER` | 切換執行身分（不要用 root） | `USER appuser` |
| `HEALTHCHECK` | 定義健康檢查指令 | `CMD ["rust-api", "--health"]` |
| `CMD` | 容器啟動預設指令 | `CMD ["node", "src/server.js"]` |
| `ENTRYPOINT` | 固定入口（本專案未使用，用 CMD 即可） | — |

**指令順序很重要**：會變動的檔案（原始碼）放越後面，前面安裝依賴的 layer 才能重複使用快取。
本專案的 Node.js / Python Dockerfile 都先 `COPY package.json` / `requirements.txt` 再安裝依賴，就是這個原因。

### 7.3 多階段建置（Multi-stage build）

Rust 需要編譯器（映像檔近 1 GB），但執行時只需要一個執行檔。多階段建置讓「建置用的東西」
不會被帶進最終映像檔：

```dockerfile
FROM rust:1.83-slim AS builder     # 第一階段：有編譯器，負責編譯
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim          # 第二階段：乾淨的執行環境
COPY --from=builder /app/target/release/rust-api /usr/local/bin/rust-api
CMD ["rust-api"]
```

實測結果：`demo/rust-api:1.0.0` 只有 **114 MB**（其中大部分是 Debian 基底），
而執行時記憶體只用了 **2.3 MiB**（`docker stats` 實測），比 Node.js 服務還輕。

### 7.4 Volume：資料持久化

* 容器刪除後，容器內的檔案就消失了；**volume 是獨立於容器生命週期的儲存空間**。
* 本專案在 `docker-compose.yml` 宣告具名 volume：

```yaml
volumes:
  db-data:
    name: demo-db-data
```

並掛載給資料庫：`- db-data:/var/lib/postgresql/data`。

```bash
docker volume ls
docker volume inspect demo-db-data      # 可以看到掛載點
docker compose down                     # 容器、網路都沒了
docker compose up -d                    # 資料還在！（已實測）
docker compose down -v                  # 加 -v 才會刪 volume
```

### 7.5 Network：服務發現與隔離

* Compose 會自動建立網路，並讓**服務名稱變成 DNS 名稱**：
  nginx 設定檔裡寫 `proxy_pass http://node-api:3000/`，不用知道 IP。
* `driver: bridge` 是預設；`internal: true` 表示該網路**不能連到外網**（本專案的 `datanet`）。

```bash
docker network ls
docker network inspect demo-datanet
docker compose exec nginx ping -c 2 node-api     # 容器之間用「服務名稱」互通
docker compose exec nginx ping -c 2 db           # 失敗！nginx 不在 datanet 上（刻意隔離）
```

驗證絕緣性：主機 `curl http://localhost:3000`（node-api）會失敗，因為它沒有對外開放埠。

### 7.6 Compose：用宣告式檔案描述整個系統

`docker compose up -d` 一句話就會：建立網路 → 依 `depends_on` 順序啟動容器 → 建置映像檔 → 掛載 volume。

**啟動順序控制**（本專案重點）：

```yaml
depends_on:
  db:
    condition: service_healthy      # 等 db 的 healthcheck 通過才啟動 node-api
```

每個服務的 `HEALTHCHECK`（寫在 Dockerfile）讓 Compose 能判斷「服務真的可以用了」，
而不是「容器有在跑」。這就是 `docker compose up` 之後 `ps` 顯示 `(healthy)` 的原因。

### 7.7 `.dockerignore`

把不需要進建置內容的東西排除（`node_modules`、`target/`、`.env`、`.git`），
可以加快建置、避免把密碼打包進映像檔。本專案在根目錄與每個服務目錄都有放。

### 7.8 環境變數注入

`docker-compose.yml` 用 `${VAR:-預設值}` 讀取 `.env`，再注入容器：

```yaml
environment:
  DATABASE_URL: postgres://${POSTGRES_USER:-demo}:${POSTGRES_PASSWORD:-demo1234}@db:5432/${POSTGRES_DB:-demo}
```

* `.env` 已經被 `.gitignore` 排除，**密碼不會進版控**。
* 留意 Dockerfile 內 `ENV`（烤進映像檔）與 Compose `environment`（容器啟動時注入）的差別。

### 7.9 安全小習慣（本專案都有做）

* 每個服務都建立非 root 使用者並用 `USER` 切換。
* 基礎映像檔選擇 `-alpine` / `-slim`，體積小、攻擊面小。
* 只 `EXPOSE` 需要的埠，只有 nginx 對外開 `ports`。
* `.dockerignore` 避免把 `.env`、`.git` 打進映像檔。
* 資料庫放在 `internal` 網路，容器即使被入侵也難以對外連線。

---

## 8. Dockerfile 逐檔解說

### 8.1 `nginx/Dockerfile`

```dockerfile
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf        # 丟掉預設站台
COPY nginx/nginx.conf /etc/nginx/conf.d/app.conf
COPY web/ /usr/share/nginx/html/                # 靜態網站
EXPOSE 80
HEALTHCHECK ... CMD wget -qO- http://localhost/healthz || exit 1
```

* build context 是「專案根目錄」（在 compose 裡用 `context: .`），所以能同時複製 `nginx/` 與 `web/`。
* alpine 版內建 busybox `wget`，健康檢查不必額外安裝 curl。

### 8.2 `services/node-api/Dockerfile`

```dockerfile
FROM node:22-alpine AS deps          # 階段 1：只安裝依賴
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime       # 階段 2：只帶執行需要的東西
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER app
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:3000/health')..."
CMD ["node", "src/server.js"]
```

* `--omit=dev` 不裝開發依賴；分階段讓「安裝依賴」與「複製原始碼」分開快取。
* 健康檢查直接用 Node 內建的 `fetch`，不必裝 curl。

### 8.3 `services/python-api/Dockerfile`

* `PYTHONUNBUFFERED=1`：容器日誌才能即時輸出（不然會卡在緩衝區）。
* `PYTHONDONTWRITEBYTECODE=1`：不產生 `.pyc`。
* `pip install` 放在 `COPY app` 之前，改程式碼時不用重裝套件。
* 健康檢查用標準函式庫 `urllib.request`。

### 8.4 `services/rust-api/Dockerfile`

* 兩個階段（見 [7.3](#73-多階段建置multi-stage-build)）。
* `Cargo.toml` / `Cargo.lock` 與 `src/` 分開 `COPY`，並用 `--locked` 確保建置可重現。
* `Cargo.toml` 內 `[profile.release]` 加了 `opt-level="z"`、`lto=true`、`strip=true`、`panic="abort"`，把執行檔縮到最小。
* **零第三方依賴**：`[dependencies]` 是空的，建置時不需要連 crates.io。
* 執行階段映像檔不需要 curl，健康檢查用程式自己的 `--health` 模式（內部自己發 HTTP 請求）。

---

## 9. `docker-compose.yml` 重點解說

```yaml
name: docker-demo                 # 專案名稱（容器/網路/volume 的前綴）

services:
  db:
    image: postgres:16-alpine     # 直接用官方映像檔
    environment: {...}
    volumes:
      - db-data:/var/lib/postgresql/data              # 資料持久化
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro   # 首次啟動初始化
    networks: [datanet]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
    #                                              ^^ 兩個錢字號 = 讓容器內的 shell 展開變數

  node-api:
    build: { context: ./services/node-api }
    image: demo/node-api:1.0.0    # 建置後同時命名，方便辨識
    environment:
      DATABASE_URL: postgres://...@db:5432/demo      # host 就是服務名稱!
    depends_on:
      db: { condition: service_healthy }
    networks: [webnet, datanet]

  python-api: { build: ..., networks: [webnet] }
  rust-api:   { build: ..., networks: [webnet] }

  nginx:
    build: { context: ., dockerfile: nginx/Dockerfile }
    ports:
      - "${WEB_PORT:-8080}:80"    # 只有這裡對外
    depends_on:  # 等三個 API 都健康才啟動
      node-api:  { condition: service_healthy }
      python-api:{ condition: service_healthy }
      rust-api:  { condition: service_healthy }
    networks: [webnet]

volumes:
  db-data: { name: demo-db-data }

networks:
  webnet:  { name: demo-webnet, driver: bridge }
  datanet: { name: demo-datanet, driver: bridge, internal: true }
```

**幾個容易踩到的點**

* `ports` 是「對外開放」，`expose` 只是「宣告」；本專案 API 完全沒有 `ports`。
* `$$VAR` 在 compose 裡代表「不要現在展開，留給容器內的 shell 展開」。
* `depends_on` 只保證**啟動順序**，不保證對方「準備好」；要搭配 `condition: service_healthy`。
* `init.sql` 只在 volume 是空的時候執行一次；改了它要 `docker compose down -v` 才會重新套用。

---

## 10. 常用指令備忘錄

### 10.1 映像檔

```bash
docker images                                  # 列出映像檔
docker build -t myapp:1.0 .                    # 依 Dockerfile 建置
docker build -t myapp:1.0 --no-cache .         # 不用快取，全部重來
docker history myapp:1.0                       # 看每一層的大小與來源指令
docker image rm myapp:1.0                      # 刪除映像檔
docker image prune -a                          # 清理沒被使用的映像檔
```

### 10.2 容器

```bash
docker ps                                      # 執行中的容器
docker ps -a                                   # 含已停止
docker run -d -p 8080:80 --name web nginx      # 背景執行並對外開放埠
docker logs -f web                             # 追蹤日誌
docker exec -it web sh                         # 進入容器互動
docker stop web && docker start web            # 停止 / 啟動
docker rm -f web                               # 強制移除
docker stats                                   # 即時 CPU / 記憶體（本專案 rust-api 只用 2.3 MiB）
docker inspect web                             # 完整資訊（IP、掛載、環境變數）
docker top web                                 # 容器內的行程
```

### 10.3 Docker Compose

```bash
docker compose config                          # 驗證並顯示展開後的設定（好用！）
docker compose build                           # 建置所有服務映像檔
docker compose up -d --build                   # 建置 + 背景啟動（本專案主要指令）
docker compose ps                              # 服務狀態（看 healthy）
docker compose logs -f node-api                # 追蹤某個服務日誌
docker compose logs --tail=50 --no-follow      # 只看最後 50 行
docker compose exec db psql -U demo -d demo    # 在容器內開 psql
docker compose exec node-api sh                # 進入 node 容器
docker compose restart nginx                   # 重啟單一服務
docker compose up -d --force-recreate rust-api # 強制重建容器（換映像檔後）
docker compose stop / start                    # 停止 / 啟動全部
docker compose down                            # 移除容器與網路（保留 volume）
docker compose down -v                         # 連 volume 一起刪
docker compose down --rmi all -v               # 連映像檔一起清掉
```

### 10.4 日誌與除錯

```bash
docker compose logs -f --tail=100              # 全部服務的日誌
docker inspect demo-db --format "{{.State.Health.Status}}"      # 健康狀態
docker inspect demo-db --format "{{json .NetworkSettings.Networks}}"
docker compose exec db psql -U demo -d demo -c "SELECT COUNT(*) FROM page_visits;"
docker compose exec -T node-api node -e "console.log(process.version)"
```

### 10.5 網路與磁碟區

```bash
docker network ls
docker network inspect demo-webnet
docker volume ls
docker volume inspect demo-db-data
docker system df                               # 磁碟使用量總覽
docker system prune -a --volumes               # 大掃除（小心，會刪資料）
```

---

## 11. 驗證紀錄（實際測試結果）

以下都是在本機實際執行、貼上的真實輸出（已把 Windows 主控台的亂碼問題排除，屬顯示編碼問題，
不影響資料；見 [12.5](#125-windows-主控台中文顯示亂碼)）。

### 11.1 建置與啟動

```text
$ docker compose build
 Image demo/node-api:1.0.0 Built
 Image demo/python-api:1.0.0 Built
 Image demo/rust-api:1.0.0 Built
 Image demo/nginx-web:1.0.0 Built

$ docker compose ps
NAME              IMAGE                   STATUS                    PORTS
demo-db           postgres:16-alpine      Up (healthy)              5432/tcp
demo-nginx        demo/nginx-web:1.0.0    Up (healthy)              0.0.0.0:8080->80/tcp
demo-node-api     demo/node-api:1.0.0     Up (healthy)              3000/tcp
demo-python-api   demo/python-api:1.0.0   Up (healthy)              8000/tcp
demo-rust-api     demo/rust-api:1.0.0     Up (healthy)              8080/tcp
```

5 個容器全部 `healthy`，而且只有 nginx 有對外埠號 —— 符合架構設計。

### 11.2 反向代理測試

```text
$ curl http://localhost:8080/healthz
ok

$ curl http://localhost:8080/api/node/info
{"service":"node-api","language":"Node.js","runtime":"v22.23.3","framework":"Express 4.23.1",
 "driver":"pg 8.13.1","environment":"production","hostname":"...","platform":"linux/x64",
 "cpu_count":32,"process_memory_human":"18.80 MB","pid":1,
 "database":{"connected":true,"server":"PostgreSQL 16.15","database":"demo",
             "size_human":"7.50 MB","latency_ms":2}}

$ curl http://localhost:8080/api/python/info
{"service":"python-api","language":"Python","runtime":"3.12.15","implementation":"CPython",
 "framework":"FastAPI 0.143.2",...,"database":{"connected":false,"note":"此服務為無狀態，不連資料庫"}}

$ curl http://localhost:8080/api/rust/info
{"service":"rust-api","language":"Rust","runtime":"rustc 1.83.0","edition":"2021",
 "framework":"std::net（零第三方依賴）","app_version":"1.0.0","platform":"linux/x86_64",...}
```

三個不同語言的服務都能被 nginx 正確代理，前端網頁的「原始 JSON」分頁就是顯示這些內容。

### 11.3 資料庫讀寫測試

```text
$ curl -X POST http://localhost:8080/api/node/visits -H "Content-Type: application/json" -d '{"source":"manual-test"}'
{"ok":true,"total":4,"message":"已寫入 PostgreSQL"}

$ curl http://localhost:8080/api/node/visits
{"total":4,"latest_at":"2026-10-16T03:38:53.943Z"}

$ curl http://localhost:8080/api/node/db
{"connected":true,"server":"PostgreSQL 16.15","database":"demo","size_human":"7.50 MB","latency_ms":2}
```

直接進資料庫確認（`init.sql` 插了 3 筆種子資料，加上 API 新增 1 筆 = 4）：

```text
$ docker compose exec -T db psql -U demo -d demo -c "SELECT COUNT(*) AS visits FROM page_visits;"
 visits
--------
      4
(1 row)
```

### 11.4 資料持久化驗證

```text
$ curl http://localhost:8080/api/node/visits
{"total":4,...}

$ docker compose down                 # 容器與網路全部移除
 Container demo-db Removed
 Network demo-webnet Removed
 Network demo-datanet Removed

$ docker compose up -d                # 重新啟動
$ curl http://localhost:8080/api/node/visits
{"total":4,...}                       # ← 資料還在！volume 生效
```

### 11.5 Python 運算服務

```text
$ curl "http://localhost:8080/api/python/compute/primes?limit=1000000"
{"service":"python-api","limit":1000000,"prime_count":78498,"elapsed_ms":7.007,"cpu_count":32}
```

100 萬以下有 78,498 個質數，容器內耗時約 7 ms。

### 11.6 映像檔大小（多階段建置的成效）

| 映像檔 | 大小 | 說明 |
| --- | --- | --- |
| `demo/nginx-web:1.0.0` | 73.7 MB | nginx + 靜態網站（幾乎都是 nginx 本身） |
| `demo/rust-api:1.0.0` | 114 MB | 編譯階段近 1 GB，最終只留執行檔 + Debian slim |
| `demo/python-api:1.0.0` | 201 MB | python slim + fastapi/uvicorn |
| `demo/node-api:1.0.0` | 244 MB | node:22-alpine + node_modules |
| `postgres:16-alpine` | 420 MB | 官方映像檔 |

### 11.7 執行時資源使用（`docker stats --no-stream`）

| 容器 | CPU | 記憶體 |
| --- | --- | --- |
| demo-nginx | 0.00% | 25.21 MiB |
| demo-node-api | 0.00% | 18.80 MiB |
| demo-python-api | 0.20% | 36.47 MiB |
| demo-rust-api | 0.00% | **2.30 MiB** |
| demo-db | 0.03% | 23.42 MiB |

### 11.8 網路與 volume

```text
$ docker network ls | grep demo
demo-datanet    bridge    local
demo-webnet     bridge    local

$ docker volume ls | grep demo
demo-db-data    local
```

### 11.9 全新環境重建驗證

把容器、網路、volume、映像檔全部刪掉，再從交付的檔案重新建置一次，確認可重現：

```text
$ docker compose down -v --rmi local
 Image demo/rust-api:1.0.0 Removed
 Network demo-datanet Removed
 Network demo-webnet Removed
 ...

$ docker compose up -d --build
 Container demo-db Healthy
 Container demo-node-api Healthy
 Container demo-python-api Healthy
 Container demo-rust-api Healthy
 Container demo-nginx Started

$ docker compose ps
demo-db           Up (healthy)
demo-nginx        Up (healthy)
demo-node-api     Up (healthy)
demo-python-api   Up (healthy)
demo-rust-api     Up (healthy)

$ curl http://localhost:8080/api/node/visits
{"total":3,...}          # init.sql 重新執行，回到 3 筆種子資料

$ curl -X POST http://localhost:8080/api/node/visits -H "Content-Type: application/json" -d '{"source":"final-check"}'
{"ok":true,"total":4,"message":"已寫入 PostgreSQL"}

# 所有對外路徑檢查
/api/node/health   -> 200
/api/python/health -> 200
/api/rust/health   -> 200
/healthz           -> 200
/                  -> 200     # 儀表板網頁
/style.css         -> 200
/app.js            -> 200
```

結論：**交付的 `Dockerfile` + `docker-compose.yml` 可以從乾淨環境一鍵重建並正常運作。**

---

## 12. 疑難排解

### 12.1 `failed to connect to the docker API ... docker daemon is running`

Docker Desktop（或 Docker 服務）沒啟動。Windows：開始功能表開啟 Docker Desktop，
等鯨魚圖示變成穩定狀態，再 `docker info` 確認能看到 Server 資訊。

### 12.2 `ports are not available / bind: address already in use`

8080 被其他程式佔用（例如另一個專案）。改 `.env`：

```env
WEB_PORT=8090
```

然後 `docker compose up -d`，改用 <http://localhost:8090>。

### 12.3 容器一直 `starting` / `unhealthy`

```bash
docker compose ps
docker inspect demo-node-api --format "{{json .State.Health}}"
docker compose logs --tail=50 node-api       # 先看日誌
```

常見原因：資料庫還沒準備好、環境變數（`DATABASE_URL`）寫錯、健康檢查指令在該映像檔內不存在。

### 12.4 改了 `db/init.sql` 卻沒生效

`docker-entrypoint-initdb.d` 只在 **volume 是空的** 時候執行：

```bash
docker compose down -v      # 刪掉 volume
docker compose up -d --build
```

### 12.5 Windows 主控台中文顯示亂碼

`docker compose logs` 或 `curl` 在 PowerShell 顯示中文變成亂碼，是終端機代碼頁（cp950）與
容器輸出的 UTF-8 不一致，**資料本身是正確的**。要在瀏覽器或 API 回應中確認即可。
若要修正顯示：

```powershell
chcp 65001
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
```

### 12.6 想進容器裡看看

```bash
docker compose exec nginx sh                      # alpine 用 sh
docker compose exec node-api sh
docker compose exec python-api bash
docker compose exec rust-api bash
docker compose exec db psql -U demo -d demo
```

### 12.7 完全砍掉重來

```bash
docker compose down -v --rmi local    # 容器、網路、volume、本專案映像檔全清
docker compose up -d --build          # 重新開始（會重新跑 init.sql）
```

### 12.8 在 Windows PowerShell 測試 API

PowerShell 的 `curl` 其實是 `Invoke-WebRequest` 的別名，參數寫法不同，容易誤會成「服務壞了」。
建議直接用完整指令：

```powershell
# GET
(Invoke-WebRequest "http://localhost:8080/api/node/info" -UseBasicParsing).Content

# POST（測寫入資料庫）
Invoke-WebRequest -Uri "http://localhost:8080/api/node/visits" -Method POST `
  -ContentType "application/json" -Body '{"source":"powershell"}' -UseBasicParsing | Select-Object -Expand Content

# 只看狀態碼
(Invoke-WebRequest "http://localhost:8080/healthz" -UseBasicParsing).StatusCode
```

如果系統有安裝真正的 curl（`curl.exe`），上面章節的 `curl` 指令就能直接使用。

---

## 13. 學習歷程與心得

### 13.1 我實際做了什麼（時間順序）

1. **確認環境**：`docker --version`、`docker compose version`，發現 Docker daemon 沒啟動，先啟動 Docker Desktop。
2. **設計架構**：決定「nginx 當唯一入口 + 三個語言各一個 API + PostgreSQL」，
   並規劃兩個網路（webnet / datanet）達成隔離。
3. **寫 Dockerfile 與程式**：四個服務各一個 Dockerfile，刻意涵蓋不同技巧（多階段建置、非 root、`HEALTHCHECK`、`.dockerignore`），並實作三個 API 與前端儀表板。
4. **本機先驗證程式**：`node --check`、`python -m py_compile`、`cargo build --release`，
   在進入容器前先把語法／編譯錯誤清掉（省下大量 build 時間）。
5. **建置**：`docker compose build`。這裡學到 Docker 會先下載基礎映像檔（`rust:1.83-slim` 共 262 MB，就花了約 145 秒）。
6. **啟動**：`docker compose up -d`，觀察到 Compose 依照 `depends_on` + `condition: service_healthy` 的順序：
   等到 `db` healthy 才啟動 `node-api`，三個 API 都健康後才啟動 nginx。
7. **驗證**：用 `curl` 打 `/healthz`、三個 API 的 `/info`、POST 造訪紀錄，再用 `psql` 進資料庫確認筆數（4 筆）。
8. **修正問題**：發現 (a) FastAPI 版本誤用 app 版本、(b) Rust 的 `--locked` 因未複製 `Cargo.lock` 而失敗；
   修正後重新 `docker compose build python-api rust-api` 並 `docker compose up -d --force-recreate`。
9. **持久化測試**：`docker compose down` → `docker compose up -d`，確認造訪筆數仍是 4（volume 生效）。
10. **效能觀察**：`docker stats` 看到 Rust 只吃 2.3 MiB 記憶體，對「多階段建置 + 零依賴」的效果很有感。

### 13.2 這次學到最重要的事

* **容器是拋棄式的，資料不是**：把「狀態」集中到資料庫 + volume，其他服務才能隨時重建。
* **網路就是安全邊界**：只有 nginx 對外、資料庫關在 `internal` 網路，比在每台機器上開防火牆簡單得多。
* **健康檢查是 Compose 的靈魂**：沒有 `HEALTHCHECK`，`depends_on` 只能保證「容器有起來」，
  不能保證「服務可以用」，啟動順序就會隨機出錯。
* **映像檔大小是可以控制的**：多階段建置 + `-slim`/`-alpine` 基底 + `.dockerignore`，效果非常明顯。
* **快取是建置速度的關鍵**：把「安裝依賴」與「複製原始碼」分開，改一行程式不用重裝套件。

### 13.3 後續可以加強的方向

* 加入 **CI/CD**（GitHub Actions）自動建置並推送映像檔。
* 加入 **PgBouncer / Redis**，補上快取層。
* 用 **Traefik / Nginx Proxy Manager** 改寫路由，加上自動 HTTPS（Let's Encrypt）。
* 為 API 加上 **JWT 驗證**與 **rate limiting**（nginx `limit_req`）。
* 以 **Prometheus + Grafana** 監控容器（`node_exporter` / `cAdvisor`）。
* 把 `docker-compose.yml` 拆成 `docker-compose.override.yml`（開發）與正式環境設定。
* 改用 **Kubernetes / Docker Swarm** 體驗更完整的微服務調度。

---

## 附錄：一鍵驗證腳本（手動貼上即可）

```bash
# 1) 啟動
docker compose up -d --build

# 2) 等健康
docker compose ps

# 3) 逐項驗證
curl http://localhost:8080/healthz
curl http://localhost:8080/api/node/info
curl http://localhost:8080/api/python/info
curl http://localhost:8080/api/rust/info
curl -X POST http://localhost:8080/api/node/visits -H "Content-Type: application/json" -d "{\"source\":\"verify\"}"
curl http://localhost:8080/api/python/compute/primes?limit=1000000

# 4) 打開網頁
start http://localhost:8080        # Windows
# open http://localhost:8080       # macOS
```

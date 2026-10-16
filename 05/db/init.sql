-- =============================================================================
--  PostgreSQL 初始化腳本
--  掛載到 /docker-entrypoint-initdb.d/ 之下，官方映像檔會在「第一次」建立資料庫
--  時自動執行本檔（volume 內已有資料時不會再執行）。
-- =============================================================================

-- 造訪紀錄表：前端按下「記錄一次造訪」時，由 node-api 寫入一筆
CREATE TABLE IF NOT EXISTS page_visits (
    id         BIGSERIAL   PRIMARY KEY,
    source     TEXT        NOT NULL DEFAULT 'web',
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_created_at
    ON page_visits (created_at DESC);

-- 服務事件表：記錄系統發生過的事情（例如服務啟動）
CREATE TABLE IF NOT EXISTS service_events (
    id        BIGSERIAL   PRIMARY KEY,
    service   TEXT        NOT NULL,
    note      TEXT        NOT NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 先放幾筆種子資料，讓第一次打開網頁就有內容
INSERT INTO page_visits (source, user_agent)
VALUES ('seed', 'init.sql'), ('seed', 'init.sql'), ('seed', 'init.sql');

INSERT INTO service_events (service, note)
VALUES ('system', '資料庫初始化完成');

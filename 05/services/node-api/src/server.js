'use strict';

/**
 * =============================================================================
 *  node-api —— Node.js / Express 微服務
 * -----------------------------------------------------------------------------
 *  這是整個系統中「唯一」與 PostgreSQL 連線的服務。
 *  其他服務（python-api / rust-api）都是無狀態的，方便展示微服務的不同型態。
 *
 *  提供端點：
 *    GET  /health          健康檢查（給 Docker HEALTHCHECK 與網頁用）
 *    GET  /info            服務資訊（版本、執行環境、記憶體、Uptime…）
 *    GET  /visits          取得造訪次數（讀 PostgreSQL）
 *    POST /visits          新增一筆造訪紀錄（寫 PostgreSQL）
 *    GET  /events          最近的服務事件
 *    GET  /db              資料庫資訊（版本、大小、延遲）
 * =============================================================================
 */

const express = require('express');
const { Pool } = require('pg');
const os = require('node:os');
const pkg = require('../package.json');

const PORT = Number(process.env.PORT || 3000);
const SERVICE_NAME = process.env.SERVICE_NAME || 'node-api';
const STARTED_AT = new Date();
const START_MS = Date.now();
let requestCount = 0;

// -----------------------------------------------------------------------------
// PostgreSQL 連線池
//   DATABASE_URL 由 docker-compose.yml 注入，host 為服務名稱 "db"
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[node-api] 連線池發生閒置錯誤：', err.message);
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // 位於 nginx 反向代理之後
app.use(express.json());

// 請求計數中介層
app.use((req, res, next) => {
  requestCount += 1;
  next();
});

// -----------------------------------------------------------------------------
// 小工具
// -----------------------------------------------------------------------------
const uptimeSeconds = () => Number(((Date.now() - START_MS) / 1000).toFixed(3));

function humanBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

async function databaseStatus() {
  const started = Date.now();
  try {
    const { rows } = await pool.query(
      'SELECT version() AS version, current_database() AS database, pg_database_size(current_database()) AS size'
    );
    const row = rows[0];
    return {
      connected: true,
      server: String(row.version).split(' ').slice(0, 2).join(' '),
      database: row.database,
      size_bytes: Number(row.size),
      size_human: humanBytes(Number(row.size)),
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    return { connected: false, error: err.message, latency_ms: Date.now() - started };
  }
}

// -----------------------------------------------------------------------------
// 路由
// -----------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, uptime_seconds: uptimeSeconds() });
});

app.get('/info', async (req, res) => {
  const db = await databaseStatus();
  const mem = process.memoryUsage();
  res.json({
    service: SERVICE_NAME,
    language: 'Node.js',
    runtime: process.version,
    framework: `Express ${pkg.dependencies.express.replace('^', '')}`,
    driver: `pg ${pkg.dependencies.pg.replace('^', '')}`,
    app_version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
    hostname: os.hostname(),
    platform: `${os.platform()}/${os.arch()}`,
    cpu_count: os.cpus().length,
    total_memory_human: humanBytes(os.totalmem()),
    process_memory_human: humanBytes(mem.rss),
    pid: process.pid,
    started_at: STARTED_AT.toISOString(),
    uptime_seconds: uptimeSeconds(),
    handled_requests: requestCount,
    database: db,
  });
});

app.get('/visits', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total, MAX(created_at) AS latest FROM page_visits'
    );
    res.json({ total: rows[0].total, latest_at: rows[0].latest });
  } catch (err) {
    res.status(503).json({ error: 'database_unavailable', detail: err.message });
  }
});

app.post('/visits', async (req, res) => {
  try {
    const source = (req.body && req.body.source) || 'web';
    const userAgent = (req.headers['user-agent'] || '').slice(0, 250);
    await pool.query('INSERT INTO page_visits (source, user_agent) VALUES ($1, $2)', [
      source,
      userAgent,
    ]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM page_visits');
    res.status(201).json({ ok: true, total: rows[0].total, message: '已寫入 PostgreSQL' });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'database_unavailable', detail: err.message });
  }
});

app.get('/events', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT service, note, logged_at FROM service_events ORDER BY logged_at DESC LIMIT 10'
    );
    res.json({ events: rows });
  } catch (err) {
    res.status(503).json({ error: 'database_unavailable', detail: err.message });
  }
});

app.get('/db', async (req, res) => {
  const db = await databaseStatus();
  if (!db.connected) return res.status(503).json(db);
  res.json(db);
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.originalUrl, service: SERVICE_NAME });
});

// -----------------------------------------------------------------------------
// 啟動
// -----------------------------------------------------------------------------
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${SERVICE_NAME}] 已啟動，監聽 0.0.0.0:${PORT}（Node ${process.version}）`);
  // 寫一筆啟動事件進資料庫（如果資料庫還沒好，只印警告，不讓服務掛掉）
  pool
    .query('INSERT INTO service_events (service, note) VALUES ($1, $2)', [
      SERVICE_NAME,
      `啟動成功，版本 ${pkg.version}`,
    ])
    .catch((err) => console.warn(`[${SERVICE_NAME}] 無法寫入啟動事件：${err.message}`));
});

// Graceful shutdown：讓 docker compose stop 可以優雅結束
const shutdown = (signal) => {
  console.log(`[${SERVICE_NAME}] 收到 ${signal}，正在關閉…`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

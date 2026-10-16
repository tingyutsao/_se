'use strict';

/* =============================================================================
 *  Docker 微服務儀表板 —— 前端邏輯
 * -----------------------------------------------------------------------------
 *  這個檔案由 nginx 提供。所有 API 呼叫都走「相對路徑」：
 *      /api/node/...   → nginx → node-api:3000
 *      /api/python/... → nginx → python-api:8000
 *      /api/rust/...   → nginx → rust-api:8080
 *  前端完全不知道後端容器的 IP，這就是反向代理的價值。
 * ========================================================================== */

const REFRESH_SECONDS = 10;

/* ---------------------------------------------------------------------------
 *  工具函式
 * ------------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function formatUptime(seconds) {
  const s = Math.floor(Number(seconds));
  if (!Number.isFinite(s) || s < 0) return '–';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${d(days)} 天`);
  if (hours) parts.push(`${h} 小時`);
  if (!d && !h) parts.push('');
  return parts.join(' ');
}

function timeAgo(iso) {
  if (!iso) return '–';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return String(iso);
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}

function log(message, kind) {
  const box = document.getElementById('log');
  const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  const symbol = kind === 'err' ? '✗' : '✓';
  if (box.dataset.ready !== '1') {
    box.textContent = '';
    box.dataset.ready = '1';
  }
  box.textContent += `${time}  ${symbol}  ${message}\n`;
  box.scrollTop = box.scrollHeight;
}

async function request(path, options) {
  try {
    const res = await fetch(path, Object.assign({ cache: 'no-store' }, options || {}));
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = { raw: text.trim() };
    }
    return { ok: res.ok, status: res.status, body: body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}

/** 產生一行「標籤 / 數值」 */
function kv(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return (
    '<div class="kv-row"><span class="k">' +
    escapeHtml(label) +
    '</span><span class="v">' +
    escapeHtml(value) +
    '</span></div>'
  );
}

function pill(ok) {
  return ok
    ? '<span class="pill pill-ok">運作中</span>'
    : '<span class="pill pill-bad">無回應</span>';
}

/** 產生一張服務卡片 */
function serviceCard(opts) {
  const ok = Boolean(opts.ok);
  const rows = (opts.rows || []).map((pair) => kv(pair[0], pair[1])).join('');
  const meta = [opts.version, opts.hostname ? '容器 ' + opts.hostname : '', opts.uptime]
    .filter(Boolean)
    .join(' · ');
  return (
    '<article class="card ' +
    (ok ? 'is-ok' : 'is-bad') +
    '">' +
    '<div class="card-head"><div class="card-title"><span class="ico">' +
    escapeHtml(opts.icon || '📦') +
    '</span>' +
    escapeHtml(opts.title) +
    '</div>' +
    pill(ok) +
    '</div>' +
    '<p class="rule">' +
    escapeHtml(meta) +
    '</p>' +
    '<div class="kv">' +
    rows +
    '</div>' +
    (opts.note ? '<p class="rule note">' + escapeHtml(opts.note) + '</p>' : '') +
    '</article>'
  );
}

/* ---------------------------------------------------------------------------
 *  收集所有服務狀態
 * ------------------------------------------------------------------------ */

async function collect() {
  const results = await Promise.all([
    request('/api/node/info'),
    request('/api/python/info'),
    request('/api/rust/info'),
    request('/api/node/visits'),
    request('/healthz'),
  ]);
  return {
    node: results[0],
    python: results[1],
    rust: results[2],
    visits: results[3],
    nginx: results[4],
  };
}

function buildCards(data) {
  const cards = [];

  /* --- nginx --- */
  cards.push(
    serviceCard({
      icon: '🌐',
      title: 'nginx',
      ok: data.nginx.ok,
      version: 'nginx 1.27-alpine（web server + reverse proxy）',
      hostname: 'demo-nginx',
      rows: [
        ['角色', '反向代理 / 靜態網頁伺服器'],
        ['對外埠號', '主機 8080 → 容器 80'],
        ['代理 /api/node/', 'node-api:3000'],
        ['代理 /api/python/', 'python-api:8000'],
        ['代理 /api/rust/', 'rust-api:8080'],
        ['健康檢查 /healthz', data.nginx.ok ? 'ok' : '失敗'],
      ],
      note: '你現在看到的這個頁面，就是 nginx 從容器內 /usr/share/nginx/html 提供的靜態檔案。',
    })
  );

  /* --- node-api --- */
  const node = data.node.body || {};
  const nodeDb = node.database || {};
  cards.push(
    serviceCard({
      icon: '🟩',
      title: 'node-api',
      ok: data.node.ok,
      version: 'Node.js ' + (node.runtime || '?') + '（Express）',
      hostname: node.hostname,
      uptime: node.uptime_seconds != null ? '已運行 ' + formatUptime(node.uptime_seconds) : '',
      rows: [
        ['框架', node.framework],
        ['PostgreSQL 驅動', node.driver],
        ['NODE_ENV', node.environment],
        ['平台', node.platform],
        ['CPU 核心', node.cpu_count],
        ['行程記憶體', node.process_memory_human],
        ['PID', node.pid],
        ['已處理請求', node.handled_requests],
        ['資料庫連線', nodeDb.connected ? '成功（延遲 ' + nodeDb.latency_ms + ' ms）' : '失敗'],
      ],
    })
  );

  /* --- python-api --- */
  const py = data.python.body || {};
  cards.push(
    serviceCard({
      icon: '🐍',
      title: 'python-api',
      ok: data.python.ok,
      version: 'Python ' + (py.runtime || '?') + '（FastAPI + Uvicorn）',
      hostname: py.hostname,
      uptime: py.uptime_seconds != null ? '已運行 ' + formatUptime(py.uptime_seconds) : '',
      rows: [
        ['框架', py.framework],
        ['實作', py.implementation],
        ['平台', py.platform + '/' + py.machine],
        ['CPU 核心', py.cpu_count],
        ['PID', py.pid],
        ['已處理請求', py.handled_requests],
        ['資料庫連線', '不需要（無狀態服務）'],
      ],
      note: '互動區的「質數計算」就是呼叫這個容器。',
    })
  );

  /* --- rust-api --- */
  const rs = data.rust.body || {};
  cards.push(
    serviceCard({
      icon: '🦀',
      title: 'rust-api',
      ok: data.rust.ok,
      version: 'Rust ' + (rs.app_version || '?') + '（' + (rs.runtime || 'stable') + '）',
      hostname: rs.hostname,
      uptime: rs.uptime_seconds != null ? '已運行 ' + formatUptime(rs.uptime_seconds) : '',
      rows: [
        ['框架', rs.framework],
        ['平台', rs.platform],
        ['CPU 核心', rs.cpu_count],
        ['PID', rs.pid],
        ['已處理請求', rs.handled_requests],
        ['資料庫連線', '不需要（無狀態服務）'],
      ],
      note: '使用多階段建置：編譯階段約 1 GB，最終映像檔只有一個執行檔。',
    })
  );

  /* --- PostgreSQL --- */
  const visits = data.visits.body || {};
  cards.push(
    serviceCard({
      icon: '🐘',
      title: 'PostgreSQL',
      ok: Boolean(nodeDb.connected),
      version: nodeDb.server || 'postgres:16-alpine',
      hostname: 'demo-db',
      rows: [
        ['角色', '關聯式資料庫（唯一有狀態的服務）'],
        ['資料庫名稱', nodeDb.database],
        ['資料庫大小', nodeDb.size_human],
        ['查詢延遲', nodeDb.latency_ms != null ? nodeDb.latency_ms + ' ms' : ''],
        ['造訪資料筆數', data.visits.ok ? data.visits.body.total : '無法讀取'],
        ['資料保存', '具名 volume：demo-db-data'],
      ],
      note: '只有 node-api 能連到它（datanet 為 internal 網路，不能連外網）。',
    })
  );

  return cards.join('');
}

/* ---------------------------------------------------------------------------
 *  更新畫面
 * ------------------------------------------------------------------------ */

function updateCountdownLabel() {
  document.getElementById('last-updated').textContent =
    new Date().toLocaleTimeString('zh-TW', { hour12: false });
}

async function refresh(isManual) {
  const data = await collect();
  document.getElementById('cards').innerHTML = buildCards(data);

  /* 整體狀態 */
  const flags = [data.nginx.ok, data.node.ok, data.python.ok, data.rust.ok];
  const okCount = flags.filter(Boolean).length;
  const dbOk = Boolean((data.node.body || {}).database && (data.node.body || {}).database.connected);
  const overall = document.getElementById('overall');
  const allOk = okCount === flags.length && dbOk;

  if (allOk) {
    overall.className = 'pill pill-ok';
    overall.textContent = '全部 ' + (okCount + 1) + ' 個服務正常';
  } else if (okCount > 0) {
    overall.className = 'pill pill-warn';
    overall.textContent = '部分服務異常（' + okCount + '/' + flags.length + ' API 在線）';
  } else {
    overall.className = 'pill pill-bad';
    overall.textContent = '服務無回應';
  }

  if (data.visits.ok) {
    document.getElementById('out-visits').textContent = data.visits.body.total;
  }

  updateCountdownLabel();
  if (isManual) log('已更新服務狀態（' + okCount + '/' + flags.length + ' 個 API 回應正常）');
}

async function showRaw(route) {
  const res = await request(route);
  document.getElementById('raw').textContent =
    'GET ' + route + '  →  HTTP ' + res.status + '\n\n' + JSON.stringify(res.body, null, 2);
}

/* ---------------------------------------------------------------------------
 *  互動動作
 * ------------------------------------------------------------------------ */

async function actionVisit() {
  const res = await request('/api/node/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'web-dashboard' }),
  });
  if (res.ok) {
    document.getElementById('out-visits').textContent = res.body.total;
    log('POST /api/node/visits → 已寫入 PostgreSQL，目前共 ' + res.body.total + ' 筆');
  } else {
    log('POST /api/node/visits 失敗：HTTP ' + res.status, 'err');
  }
}

async function actionVisits() {
  const res = await request('/api/node/visits');
  if (res.ok) {
    document.getElementById('out-visits').textContent = res.body.total;
    log('GET /api/node/visits → ' + res.body.total + ' 筆（最後一筆：' + res.body.latest_at + '）');
  } else {
    log('GET /api/node/visits 失敗：HTTP ' + res.status, 'err');
  }
}

async function actionPrimes() {
  const limit = 1000000;
  log('GET /api/python/compute/primes?limit=' + limit + ' → 運算中…');
  const res = await request('/api/python/compute/primes?limit=' + limit);
  const out = document.getElementById('out-primes');
  if (res.ok) {
    out.textContent =
      limit.toLocaleString('en-US') +
      ' 以下有 ' +
      res.body.prime_count.toLocaleString('en-US') +
      ' 個質數，耗時 ' +
      res.body.elapsed_ms +
      ' ms（容器內 ' +
      res.body.cpu_count +
      ' 核心）';
    log('python-api 回報：' + res.body.prime_count + ' 個質數，' + res.body.elapsed_ms + ' ms');
  } else {
    out.textContent = '失敗：HTTP ' + res.status;
    log('質數計算失敗：HTTP ' + res.status, 'err');
  }
}

async function actionEvents() {
  const res = await request('/api/node/events');
  if (res.ok) {
    const rows = res.body.events || [];
    log('GET /api/node/events → 共 ' + rows.length + ' 筆');
    rows.slice(0, 5).forEach((row) => {
      log('　[' + row.logged_at + '] ' + row.service + '：' + row.note, 'ok');
    });
  } else {
    log('讀取事件失敗：HTTP ' + res.status, 'err');
  }
}

/* ---------------------------------------------------------------------------
 *  初始化
 * ------------------------------------------------------------------------ */

function init() {
  document.getElementById('btn-refresh').addEventListener('click', () => refresh(true));
  document.getElementById('btn-visit').addEventListener('click', actionVisit);
  document.getElementById('btn-visits').addEventListener('click', actionVisits);
  document.getElementById('btn-primes').addEventListener('click', actionPrimes);
  document.getElementById('btn-events').addEventListener('click', actionEvents);
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      showRaw(tab.dataset.route);
    });
  });

  refresh(false).then(() => showRaw('/api/node/info'));

  let countdown = REFRESH_SECONDS;
  setInterval(() => {
    countdown -= 1;
    if (countdown <= 0) {
      countdown = REFRESH_SECONDS;
      refresh(false);
    }
    document.title =
      (countdown <= 3 ? '⏳ ' : '') + 'Docker 微服務系統儀表板（' + countdown + 's）';
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);

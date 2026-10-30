/* =====================================================
   SubKeeper 訂閱管家 — 純前端邏輯（無外部套件）
   資料存於 localStorage（key: subkeeper-v1）
   ===================================================== */
'use strict';

/* ---------- 常數設定 ---------- */

const STORAGE_KEY = 'subkeeper-v1';

// 對 TWD 的固定估計匯率（介面上已標示僅供參考）
const RATES = { TWD: 1, USD: 32, JPY: 0.21, EUR: 35 };

// 週期設定：一個週期 = 幾個月
const CYCLE_MONTHS = { month: 1, quarter: 3, year: 12 };

const CATS = ['影音', '音樂', 'AI 工具', '雲端', '軟體', '遊戲', '學習', '生活', '其他'];

const WARN_DAYS = 7; // N 天內扣款以警示色標示

/* ---------- 狀態 ---------- */

let subs = []; // { id, name, amount, cur, cycle, next, cat, flag }

/* ---------- DOM ---------- */

const $ = (sel) => document.querySelector(sel);
const els = {
  form: $('#subForm'),
  name: $('#fName'),
  amount: $('#fAmount'),
  cur: $('#fCur'),
  cycle: $('#fCycle'),
  next: $('#fNext'),
  cat: $('#fCat'),
  list: $('#subList'),
  listHint: $('#listHint'),
  catBars: $('#catBars'),
  statMonthly: $('#statMonthly'),
  statYearly: $('#statYearly'),
  statSave: $('#statSave'),
  statSaveCount: $('#statSaveCount'),
  btnSample: $('#btnSample'),
  btnClear: $('#btnClear'),
};

/* ---------- 工具函式 ---------- */

// 回傳今天的日期字串 YYYY-MM-DD（本地時區）
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' → 本地時區 0 時的 Date
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 日期字串加上 n 個月（處理月末溢位，例如 1/31 + 1 月 → 2/28）
function addMonths(dateStr, n) {
  const d = parseDate(dateStr);
  const targetMonth = d.getMonth() + n;
  const lastDay = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  d.setMonth(targetMonth, Math.min(d.getDate(), lastDay));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 到期日加上一個扣款週期
function nextCycle(dateStr, cycle) {
  return addMonths(dateStr, CYCLE_MONTHS[cycle] || 1);
}

// 距今天還有幾天（到期日 0 時 - 今天 0 時）
function daysUntil(dateStr) {
  const diff = parseDate(dateStr) - parseDate(todayStr());
  return Math.round(diff / 86400000);
}

// 單筆訂閱每月成本（換算 TWD）
function monthlyCost(sub) {
  return Number(sub.amount) * RATES[sub.cur] / CYCLE_MONTHS[sub.cycle];
}

// 格式化 TWD 金額（整數，千位逗號）
function fmtTWD(n) {
  return Math.round(n).toLocaleString('zh-TW') + ' 元';
}

// 格式化原始金額（保留原幣別）＋當地慣用格式
function fmtAmount(sub) {
  const sym = { TWD: 'NT$', USD: 'US$', JPY: '¥', EUR: '€' }[sub.cur] || '';
  return sym + Number(sub.amount).toLocaleString('zh-TW');
}

// 週期顯示文字
function cycleLabel(cycle) {
  return { month: '每月', quarter: '每季', year: '每年' }[cycle] || '每月';
}

/* ---------- 資料存取 ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return []; // 讀不到：空狀態
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // 過濾不完整的資料，保持模型一致
    return data.filter((s) =>
      s && typeof s.name === 'string' &&
      Number.isFinite(Number(s.amount)) &&
      typeof s.next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.next)
    );
  } catch (e) {
    console.warn('SubKeeper：讀取資料失敗，改用空狀態', e);
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  } catch (e) {
    console.warn('SubKeeper：儲存資料失敗', e);
    toast('⚠️ 儲存失敗（瀏覽器空間或設定問題），資料可能不會保留');
  }
}

/* ---------- 核心處理 ---------- */

// 過期扣款日自動順延到第一個「不早於今天」的日期
function rollOver() {
  const today = todayStr();
  for (const s of subs) {
    let guard = 0; // 防呆：避免異常資料造成無窮迴圈
    while (s.next < today && guard++ < 2400) {
      s.next = nextCycle(s.next, s.cycle);
    }
  }
}

// 產生簡單的唯一 id
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- 渲染 ---------- */

function render() {
  rollOver();
  subs.sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.name.localeCompare(b.name, 'zh-Hant')));

  // 統計卡
  const monthlyTotal = subs.reduce((sum, s) => sum + monthlyCost(s), 0);
  const saveMonthly = subs.filter((s) => s.flag).reduce((sum, s) => sum + monthlyCost(s), 0);
  els.statMonthly.textContent = fmtTWD(monthlyTotal);
  els.statYearly.textContent = fmtTWD(monthlyTotal * 12);
  els.statSave.textContent = fmtTWD(saveMonthly * 12);
  els.statSaveCount.textContent = saveMonthly > 0
    ? `已標記 ${subs.filter((s) => s.flag).length} 項，等於每月省 ${fmtTWD(saveMonthly)}`
    : '尚未標記任何項目';

  renderList();
  renderCats(monthlyTotal);
}

function renderList() {
  els.list.textContent = '';
  els.listHint.textContent = `共 ${subs.length} 筆，依扣款日排序`;

  if (subs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.append('還沒有任何訂閱。');
    const b = document.createElement('strong');
    b.textContent = '在上方新增一筆';
    empty.append(b, '，或按下方「載入範例資料」試試看。');
    els.list.append(empty);
    return;
  }

  for (const s of subs) {
    const days = daysUntil(s.next);
    const row = document.createElement('div');
    row.className = 'sub-row';
    if (days <= WARN_DAYS) row.classList.add('soon');
    if (s.flag) row.classList.add('flagged');

    // 名稱 + 分類標籤（textContent 防止 HTML 注入）
    const nameCell = document.createElement('div');
    nameCell.className = 'sub-name';
    nameCell.append(s.name);
    const chip = document.createElement('span');
    chip.className = 'cat-chip';
    chip.textContent = s.cat;
    nameCell.append(chip);
    if (s.flag) {
      const flagSpan = document.createElement('span');
      flagSpan.className = 'sub-flag';
      flagSpan.textContent = '※ 考慮取消';
      nameCell.append(document.createElement('br'), flagSpan);
    }

    // 原始金額
    const amountCell = document.createElement('div');
    amountCell.className = 'sub-amount';
    amountCell.textContent = `${fmtAmount(s)} / ${cycleLabel(s.cycle).slice(1)}`;

    // 每月換算
    const monthlyCell = document.createElement('div');
    monthlyCell.className = 'sub-monthly';
    monthlyCell.textContent = `每月約 ${fmtTWD(monthlyCost(s))}`;

    // 下次扣款日
    const nextCell = document.createElement('div');
    nextCell.className = 'sub-next';
    const daysText = days <= 0 ? '今天扣款' : `${days} 天後扣款`;
    nextCell.append(`${s.next}`);
    const daysSpan = document.createElement('span');
    daysSpan.className = 'days';
    daysSpan.textContent = daysText;
    nextCell.append(daysSpan);

    // 操作按鈕
    const actions = document.createElement('div');
    actions.className = 'sub-actions';

    const flagBtn = document.createElement('button');
    flagBtn.type = 'button';
    flagBtn.dataset.id = s.id;
    flagBtn.dataset.act = 'flag';
    flagBtn.className = 'btn small' + (s.flag ? ' flag-on' : ' ghost');
    flagBtn.textContent = s.flag ? '保留' : '取消？';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.dataset.id = s.id;
    delBtn.dataset.act = 'del';
    delBtn.className = 'btn small ghost del';
    delBtn.textContent = '刪除';

    actions.append(flagBtn, delBtn);

    row.append(nameCell, amountCell, monthlyCell, nextCell, actions);
    els.list.append(row);
  }
}

function renderCats(monthlyTotal) {
  els.catBars.textContent = '';

  if (subs.length === 0) {
    const p = document.createElement('p');
    p.style.color = 'var(--text-soft)';
    p.textContent = '新增訂閱後，這裡會顯示各分類的支出占比。';
    els.catBars.append(p);
    return;
  }

  // 依分類加總每月成本
  const byCat = new Map();
  for (const s of subs) {
    byCat.set(s.cat, (byCat.get(s.cat) || 0) + monthlyCost(s));
  }
  const items = [...byCat.entries()].sort((a, b) => b[1] - a[1]);

  for (const [cat, cost] of items) {
    const pct = monthlyTotal > 0 ? (cost / monthlyTotal) * 100 : 0;
    const row = document.createElement('div');
    row.className = 'cat-row';

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = cat;

    const bar = document.createElement('div');
    bar.className = 'cat-bar';
    const fill = document.createElement('div');
    fill.className = 'cat-fill' + (cat === items[0][0] ? ' top' : '');
    fill.style.width = `${pct.toFixed(1)}%`;
    bar.append(fill);

    const fig = document.createElement('span');
    fig.className = 'cat-fig';
    const strong = document.createElement('strong');
    strong.textContent = fmtTWD(cost);
    fig.append(strong, `（${pct.toFixed(0)}%）`);

    row.append(name, bar, fig);
    els.catBars.append(row);
  }
}

/* ---------- 提示訊息 ---------- */

let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 事件 ---------- */

// 新增訂閱
els.form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = els.name.value.trim();
  const amount = Number(els.amount.value);
  const next = els.next.value;

  if (!name) return toast('請輸入名稱');
  if (!Number.isFinite(amount) || amount <= 0) return toast('金額必須大於 0');
  if (!next) return toast('請選擇下次扣款日');

  subs.push({
    id: genId(),
    name,
    amount,
    cur: els.cur.value,
    cycle: els.cycle.value,
    next,
    cat: els.cat.value,
    flag: false,
  });
  save();
  render();

  els.form.reset();
  els.cat.value = '影音';
  els.name.focus();
  toast(`已新增「${name}」`);
});

// 列表上的「取消？／保留」與「刪除」（事件委派）
els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const sub = subs.find((s) => s.id === id);
  if (!sub) return;

  if (btn.dataset.act === 'flag') {
    sub.flag = !sub.flag;
    save();
    render();
    toast(sub.flag ? `已標記「${sub.name}」為考慮取消` : `已將「${sub.name}」改回保留`);
  } else if (btn.dataset.act === 'del') {
    subs = subs.filter((s) => s.id !== id);
    save();
    render();
    toast(`已刪除「${sub.name}」`);
  }
});

// 載入範例資料
els.btnSample.addEventListener('click', () => {
  const sample = [
    { amount: 390,  cur: 'TWD', cycle: 'month',   name: 'Netflix',        cat: '影音',    offset: 3,  flag: false },
    { amount: 165,  cur: 'TWD', cycle: 'month',   name: 'Spotify',        cat: '音樂',    offset: 12, flag: false },
    { amount: 20,   cur: 'USD', cycle: 'month',   name: 'ChatGPT Plus',   cat: 'AI 工具', offset: 6,  flag: false },
    { amount: 300,  cur: 'JPY', cycle: 'month',   name: 'iCloud 200GB',   cat: '雲端',    offset: 19, flag: false },
    { amount: 448,  cur: 'TWD', cycle: 'month',   name: 'Xbox Game Pass', cat: '遊戲',    offset: 4,  flag: true  },
    { amount: 3290, cur: 'TWD', cycle: 'year',    name: 'Microsoft 365',  cat: '軟體',    offset: 45, flag: false },
    { amount: 1188, cur: 'TWD', cycle: 'quarter', name: '洗車場會員',      cat: '生活',    offset: 27, flag: true  },
    { amount: 550,  cur: 'TWD', cycle: 'month',   name: '線上健身課',      cat: '生活',    offset: 9,  flag: true  },
  ];
  const base = new Date();
  subs = sample.map((it) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + it.offset);
    return {
      id: genId(),
      name: it.name,
      amount: it.amount,
      cur: it.cur,
      cycle: it.cycle,
      next: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      cat: it.cat,
      flag: it.flag,
    };
  });
  save();
  render();
  toast('已載入範例資料（現有資料已取代）');
});

// 清空全部（先確認）
els.btnClear.addEventListener('click', () => {
  if (subs.length === 0) return toast('目前沒有資料');
  const ok = confirm(`確定要清空全部 ${subs.length} 筆訂閱資料嗎？此動作無法復原。`);
  if (!ok) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('SubKeeper：清除資料失敗', e);
  }
  subs = [];
  render();
  toast('已清空全部資料');
});

/* ---------- 初始化 ---------- */

function init() {
  // 填入分類下拉選單
  for (const c of CATS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.cat.append(opt);
  }
  // 預設扣款日＝今天
  els.next.value = todayStr();

  subs = load();
  render();
}

init();

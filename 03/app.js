/* CampusPulse — 零依賴原生 JS：Storage / CRUD / 投票 / 搜尋排序 / 留言串 */
const LS_POSTS = "campuspulse_posts_v1";
const LS_VOTES = "campuspulse_votes_v1";

const BOARDS = [
  { id: "all",    icon: "🌐", name: "全部看板", desc: "橫跨閒聊、二手、揪團的校園資訊流。即時搜尋 + 最新 / 熱門排序。" },
  { id: "chat",   icon: "💬", name: "閒聊匿名牆", desc: "選課評價、課程請益、心聲傾訴。一鍵匿名，暢所欲言。" },
  { id: "market", icon: "🛍", name: "二手市集", desc: "課本、器材、宿舍良品面交。標明價格與面交地點更快成交。" },
  { id: "sport",  icon: "🏸", name: "運動 / 活動揪團", desc: "羽球、路跑、重訓搭子、社團活動。在這裡找隊友不怕被洗版。" },
];

const TAGS = {
  chat: ["請益", "心聲", "課程", "閒聊", "爆料"],
  market: ["出售", "徵求", "免費贈送", "面交"],
  sport: ["揪團", "活動", "比賽", "社團"],
};
const ALL_TAGS = [...new Set(Object.values(TAGS).flat())];

const ANON_ADJ = ["小鹿", "夜貓", "飛魚", "雲朵", "星星", "抹茶", "珍奶", "月光", "微風", "暖陽", "薄荷", "可頌"];
const ANON_PRE = ["匿名", "路過", "深夜", "晨曦", "校園"];

const $ = (s) => document.querySelector(s);
const feedEl = $("#feed"), boardListEl = $("#boardList"), tagCloudEl = $("#tagCloud");
const tagFilterRowEl = $("#tagFilterRow"), boardTitleEl = $("#boardTitle"), boardDescEl = $("#boardDesc");
const searchInput = $("#searchInput"), clearSearchBtn = $("#clearSearch");

const state = { board: "all", search: "", sort: "new", tag: "全部", detailId: null, replyTo: null };

/* ---------- Seed Data ---------- */
function seedPosts() {
  return [
    { id: "post_1009", board: "sport", tag: "揪團", author: "系隊小隊長", isAnonymous: false, pinned: true, title: "【置頂】週三晚上羽球新手友善團，還缺 2 位！", content: "地點：學校體育館 3F 羽球場\n時間：每週三 19:00–21:00\n程度：新手友善，備有初學拍可借\n費用：場地均攤約 50 元/人\n留言報名即可，我會私訊群組連結！", likes: 48, timestamp: "2026-10-04 09:00", comments: [
      { commentId: "c_901", author: "匿名小鹿", content: "新手+1！完全沒打過可以嗎？", timestamp: "2026-10-04 09:12" },
      { commentId: "c_902", author: "系隊小隊長", content: "可以！我們會先帶熱身跟基本發球～", timestamp: "2026-10-04 09:15", replyTo: "匿名小鹿" },
    ]},
    { id: "post_1001", board: "market", tag: "出售", author: "羽球愛好者", isAnonymous: false, title: "出清九成新 Yonex 拍與重訓手套", content: "換新裝備故售出，拍況良好無敲傷。\n• Yonex Nanoflare 4U+G5，附拍袋：1800 元\n• 重訓半指手套 M 號：200 元\n可面交（圖書館一樓）或郵寄，意者底下留言！", likes: 12, timestamp: "2026-10-04 10:15", comments: [
      { commentId: "c_01", author: "匿名小鹿", content: "請問球拍型號與握把規格？有興趣！", timestamp: "2026-10-04 10:20" },
    ]},
    { id: "post_1002", board: "chat", tag: "請益", author: "匿名夜貓", isAnonymous: true, title: "求問：林教授的經濟學會當很多人嗎？", content: "下學期想選林教授的經濟學，聽說給分很甜但報告很重？有修過的學長姐可以分享經驗嗎？#請益", likes: 25, timestamp: "2026-10-03 22:40", comments: [
      { commentId: "c_11", author: "修過的老人", content: "報告佔 40%，但照著架構寫基本都有 A- 以上。點名每堂都有，別翹課。", timestamp: "2026-10-03 23:02" },
      { commentId: "c_12", author: "匿名夜貓", content: "感謝！請問報告是個人還是分組？", timestamp: "2026-10-03 23:10", replyTo: "修過的老人" },
    ]},
    { id: "post_1003", board: "chat", tag: "心聲", author: "匿名雲朵", isAnonymous: true, title: "期中考週圖書館一位難求，好焦慮…", content: "連續三天早上七點去排隊還是沒位子，大家都怎麼撐過期中考週的？求讀書地點推薦。", likes: 31, timestamp: "2026-10-03 08:10", comments: [
      { commentId: "c_21", author: "深夜圖書館員", content: "推系館 3F 討論室，冷氣強、人少，記得帶外套。", timestamp: "2026-10-03 09:00" },
    ]},
    { id: "post_1004", board: "market", tag: "徵求", author: "宿舍小資族", isAnonymous: false, title: "徵求二手腳踏車，預算 1500 內", content: "宿舍到校區走路 15 分鐘太累了，想收一台堪用的腳踏車，有籃子佳。後門面交，現金付款！", likes: 6, timestamp: "2026-10-02 18:30", comments: [] },
    { id: "post_1005", board: "sport", tag: "揪團", author: "匿名飛魚", isAnonymous: true, title: "晨跑團徵人！每週二四 6:30 操場見", content: "配速 6'30–7'30，跑 3–5K 就好，跑完一起吃早餐。歡迎初學者，風雨無阻（颱風除外）。", likes: 19, timestamp: "2026-10-02 07:00", comments: [
      { commentId: "c_51", author: "早八戰士", content: "+1！剛好跑完去上早八。", timestamp: "2026-10-02 08:20" },
    ]},
    { id: "post_1006", board: "market", tag: "免費贈送", author: "畢業學姊", isAnonymous: false, sponsored: true, title: "畢業出清：原文書免費贈（先留言先得）", content: "心理學導論、統計學原文書，書況不錯有筆記。希望給有需要的學弟妹，面交地點：女宿大廳。\n（本帖為二手市集示範贊助置頂位）", likes: 42, timestamp: "2026-10-01 15:00", comments: [
      { commentId: "c_61", author: "大一新生", content: "想要統計學！已私訊，謝謝學姊！", timestamp: "2026-10-01 16:40" },
    ]},
    { id: "post_1007", board: "chat", tag: "課程", author: "選課雷達", isAnonymous: false, title: "通識課評價整理：這三門可以閉眼選", content: "1. 電影與人生（給分甜、每週看電影寫 300 字心得）\n2. 城市散步學（戶外課、期末海報展）\n3. 心理與生活（考試開書考，記得買課本）\n避雷：週五早八的哲學導論，點名很嚴。", likes: 56, timestamp: "2026-10-01 12:00", comments: [
      { commentId: "c_71", author: "匿名抹茶", content: "補充：電影與人生今年換助教了，心得改 500 字，還是推。", timestamp: "2026-10-01 13:22" },
      { commentId: "c_72", author: "選課雷達", content: "感謝補充！已更新到共筆。", timestamp: "2026-10-01 14:00", replyTo: "匿名抹茶" },
    ]},
    { id: "post_1008", board: "sport", tag: "活動", author: "熱音社社長", isAnonymous: false, title: "熱音社期初成發：10/12 晚上小劇場免費入場", content: "五組樂團 + 新生體驗團，現場有二手器材義賣，收入捐給流浪動物。歡迎來玩，需要志工 4 位（供餐+時數）！", likes: 22, timestamp: "2026-09-30 20:00", comments: [] },
  ];
}

/* ---------- Storage 模組（含防呆） ---------- */
const Storage = {
  loadPosts() {
    try {
      const raw = localStorage.getItem(LS_POSTS);
      if (!raw) { const s = seedPosts(); localStorage.setItem(LS_POSTS, JSON.stringify(s)); return s; }
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error("bad shape");
      return data;
    } catch { const s = seedPosts(); localStorage.setItem(LS_POSTS, JSON.stringify(s)); return s; }
  },
  savePosts(p) { try { localStorage.setItem(LS_POSTS, JSON.stringify(p)); } catch {} },
  loadVotes() {
    try { const v = JSON.parse(localStorage.getItem(LS_VOTES) || "{}"); return (v && typeof v === "object") ? v : {}; }
    catch { return {}; }
  },
  saveVotes(v) { try { localStorage.setItem(LS_VOTES, JSON.stringify(v)); } catch {} },
  reset() { localStorage.removeItem(LS_POSTS); localStorage.removeItem(LS_VOTES); },
};

let posts = Storage.loadPosts();
let votes = Storage.loadVotes();

/* ---------- 小工具 ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const boardOf = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0];
const timeVal = (t) => Date.parse(String(t).replace(" ", "T")) || 0;
function randomAnon() {
  const pre = ANON_PRE[Math.floor(Math.random() * ANON_PRE.length)];
  const adj = ANON_ADJ[Math.floor(Math.random() * ANON_ADJ.length)];
  return `${pre}${adj}`;
}
function nowStr() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------- 篩選 / 排序（模糊搜尋：標題+內文+標籤+作者） ---------- */
function filteredPosts() {
  const kw = state.search.trim().toLowerCase();
  let list = posts.filter((p) => {
    if (state.board !== "all" && p.board !== state.board) return false;
    if (state.tag !== "全部" && p.tag !== state.tag) return false;
    if (!kw) return true;
    return [p.title, p.content, p.tag, p.author].join(" ").toLowerCase().includes(kw);
  });
  const pinned = list.filter((p) => p.pinned);
  const rest = list.filter((p) => !p.pinned);
  const cmp = state.sort === "hot"
    ? (a, b) => b.likes - a.likes || timeVal(b.timestamp) - timeVal(a.timestamp)
    : (a, b) => timeVal(b.timestamp) - timeVal(a.timestamp);
  return [...pinned.sort(cmp), ...rest.sort(cmp)];
}

/* ---------- 渲染 ---------- */
function renderBoards() {
  const counts = { all: posts.length };
  for (const b of BOARDS.slice(1)) counts[b.id] = posts.filter((p) => p.board === b.id).length;
  boardListEl.innerHTML = BOARDS.map((b) => `
    <button class="board-item ${state.board === b.id ? "active" : ""}" data-board="${b.id}">
      <span style="font-size:18px">${b.icon}</span>
      <span>${esc(b.name)}<span class="bdesc">${b.id === "all" ? "所有分類動態" : boardSub(b.id)}</span></span>
      <span class="count">${counts[b.id] ?? 0}</span>
    </button>`).join("");
  boardListEl.querySelectorAll("[data-board]").forEach((btn) =>
    btn.addEventListener("click", () => { state.board = btn.dataset.board; state.tag = "全部"; renderAll(); }));
}
function boardSub(id) {
  return id === "chat" ? "匿名・請益・心聲" : id === "market" ? "買賣・面交・贈送" : "找隊友・活動・社團";
}

function renderTagFilters() {
  const tags = state.board === "all" ? ["全部", ...ALL_TAGS] : ["全部", ...TAGS[state.board]];
  tagFilterRowEl.innerHTML = tags.map((t) =>
    `<button class="chip ${state.tag === t ? "active" : ""}" data-tag="${esc(t)}">${t === "全部" ? "全部標籤" : "#" + esc(t)}</button>`).join("");
  tagFilterRowEl.querySelectorAll("[data-tag]").forEach((b) =>
    b.addEventListener("click", () => { state.tag = b.dataset.tag; renderAll(); }));
  tagCloudEl.innerHTML = ALL_TAGS.map((t) =>
    `<button class="${state.tag === t ? "active" : ""}" data-cloud="${esc(t)}">#${esc(t)}</button>`).join("");
  tagCloudEl.querySelectorAll("[data-cloud]").forEach((b) =>
    b.addEventListener("click", () => {
      for (const [bid, arr] of Object.entries(TAGS)) if (arr.includes(b.dataset.cloud)) { state.board = bid; break; }
      state.tag = b.dataset.cloud; renderAll();
    }));
}

function voteClass(id) { return votes[id] === 1 ? "voted-up" : votes[id] === -1 ? "voted-down" : ""; }

function renderFeed() {
  const b = boardOf(state.board);
  boardTitleEl.textContent = state.board === "all" ? "全部動態" : `${b.icon} ${b.name}`;
  boardDescEl.textContent = b.desc + (state.search ? ` · 搜尋「${state.search}」` : "") + ` · ${state.sort === "hot" ? "熱門排序" : "最新排序"}`;
  const list = filteredPosts();
  $("#emptyState").hidden = list.length !== 0;
  feedEl.innerHTML = list.map((p) => {
    const pb = boardOf(p.board);
    return `<article class="post-card ${p.pinned ? "pinned" : ""}" data-id="${p.id}" tabindex="0">
      <div class="post-top">
        <span class="pill ${p.board}">${pb.icon} ${pb.name}</span>
        <span class="tag">#${esc(p.tag)}</span>
        ${p.pinned ? `<span class="pin-badge">📌 置頂</span>` : ""}
        ${p.sponsored ? `<span class="sp-badge">贊助</span>` : ""}
      </div>
      <h2>${esc(p.title)}</h2>
      <p class="excerpt">${esc(p.content)}</p>
      <div class="post-meta">
        <span>${p.isAnonymous ? "🕵️" : "👤"} ${esc(p.author)}</span>
        <span>🕘 ${esc(p.timestamp)}</span>
      </div>
      <div class="vote-row">
        <button class="vote-btn ${voteClass(p.id)}" data-vote="1" data-id="${p.id}">▲ 推 ${p.likes}</button>
        <button class="vote-btn ${votes[p.id] === -1 ? "voted-down" : ""}" data-vote="-1" data-id="${p.id}">▼ 噓</button>
        <span class="comment-link">💬 ${p.comments.length} 則留言 · 點擊展開 →</span>
      </div>
    </article>`;
  }).join("");
  feedEl.querySelectorAll(".post-card").forEach((card) =>
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-vote]")) return;
      openDetail(card.dataset.id);
    }));
  feedEl.querySelectorAll("[data-vote]").forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); vote(btn.dataset.id, Number(btn.dataset.vote)); }));
  $("#statPosts").textContent = posts.length;
  $("#statComments").textContent = posts.reduce((n, p) => n + p.comments.length, 0);
  $("#statLikes").textContent = posts.reduce((n, p) => n + Math.max(0, p.likes), 0);
}

/* ---------- 投票（含重複點擊防呆：再點一次取消） ---------- */
function vote(id, dir) {
  const p = posts.find((x) => x.id === id); if (!p) return;
  const cur = votes[id] || 0;
  if (cur === dir) { p.likes -= dir; delete votes[id]; toast("已取消投票"); }
  else { p.likes += dir - cur; votes[id] = dir; toast(dir === 1 ? "已推文 +1" : "已噓文 −1"); }
  Storage.savePosts(posts); Storage.saveVotes(votes);
  renderFeed();
  if (state.detailId === id) syncDetailVotes(p);
}

/* ---------- 詳情 + 留言（含 @回覆巢狀） ---------- */
function openDetail(id) {
  state.detailId = id; state.replyTo = null;
  const p = posts.find((x) => x.id === id); if (!p) return;
  const pb = boardOf(p.board);
  $("#detailBoard").textContent = `${pb.icon} ${pb.name}`;
  $("#detailBoard").className = "pill " + p.board;
  $("#detailTag").textContent = "#" + p.tag;
  $("#detailTitle").textContent = p.title;
  $("#detailMeta").textContent = `${p.isAnonymous ? "🕵️" : "👤"} ${p.author} · 🕘 ${p.timestamp} · ${p.comments.length} 則留言`;
  $("#detailContent").textContent = p.content;
  renderComments(p); syncDetailVotes(p);
  $("#detailModal").hidden = false;
}
function syncDetailVotes(p) {
  $("#detailLikes").textContent = p.likes;
  $("#detailUp").className = "vote-btn" + (votes[p.id] === 1 ? " voted-up" : "");
  $("#detailDown").className = "vote-btn" + (votes[p.id] === -1 ? " voted-down" : "");
}
function renderComments(p) {
  $("#commentCount").textContent = p.comments.length;
  $("#commentList").innerHTML = p.comments.length === 0
    ? `<p style="color:var(--muted);font-size:13px">還沒有留言，來搶頭香吧！</p>`
    : p.comments.map((c) => `
      <div class="comment">
        <div class="c-meta"><b>${esc(c.author)}</b><span>${esc(c.timestamp)}</span>
        ${c.replyTo ? `<span class="reply-to-tag">↩ 回覆 ${esc(c.replyTo)}</span>` : ""}</div>
        <div>${esc(c.content)}</div>
        <div class="c-actions"><button class="link-btn" data-reply="${esc(c.author)}">↩ 回覆</button></div>
      </div>`).join("");
  $("#commentList").querySelectorAll("[data-reply]").forEach((b) =>
    b.addEventListener("click", () => {
      state.replyTo = b.dataset.reply;
      $("#replyTarget").textContent = state.replyTo;
      $("#replyingTo").hidden = false; $("#cContent").focus();
    }));
}

function renderAll() { renderBoards(); renderTagFilters(); renderFeed(); }

/* ---------- 發文 ---------- */
const fBoard = $("#fBoard"), fTag = $("#fTag");
function syncTagOptions() {
  fTag.innerHTML = TAGS[fBoard.value].map((t) => `<option value="${t}">${t}</option>`).join("");
}
function openModal(id) { $(`#${id}`).hidden = false; }
function closeModal(id) { $(`#${id}`).hidden = true; }

function renderAllAndPersist() { Storage.savePosts(posts); renderAll(); if (state.detailId) { const p = posts.find((x) => x.id === state.detailId); if (p) { renderComments(p); syncDetailVotes(p); } } }

/* ---------- 事件綁定 ---------- */
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach((bd) =>
  bd.addEventListener("click", (e) => { if (e.target === bd) bd.hidden = true; }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal("postModal"); closeModal("detailModal"); } });

$("#openPostModal").addEventListener("click", () => { syncTagOptions(); $("#formError").hidden = true; openModal("postModal"); });
$("#emptyPostBtn").addEventListener("click", () => openModal("postModal"));
$("#brandHome").addEventListener("click", () => { state.board = "all"; state.tag = "全部"; state.search = ""; searchInput.value = ""; clearSearchBtn.hidden = true; renderAll(); });
fBoard.addEventListener("change", syncTagOptions);
$("#fAnon").addEventListener("change", (e) => {
  $("#fAuthor").disabled = e.target.checked;
  $("#anonHint").textContent = e.target.checked ? "開啟後將由系統隨機指派如「匿名小鹿」之代號。" : "關閉匿名後將以你填寫的暱稱公開顯示。";
});
$("#cAnon").addEventListener("change", (e) => { $("#cAuthor").disabled = e.target.checked; });

$("#postForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const err = $("#formError");
  const title = $("#fTitle").value.trim(), content = $("#fContent").value.trim();
  const anon = $("#fAnon").checked;
  let author = $("#fAuthor").value.trim();
  if (!title || !content) { err.textContent = "標題與內文為必填喔！"; err.hidden = false; return; }
  if (!anon && !author) { err.textContent = "關閉匿名時請填寫暱稱，或改為開啟完全匿名。"; err.hidden = false; return; }
  if (anon) author = author || randomAnon();
  posts.unshift({ id: "post_" + Date.now(), board: fBoard.value, tag: fTag.value, author, isAnonymous: anon, title, content, likes: 0, timestamp: nowStr(), comments: [] });
  err.hidden = true; e.target.reset(); $("#fAnon").checked = true; $("#fAuthor").disabled = true;
  closeModal("postModal"); state.board = "all"; state.tag = "全部";
  renderAllAndPersist(); toast("🎉 發文成功！");
});

$("#commentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const p = posts.find((x) => x.id === state.detailId); if (!p) return;
  const content = $("#cContent").value.trim(); if (!content) { toast("留言內容不可空白"); return; }
  const anon = $("#cAnon").checked;
  let author = $("#cAuthor").value.trim() || (anon ? randomAnon() : "");
  if (!author) { toast("請填暱稱或勾選匿名"); return; }
  p.comments.push({ commentId: "c_" + Date.now(), author, content, timestamp: nowStr(), ...(state.replyTo ? { replyTo: state.replyTo } : {}) });
  $("#cContent").value = ""; state.replyTo = null; $("#replyingTo").hidden = true;
  renderAllAndPersist(); toast("💬 留言已送出");
});
$("#cancelReply").addEventListener("click", () => { state.replyTo = null; $("#replyingTo").hidden = true; });

$("#detailUp").addEventListener("click", () => vote(state.detailId, 1));
$("#detailDown").addEventListener("click", () => vote(state.detailId, -1));

searchInput.addEventListener("input", () => {
  state.search = searchInput.value; clearSearchBtn.hidden = !searchInput.value; renderFeed(); renderBoards();
});
clearSearchBtn.addEventListener("click", () => { searchInput.value = ""; state.search = ""; clearSearchBtn.hidden = true; renderFeed(); });

$("#sortNew").addEventListener("click", () => setSort("new"));
$("#sortHot").addEventListener("click", () => setSort("hot"));
function setSort(s) {
  state.sort = s;
  $("#sortNew").classList.toggle("active", s === "new");
  $("#sortHot").classList.toggle("active", s === "hot");
  $("#sortNew").setAttribute("aria-selected", s === "new");
  $("#sortHot").setAttribute("aria-selected", s === "hot");
  renderFeed();
}

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("確定要重置展示資料嗎？你的發文與投票將還原為初始範例。")) return;
  Storage.reset(); posts = Storage.loadPosts(); votes = Storage.loadVotes();
  Object.assign(state, { board: "all", search: "", sort: "new", tag: "全部", detailId: null });
  searchInput.value = ""; clearSearchBtn.hidden = true; setSort("new");
  renderAll(); toast("↺ 已還原展示資料");
});
$("#sponsorLink").addEventListener("click", (e) => { e.preventDefault(); toast("Demo：贊助方案 — 置頂橫幅 / 付費置頂 24hr，歡迎洽詢 📩"); });

/* ---------- 啟動 ---------- */
$("#fAuthor").disabled = true;
syncTagOptions();
renderAll();

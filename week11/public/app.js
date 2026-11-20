/* =========================================================
   StudyBox · 前端邏輯
   以 body[data-page] 區分:notes / study / stats
   ========================================================= */

(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const page = document.body.dataset.page || 'notes';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DEFAULT_SUBJECTS = [
    '國文', '英文', '數學', '自然', '社會', '歷史', '地理', '公民',
    '物理', '化學', '生物', '程式設計',
  ];

  const state = {
    page,
    notes: [],
    subjects: [],
    query: '',
    activeSubject: '',
    notesRequestId: 0,
    editingId: null,
    detailNote: null,
    study: {
      notes: [],
      current: null,
      tab: 'quiz',
      generating: false,
      indexLoaded: false,
      quiz: {
        questions: [],
        index: 0,
        selected: null,
        submitted: false,
        submitting: false,
        correct: 0,
        answered: 0,
        finished: false,
        feedback: null,
      },
      cards: {
        deck: [],
        index: 0,
        flipped: false,
        marking: false,
        remembered: 0,
        forgotten: 0,
        finished: false,
      },
    },
    stats: null,
  };

  /* ------------------------------ Icons ------------------------------ */

  const svg = (body, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

  const ICONS = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    pin: svg('<path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Z"/><path d="M12 15v6"/>'),
    edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
    sparkles: svg('<path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3Z"/><path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 3.8 2.2c-.9.5-1.4 1-1.4 2"/><circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none"/>'),
    cards: svg('<rect x="3" y="5" width="12" height="16" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>'),
    check: svg('<path d="m5 12 4.5 4.5L19 7"/>'),
    x: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    flip: svg('<path d="M20 11a8 8 0 0 0-14.7-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4M20 20v-5h-5"/>'),
    alert: svg('<path d="M12 9v4"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/><path d="M10.3 3.9 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.6" r=".8" fill="currentColor" stroke="none"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>'),
    book: svg('<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5V4.5Z"/><path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H20"/>'),
    chart: svg('<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12.5 16V7M17 16v-3"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 4v7h-7"/>'),
    trophy: svg('<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>'),
  };

  const icon = (name) => ICONS[name] || '';

  /* ------------------------------ Utilities ------------------------------ */

  const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);

  const formatNumber = (value) => new Intl.NumberFormat('zh-TW').format(Number(value) || 0);

  const dateShort = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' });
  const dateFull = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const timeShort = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

  function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, withYear = false) {
    const date = parseDate(value);
    if (!date) return '';
    return (withYear ? dateFull : dateShort).format(date);
  }

  function formatTime(value) {
    const date = parseDate(value);
    return date ? timeShort.format(date) : '';
  }

  function timeAgo(value) {
    const date = parseDate(value);
    if (!date) return '';
    const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return '剛剛';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`;
    if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} 天前`;
    return formatDate(date, true);
  }

  function truncate(value, length) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > length ? `${text.slice(0, length)}…` : text;
  }

  function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  const TONES = ['tone-0', 'tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5', 'tone-6', 'tone-7'];

  function subjectTone(subject) {
    const text = String(subject || '一般');
    let hash = 0;
    for (const char of text) hash = ((hash * 31) + char.codePointAt(0)) >>> 0;
    return TONES[hash % TONES.length];
  }

  function subjectPill(subject) {
    return `<span class="subject-pill ${subjectTone(subject)}">${esc(subject || '一般')}</span>`;
  }

  function letter(index) {
    return ['A', 'B', 'C', 'D'][index] || '';
  }

  function shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [output[index], output[random]] = [output[random], output[index]];
    }
    return output;
  }

  function setText(selector, text) {
    const element = $(selector);
    if (element) element.textContent = text;
  }

  function setHidden(selector, hidden) {
    const element = $(selector);
    if (element) element.hidden = hidden;
  }

  /* ------------------------------ API ------------------------------ */

  async function api(path, { method = 'GET', body, signal } = {}) {
    const init = {
      method,
      headers: { accept: 'application/json' },
      signal,
    };

    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(path, init);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      const networkError = new Error('無法連線到伺服器,請確認網路或本機 Worker 是否已啟動');
      networkError.code = 'NETWORK_ERROR';
      throw networkError;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // 非 JSON 回應會落到下方統一錯誤。
    }

    if (!response.ok || !payload || payload.ok !== true) {
      const requestError = new Error(
        payload?.message || `請求失敗(${response.status})`
      );
      requestError.code = payload?.error || 'HTTP_ERROR';
      requestError.status = response.status;
      throw requestError;
    }

    return payload.data;
  }

  /* ------------------------------ Toasts / dialogs ------------------------------ */

  function toast(message, type = 'info', title = '') {
    const root = $('#toastRoot');
    if (!root) return;

    while (root.children.length >= 4) root.firstElementChild.remove();

    const icons = { success: icon('check'), error: icon('alert'), info: icon('info') };
    const defaultTitle = { success: '完成', error: '發生問題', info: '提示' }[type] || '提示';
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-copy">
        <strong>${esc(title || defaultTitle)}</strong>
        <p>${esc(message)}</p>
      </div>
      <button class="toast-close" type="button" aria-label="關閉通知">${icon('x')}</button>
    `;
    root.append(item);

    const remove = () => {
      item.classList.remove('show');
      setTimeout(() => item.remove(), 240);
    };

    item.querySelector('.toast-close').addEventListener('click', remove);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(remove, type === 'error' ? 6500 : 4200);
  }

  const loadingStates = new WeakMap();

  function setLoading(button, loading, label = '處理中…') {
    if (!button) return;

    if (loading) {
      if (loadingStates.has(button)) return;
      loadingStates.set(button, { html: button.innerHTML, disabled: button.disabled });
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`;
      return;
    }

    const previous = loadingStates.get(button);
    if (!previous) return;
    const stillShowingSpinner = Boolean(button.querySelector('.spinner'));
    button.classList.remove('is-loading');
    if (stillShowingSpinner) {
      button.disabled = previous.disabled;
      button.innerHTML = previous.html;
    } else {
      // 按鈕內容若已被重新渲染覆蓋,保留新的標籤,不要還原成舊字。
      button.disabled = false;
    }
    loadingStates.delete(button);
  }

  function syncDialogLock() {
    const hasOpenDialog = Boolean(document.querySelector('dialog[open]'));
    document.documentElement.classList.toggle('dialog-open', hasOpenDialog);
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    syncDialogLock();
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
    syncDialogLock();
  }

  function bindDialogBehavior() {
    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('close', syncDialogLock);
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function askConfirm({
    title = '請確認',
    message = '',
    confirmText = '確認',
    cancelText = '取消',
    danger = true,
  } = {}) {
    const dialog = $('#confirmDialog');
    if (!dialog) return Promise.resolve(window.confirm(message));

    setText('#confirmTitle', title);
    setText('#confirmMessage', message);
    const okButton = $('#confirmOk');
    const cancelButton = $('[data-confirm-cancel]', dialog);
    okButton.textContent = confirmText;
    okButton.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    if (cancelButton) cancelButton.textContent = cancelText;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onOk = () => finish(true);
      const onClose = () => finish(false);

      okButton.addEventListener('click', onOk, { once: true });
      dialog.addEventListener('close', onClose, { once: true });
      openDialog(dialog);
      requestAnimationFrame(() => cancelButton?.focus());
    });
  }

  /* ------------------------------ Common init ------------------------------ */

  function setupCommon() {
    $$('[data-nav]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === page);
    });

    bindDialogBehavior();

    document.addEventListener('click', (event) => {
      const closer = event.target.closest('[data-close]');
      if (closer) {
        const dialog = closer.closest('dialog');
        if (dialog) {
          event.preventDefault();
          dialog.close();
        }
        return;
      }

      const opener = event.target.closest('[data-open-note]');
      if (!opener) return;
      const editor = $('#noteDialog');
      if (!editor) return;
      event.preventDefault();
      openNoteEditor();
    });
  }

  /* =========================================================
     筆記庫
     ========================================================= */

  function initNotesPage() {
    const params = new URLSearchParams(location.search);
    state.activeSubject = params.get('subject') || '';
    state.query = params.get('q') || '';

    const searchInput = $('#notesSearch');
    if (searchInput) searchInput.value = state.query;
    setHidden('#searchClear', !state.query);

    bindNotesEvents();
    renderSkeletons();

    Promise.allSettled([loadNotes({ initial: true }), loadOverview()]).then(() => {
      if (params.get('new') === '1') {
        const url = new URL(location.href);
        url.searchParams.delete('new');
        history.replaceState(null, '', url);
        openNoteEditor();
      } else if (params.get('note')) {
        const id = Number(params.get('note'));
        if (Number.isSafeInteger(id) && id > 0) openNoteDetail(id);
      }
    });
  }

  function bindNotesEvents() {
    const searchInput = $('#notesSearch');
    const searchClear = $('#searchClear');

    const runSearch = debounce(() => loadNotes(), 260);

    searchInput?.addEventListener('input', () => {
      state.query = searchInput.value.trim();
      if (searchClear) searchClear.hidden = !searchInput.value;
      runSearch();
    });

    searchClear?.addEventListener('click', () => {
      if (!searchInput) return;
      searchInput.value = '';
      state.query = '';
      searchClear.hidden = true;
      searchInput.focus();
      loadNotes();
    });

    $('#subjectChips')?.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-subject]');
      if (!chip) return;
      state.activeSubject = chip.dataset.subject || '';
      renderSubjectChips();
      loadNotes();
    });

    const grid = $('#notesGrid');
    grid?.addEventListener('click', (event) => {
      const card = event.target.closest('.note-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const action = event.target.closest('[data-action]')?.dataset.action;

      if (!action) {
        openNoteDetail(id);
        return;
      }

      event.stopPropagation();
      if (action === 'open') openNoteDetail(id);
      else if (action === 'edit') {
        const note = state.notes.find((item) => item.id === id);
        if (note) openNoteEditor(note);
      } else if (action === 'delete') {
        const note = state.notes.find((item) => item.id === id);
        if (note) deleteNote(note);
      } else if (action === 'pin') {
        const note = state.notes.find((item) => item.id === id);
        if (note) togglePin(note);
      }
    });

    grid?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button')) return;
      const card = event.target.closest('.note-card');
      if (!card) return;
      event.preventDefault();
      openNoteDetail(Number(card.dataset.id));
    });

    $('#notesEmpty')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-clear-filters]')) {
        state.activeSubject = '';
        state.query = '';
        if (searchInput) searchInput.value = '';
        if (searchClear) searchClear.hidden = true;
        renderSubjectChips();
        loadNotes();
      }
      if (event.target.closest('[data-retry-notes]')) {
        loadNotes({ initial: true });
        loadOverview();
      }
    });

    const form = $('#noteForm');
    form?.addEventListener('submit', saveNoteFromForm);

    $('#noteContent')?.addEventListener('input', updateContentCounter);

    $('#detailPin')?.addEventListener('click', toggleDetailPin);
    $('#detailDialog')?.addEventListener('click', handleDetailAction);
  }

  async function loadNotes({ initial = false } = {}) {
    const requestId = ++state.notesRequestId;
    const grid = $('#notesGrid');
    const empty = $('#notesEmpty');

    if (initial && grid) {
      renderSkeletons();
      if (empty) empty.innerHTML = '';
    }

    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.activeSubject) params.set('subject', state.activeSubject);

    if (grid) grid.setAttribute('aria-busy', 'true');

    try {
      const data = await api(`/api/notes${params.toString() ? `?${params}` : ''}`);
      if (requestId !== state.notesRequestId) return;

      state.notes = Array.isArray(data.notes) ? data.notes : [];
      state.subjects = Array.isArray(data.subjects) ? data.subjects : [];

      renderSubjectChips();
      renderNotes();
      updateSubjectOptions();
      updateNotesCount();

      const url = new URLSearchParams();
      if (state.activeSubject) url.set('subject', state.activeSubject);
      if (state.query) url.set('q', state.query);
      history.replaceState(null, '', url.toString() ? `${location.pathname}?${url}` : location.pathname);
    } catch (error) {
      if (requestId !== state.notesRequestId) return;
      if (grid) grid.innerHTML = '';
      if (empty) {
        empty.innerHTML = `
          <div class="empty-state">
            <div class="empty-illustration" aria-hidden="true">${icon('alert')}</div>
            <h3>筆記載入失敗</h3>
            <p>${esc(error.message)}</p>
            <button class="btn btn-ghost" type="button" data-retry-notes>${icon('refresh')}再試一次</button>
          </div>
        `;
      }
      setText('#notesCount', '載入失敗');
      toast(error.message, 'error', '無法載入筆記');
    } finally {
      if (grid) grid.setAttribute('aria-busy', 'false');
    }
  }

  function renderSkeletons() {
    const grid = $('#notesGrid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }, () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton" style="width:54px;height:20px;border-radius:99px"></div>
        <div class="skeleton" style="width:78%;height:20px;margin-top:18px"></div>
        <div class="skeleton" style="width:100%;height:11px;margin-top:14px"></div>
        <div class="skeleton" style="width:92%;height:11px;margin-top:8px"></div>
        <div class="skeleton" style="width:64%;height:11px;margin-top:8px"></div>
        <div class="skeleton" style="width:100%;height:32px;margin-top:32px"></div>
      </div>
    `).join('');
  }

  function renderSubjectChips() {
    const container = $('#subjectChips');
    if (!container) return;

    const total = state.subjects.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const chips = [
      `<button class="subject-chip ${!state.activeSubject ? 'is-active' : ''}" type="button" data-subject="">全部 <span class="chip-count">${formatNumber(total)}</span></button>`,
      ...state.subjects.map((item) => `
        <button class="subject-chip ${state.activeSubject === item.subject ? 'is-active' : ''}" type="button" data-subject="${esc(item.subject)}">
          ${esc(item.subject)} <span class="chip-count">${formatNumber(item.count)}</span>
        </button>
      `),
    ];

    container.innerHTML = chips.join('');
  }

  function updateNotesCount() {
    const count = state.notes.length;
    if (state.query || state.activeSubject) {
      const filters = [
        state.activeSubject ? `科目「${state.activeSubject}」` : '',
        state.query ? `關鍵字「${state.query}」` : '',
      ].filter(Boolean).join('、');
      setText('#notesCount', `找到 ${count} 篇符合 ${filters} 的筆記`);
    } else {
      setText('#notesCount', `共 ${count} 篇筆記 · 釘選的會排在最前面`);
    }
  }

  function renderNotes() {
    const grid = $('#notesGrid');
    const empty = $('#notesEmpty');
    if (!grid || !empty) return;

    if (!state.notes.length) {
      grid.innerHTML = '';
      if (state.query || state.activeSubject) {
        empty.innerHTML = `
          <div class="empty-state">
            <div class="empty-illustration" aria-hidden="true">${icon('search')}</div>
            <h3>找不到符合條件的筆記</h3>
            <p>試試其他關鍵字,或清除科目篩選後再看一次。</p>
            <button class="btn btn-ghost" type="button" data-clear-filters>${icon('x')}清除篩選</button>
          </div>
        `;
      } else {
        empty.innerHTML = `
          <div class="empty-state">
            <div class="empty-illustration" aria-hidden="true">${icon('book')}</div>
            <h3>筆記庫還是空的</h3>
            <p>新增第一篇筆記,StudyBox 就能幫你摘要、出題、製作閃卡,並追蹤每一次學習成果。</p>
            <button class="btn btn-primary" type="button" data-open-note>${icon('plus')}新增第一篇筆記</button>
          </div>
        `;
      }
      return;
    }

    empty.innerHTML = '';
    grid.innerHTML = state.notes.map((note, index) => {
      const keywords = Array.isArray(note.keywords) ? note.keywords.filter(Boolean) : [];
      const visibleKeywords = keywords.slice(0, 3);
      const extraKeywords = keywords.length - visibleKeywords.length;
      const tone = subjectTone(note.subject);
      const pinned = Boolean(note.pinned);

      return `
        <article class="note-card ${pinned ? 'is-pinned' : ''}" data-id="${note.id}" tabindex="0" role="button" aria-label="開啟筆記:${esc(note.title)}" style="--i:${Math.min(index, 8)}">
          <div class="note-card-head">
            <span class="subject-pill ${tone}">${esc(note.subject)}</span>
            <button class="icon-btn pin-btn ${pinned ? 'is-active' : ''}" type="button" data-action="pin" aria-label="${pinned ? '取消釘選' : '釘選筆記'}" title="${pinned ? '取消釘選' : '釘選筆記'}">
              ${icon('pin')}
            </button>
          </div>
          <h3 class="note-card-title">${esc(note.title)}</h3>
          <p class="note-card-excerpt">${esc(truncate(note.content, 150))}</p>
          ${note.summary ? `<span class="ai-line">${icon('sparkles')}已有 AI 摘要</span>` : ''}
          ${visibleKeywords.length ? `
            <div class="tag-row">
              ${visibleKeywords.map((keyword) => `<span class="tag">${esc(keyword)}</span>`).join('')}
              ${extraKeywords > 0 ? `<span class="tag">+${extraKeywords}</span>` : ''}
            </div>
          ` : ''}
          <div class="note-card-meta">
            <span>${icon('help')}${note.question_count} 題</span>
            <span>${icon('cards')}${note.card_count} 張</span>
            <span>${icon('clock')}${formatDate(note.created_at)}</span>
          </div>
          <div class="note-card-actions">
            <button class="text-btn" type="button" data-action="open">查看摘要 ${icon('arrow')}</button>
            <span class="spacer"></span>
            <button class="icon-btn" type="button" data-action="edit" aria-label="編輯筆記" title="編輯">${icon('edit')}</button>
            <button class="icon-btn danger" type="button" data-action="delete" aria-label="刪除筆記" title="刪除">${icon('trash')}</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function updateSubjectOptions() {
    const datalist = $('#subjectOptions');
    if (!datalist) return;
    const values = [...new Set([
      ...DEFAULT_SUBJECTS,
      ...state.subjects.map((item) => item.subject),
    ])].filter(Boolean);
    datalist.innerHTML = values.map((subject) => `<option value="${esc(subject)}"></option>`).join('');
  }

  function updateContentCounter() {
    const content = $('#noteContent');
    const counter = $('#contentCount');
    if (!content || !counter) return;
    const length = content.value.length;
    counter.textContent = `${formatNumber(length)} / 20000`;
    counter.classList.toggle('is-near', length > 18000);
  }

  function openNoteEditor(note = null) {
    const dialog = $('#noteDialog');
    if (!dialog) return;

    state.editingId = note?.id || null;
    setText('#noteDialogTitle', note ? '編輯筆記' : '新增筆記');
    const submit = $('#noteSubmit');
    if (submit) {
      submit.disabled = false;
      submit.classList.remove('is-loading');
      submit.innerHTML = `${icon('check')}${note ? '儲存變更' : '儲存筆記'}`;
    }

    const idInput = $('#noteId');
    const subjectInput = $('#noteSubject');
    const titleInput = $('#noteTitle');
    const contentInput = $('#noteContent');

    if (idInput) idInput.value = note?.id || '';
    if (subjectInput) subjectInput.value = note?.subject || '';
    if (titleInput) titleInput.value = note?.title || '';
    if (contentInput) contentInput.value = note?.content || '';

    updateSubjectOptions();
    updateContentCounter();
    openDialog(dialog);
    requestAnimationFrame(() => (note ? titleInput : subjectInput)?.focus());
  }

  async function saveNoteFromForm(event) {
    event.preventDefault();
    const submit = $('#noteSubmit');
    const subject = $('#noteSubject')?.value.trim() || '';
    const title = $('#noteTitle')?.value.trim() || '';
    const content = $('#noteContent')?.value.trim() || '';

    if (!title) {
      toast('請填寫筆記標題', 'error', '缺少標題');
      $('#noteTitle')?.focus();
      return;
    }
    if (!content) {
      toast('請貼上或輸入筆記內容', 'error', '缺少內容');
      $('#noteContent')?.focus();
      return;
    }

    setLoading(submit, true, '儲存中…');
    try {
      const payload = { subject, title, content };
      const note = state.editingId
        ? await api(`/api/notes/${state.editingId}`, { method: 'PUT', body: payload })
        : await api('/api/notes', { method: 'POST', body: payload });

      closeDialog($('#noteDialog'));
      toast(
        state.editingId ? '筆記內容已更新' : '筆記已建立,可以開始產生 AI 摘要了',
        'success',
        state.editingId ? '已儲存' : '新增成功'
      );
      state.editingId = null;
      state.detailNote = null;
      await Promise.allSettled([loadNotes(), loadOverview()]);
      if (note?.id && !state.editingId) {
        // 新增後停留在筆記庫,讓使用者自己決定下一步。
      }
    } catch (error) {
      toast(error.message, 'error', '儲存失敗');
    } finally {
      setLoading(submit, false);
    }
  }

  async function togglePin(note) {
    if (note._pinning) return;
    note._pinning = true;
    const button = document.querySelector(`.note-card[data-id="${note.id}"] [data-action="pin"]`);
    setLoading(button, true, '');

    try {
      const updated = await api(`/api/notes/${note.id}`, {
        method: 'PUT',
        body: { pinned: !note.pinned },
      });
      toast(updated.pinned ? '已釘選,會排在筆記庫最前面' : '已取消釘選', 'success');
      await Promise.allSettled([loadNotes(), loadOverview()]);
    } catch (error) {
      toast(error.message, 'error', '更新釘選失敗');
    } finally {
      note._pinning = false;
      setLoading(button, false);
    }
  }

  async function deleteNote(note) {
    const confirmed = await askConfirm({
      title: '刪除這篇筆記?',
      message: `「${note.title}」的摘要、題目、閃卡與作答紀錄都會一起刪除,而且無法復原。`,
      confirmText: '刪除筆記',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await api(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (state.detailNote?.id === note.id) {
        closeDialog($('#detailDialog'));
        state.detailNote = null;
      }
      toast('筆記與相關學習紀錄已刪除', 'success', '已刪除');
      await Promise.allSettled([loadNotes(), loadOverview()]);
    } catch (error) {
      toast(error.message, 'error', '刪除失敗');
    }
  }

  async function openNoteDetail(id) {
    const dialog = $('#detailDialog');
    const body = $('#detailBody');
    const actions = $('#detailActions');
    if (!dialog || !body) return;

    state.detailNote = null;
    body.innerHTML = `
      <div class="detail-loading" aria-hidden="true">
        <span class="skeleton"></span>
        <span class="skeleton"></span>
        <span class="skeleton"></span>
      </div>
    `;
    if (actions) actions.innerHTML = '';
    setText('#detailTitle', '載入筆記中…');
    setText('#detailMeta', '');
    openDialog(dialog);

    try {
      const note = await api(`/api/notes/${id}`);
      if (!dialog.open) return;
      state.detailNote = note;
      renderDetail(note);
    } catch (error) {
      closeDialog(dialog);
      toast(error.message, 'error', '無法開啟筆記');
    }
  }

  function renderDetail(note) {
    if (!note) return;
    const tone = subjectTone(note.subject);
    const keywords = Array.isArray(note.keywords) ? note.keywords.filter(Boolean) : [];
    const questions = Array.isArray(note.questions) ? note.questions : [];
    const cards = Array.isArray(note.cards) ? note.cards : [];

    const subject = $('#detailSubject');
    if (subject) {
      subject.className = `subject-pill ${tone}`;
      subject.textContent = note.subject || '一般';
    }
    setHidden('#detailPinFlag', !note.pinned);
    setText('#detailTitle', note.title);
    setText(
      '#detailMeta',
      `建立於 ${formatDate(note.created_at, true)} · ${questions.length} 道題目 · ${cards.length} 張閃卡`
    );

    const pinButton = $('#detailPin');
    if (pinButton) {
      pinButton.className = `icon-btn ${note.pinned ? 'is-active' : ''}`;
      pinButton.innerHTML = icon('pin');
      pinButton.setAttribute('aria-label', note.pinned ? '取消釘選' : '釘選筆記');
      pinButton.title = note.pinned ? '取消釘選' : '釘選筆記';
    }

    const body = $('#detailBody');
    if (body) {
      body.innerHTML = `
        <div class="detail-grid">
          <section class="detail-section">
            <h3>筆記內容</h3>
            <div class="prose">${esc(note.content)}</div>
          </section>
          <aside class="detail-aside">
            <section class="summary-box ${note.summary ? '' : 'is-empty'}">
              <div class="summary-head">
                <span class="ai-badge">${icon('sparkles')}AI 摘要</span>
                ${note.summary ? `
                  <div class="summary-head-actions">
                    <button class="text-btn muted" type="button" data-detail-action="summarize">${icon('refresh')}重新產生</button>
                    <button class="text-btn muted" type="button" data-detail-action="copy-summary">${icon('copy')}複製</button>
                  </div>
                ` : ''}
              </div>
              ${note.summary
                ? `<div class="summary-text">${esc(note.summary)}</div>`
                : `<p>還沒有摘要。讓 AI 快速抓出這篇筆記的考試重點。</p>
                   <button class="btn btn-soft btn-sm" type="button" data-detail-action="summarize">${icon('sparkles')}產生摘要</button>`}
            </section>
            <section>
              <h3>關鍵字</h3>
              ${keywords.length
                ? `<div class="tag-row">${keywords.map((keyword) => `<span class="tag">${esc(keyword)}</span>`).join('')}</div>`
                : `<p class="meta" style="font-size:12px">尚未擷取關鍵字,產生摘要後會自動出現。</p>`}
            </section>
            <section>
              <h3>學習內容</h3>
              <div class="detail-counts">
                <div class="count-chip"><strong>${questions.length}</strong><span>道選擇題</span></div>
                <div class="count-chip"><strong>${cards.length}</strong><span>張閃卡</span></div>
                <div class="count-chip"><strong>${note.attempt_count || 0}</strong><span>次作答</span></div>
                <div class="count-chip"><strong>${note.attempt_count ? Math.round((note.correct_count / note.attempt_count) * 100) : 0}%</strong><span>本篇答對率</span></div>
              </div>
            </section>
          </aside>
        </div>
      `;
    }

    const footer = $('#detailActions');
    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-ghost btn-sm" type="button" data-detail-nav="edit">${icon('edit')}編輯</button>
        <button class="btn btn-soft btn-sm" type="button" data-detail-action="questions">${icon('help')}AI 出題</button>
        <button class="btn btn-soft btn-sm" type="button" data-detail-action="cards">${icon('cards')}生成閃卡</button>
        <span class="spacer"></span>
        <a class="btn btn-primary btn-sm" href="/study.html?note=${note.id}">開始測驗${icon('arrow')}</a>
        <button class="icon-btn danger" type="button" data-detail-action="delete" aria-label="刪除筆記" title="刪除筆記">${icon('trash')}</button>
      `;
    }

    const detailBody = $('#detailBody');
    if (detailBody) detailBody.scrollTop = 0;
  }

  async function handleDetailAction(event) {
    const nav = event.target.closest('[data-detail-nav]');
    if (nav) {
      const note = state.detailNote;
      if (nav.dataset.detailNav === 'edit' && note) {
        closeDialog($('#detailDialog'));
        openNoteEditor(note);
      }
      return;
    }

    const target = event.target.closest('[data-detail-action]');
    if (!target) return;
    const note = state.detailNote;
    if (!note) return;

    const action = target.dataset.detailAction;

    if (action === 'copy-summary') {
      if (note.summary) {
        const copied = await copyText(note.summary);
        toast(copied ? '摘要已複製到剪貼簿' : '複製失敗,請手動選取文字', copied ? 'success' : 'error');
      }
      return;
    }

    if (action === 'delete') {
      await deleteNote(note);
      return;
    }

    if (action === 'summarize' || action === 'questions' || action === 'cards') {
      await generateFromDetail(note, action, target);
    }
  }

  async function generateFromDetail(note, action, button) {
    const labels = {
      summarize: { loading: 'AI 摘要中…', success: '摘要已產生', endpoint: 'summarize' },
      questions: { loading: 'AI 出題中…', success: '題目已產生', endpoint: 'questions' },
      cards: { loading: 'AI 製作閃卡中…', success: '閃卡已產生', endpoint: 'cards' },
    };
    const config = labels[action];
    if (!config) return;

    setLoading(button, true, config.loading);
    try {
      const data = await api(`/api/notes/${note.id}/${config.endpoint}`, { method: 'POST' });

      if (action === 'summarize') {
        state.detailNote = {
          ...note,
          ...data,
          questions: note.questions || [],
          cards: note.cards || [],
        };
        toast('重點與關鍵字已更新', 'success', config.success);
      } else if (action === 'questions') {
        state.detailNote = {
          ...note,
          ...data.note,
          questions: data.questions || [],
          cards: note.cards || [],
        };
        toast(`已新增 ${data.count} 道題目,共 ${state.detailNote.questions.length} 題`, 'success', config.success);
      } else {
        state.detailNote = {
          ...note,
          ...data.note,
          questions: note.questions || [],
          cards: data.cards || [],
        };
        toast(`已新增 ${data.count} 張閃卡,共 ${state.detailNote.cards.length} 張`, 'success', config.success);
      }

      renderDetail(state.detailNote);
      loadNotes();
      loadOverview();
    } catch (error) {
      toast(error.message, 'error', `AI 產生${action === 'summarize' ? '摘要' : action === 'questions' ? '題目' : '閃卡'}失敗`);
    } finally {
      setLoading(button, false);
    }
  }

  async function toggleDetailPin() {
    const note = state.detailNote;
    if (!note || note._pinning) return;
    note._pinning = true;
    const button = $('#detailPin');
    setLoading(button, true, '');

    try {
      const updated = await api(`/api/notes/${note.id}`, {
        method: 'PUT',
        body: { pinned: !note.pinned },
      });
      state.detailNote = { ...note, ...updated };
      renderDetail(state.detailNote);
      toast(updated.pinned ? '已釘選筆記' : '已取消釘選', 'success');
      loadNotes();
      loadOverview();
    } catch (error) {
      toast(error.message, 'error', '更新釘選失敗');
    } finally {
      note._pinning = false;
      setLoading(button, false);
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // 使用下方 fallback。
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  async function loadOverview() {
    try {
      const data = await api('/api/stats');
      state.overview = data;
      renderOverview(data);
    } catch (error) {
      // 首頁的總覽失敗不阻擋筆記列表,僅在 console 留下原因。
      console.warn('Overview failed:', error);
    }
  }

  function renderOverview(data) {
    const totals = data.totals || {};
    animateNumber($('#kpiNotes'), totals.notes || 0);
    animateNumber($('#kpiQuestions'), totals.questions || 0);
    animateNumber($('#kpiCards'), totals.cards || 0);
    animateNumber($('#kpiAccuracy'), totals.accuracy || 0, {
      suffix: '%',
      dash: !totals.attempts,
    });

    setText('#kpiNotesHint', totals.notes ? '持續累積你的學習資料' : '建立你的第一個學習空間');
    setText('#kpiQuestionsHint', totals.attempts ? `共作答 ${formatNumber(totals.attempts)} 次` : '用題目測試理解程度');
    setText('#kpiCardsHint', totals.reviews ? `已複習 ${formatNumber(totals.reviews)} 次` : '翻面複習,加深記憶');
    setText(
      '#kpiAccuracyHint',
      totals.attempts
        ? `答對 ${formatNumber(totals.correct)} / ${formatNumber(totals.attempts)} 題`
        : '作答後自動計算'
    );
  }

  function animateNumber(element, target, { suffix = '', dash = false } = {}) {
    if (!element) return;
    if (dash) {
      element.textContent = '—';
      element.dataset.value = '0';
      return;
    }

    const to = Number(target) || 0;
    const from = Number(element.dataset.value) || 0;
    element.dataset.value = String(to);

    if (reduceMotion) {
      element.textContent = `${formatNumber(to)}${suffix}`;
      return;
    }

    if (element._numberFrame) cancelAnimationFrame(element._numberFrame);
    const started = performance.now();
    const duration = 620;

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (to - from) * eased);
      element.textContent = `${formatNumber(value)}${suffix}`;
      if (progress < 1) element._numberFrame = requestAnimationFrame(tick);
    };

    element._numberFrame = requestAnimationFrame(tick);
  }

  /* =========================================================
     測驗與閃卡
     ========================================================= */

  function initStudyPage() {
    const params = new URLSearchParams(location.search);
    const wantedTab = params.get('tab');
    if (wantedTab === 'quiz' || wantedTab === 'cards') state.study.tab = wantedTab;

    bindStudyEvents();
    loadStudyIndex(params.get('note'));
  }

  function bindStudyEvents() {
    $('#studyNoteList')?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-note-id]');
      if (!item) return;
      const id = Number(item.dataset.noteId);
      if (id && id !== state.study.current?.id) loadStudyNote(id).catch(showStudyLoadError);
    });

    $('#studyNoteSelect')?.addEventListener('change', (event) => {
      const id = Number(event.target.value);
      if (id) loadStudyNote(id).catch(showStudyLoadError);
    });

    $$('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', () => switchStudyTab(tab.dataset.tab));
    });

    $('#btnSummary')?.addEventListener('click', (event) => {
      generateStudyContent('summarize', event.currentTarget);
    });
    $('#btnQuestions')?.addEventListener('click', (event) => {
      generateStudyContent('questions', event.currentTarget);
    });
    $('#btnCards')?.addEventListener('click', (event) => {
      generateStudyContent('cards', event.currentTarget);
    });

    $('#quizStage')?.addEventListener('click', handleQuizClick);
    $('#cardsStage')?.addEventListener('click', handleCardsClick);
    $('#cardsStage')?.addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      if (!event.target.closest('[data-card-flip]')) return;
      event.preventDefault();
      flipCard();
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-study-retry]')) {
        loadStudyIndex(state.study.current?.id);
      }
    });

    document.addEventListener('keydown', handleStudyShortcuts);
  }

  async function loadStudyIndex(wantedId = null) {
    const loading = $('#studyLoading');
    if (loading) {
      loading.hidden = false;
      loading.innerHTML = '<div class="mini-empty"><span class="spinner"></span>&nbsp;正在整理你的筆記…</div>';
    }
    setHidden('#studyEmpty', true);
    setHidden('#studyWorkspace', true);

    try {
      const data = await api('/api/notes');
      state.study.notes = Array.isArray(data.notes) ? data.notes : [];
      state.study.indexLoaded = true;
      renderStudyNoteList();

      const loadingPanel = $('#studyLoading');
      if (loadingPanel) loadingPanel.hidden = true;

      if (!state.study.notes.length) {
        showStudyEmpty();
        return;
      }

      const targetId = Number(wantedId);
      const target = state.study.notes.find((note) => note.id === targetId) || state.study.notes[0];
      await loadStudyNote(target.id);
    } catch (error) {
      showStudyLoadError(error);
    }
  }

  function showStudyEmpty() {
    setHidden('#studyLoading', true);
    setHidden('#studyWorkspace', true);
    setHidden('#studyEmpty', false);
  }

  function showStudyLoadError(error) {
    setHidden('#studyEmpty', true);
    setHidden('#studyWorkspace', true);
    const loading = $('#studyLoading');
    if (loading) {
      loading.hidden = false;
      loading.innerHTML = `
        <div class="mini-empty" style="flex-direction:column;gap:12px">
          <span>${esc(error?.message || '載入失敗,請稍後再試')}</span>
          <button class="btn btn-ghost btn-sm" type="button" data-study-retry>${icon('refresh')}重新載入</button>
        </div>
      `;
    }
  }

  function renderStudyNoteList() {
    const list = $('#studyNoteList');
    const select = $('#studyNoteSelect');
    const currentId = state.study.current?.id;
    const notes = state.study.notes;

    setText('#studyNoteCount', `${notes.length} 篇`);
    setHidden('#studyNotePickerEmpty', notes.length > 0);

    if (list) {
      list.innerHTML = notes.map((note) => `
        <button class="note-list-item ${note.id === currentId ? 'is-active' : ''}" type="button" data-note-id="${note.id}" ${note.id === currentId ? 'aria-current="true"' : ''}>
          <span class="note-list-top">
            ${subjectPill(note.subject)}
            ${note.pinned ? icon('pin') : ''}
          </span>
          <strong>${esc(note.title)}</strong>
          <small>${note.question_count} 題 · ${note.card_count} 張閃卡</small>
        </button>
      `).join('');
    }

    if (select) {
      select.innerHTML = notes.map((note) => `
        <option value="${note.id}" ${note.id === currentId ? 'selected' : ''}>${esc(note.subject || '一般')} · ${esc(note.title)}</option>
      `).join('');
    }
  }

  async function loadStudyNote(id, { resetQuiz: shouldResetQuiz = true, resetCards: shouldResetCards = true } = {}) {
    const requestId = (state.study.loadRequestId || 0) + 1;
    state.study.loadRequestId = requestId;

    const note = await api(`/api/notes/${id}`);
    if (requestId !== state.study.loadRequestId) return;

    state.study.current = note;
    const summaryNote = state.study.notes.find((item) => item.id === note.id);
    if (summaryNote) {
      Object.assign(summaryNote, {
        subject: note.subject,
        title: note.title,
        pinned: note.pinned,
        question_count: note.questions.length,
        card_count: note.cards.length,
        attempt_count: note.attempt_count,
        correct_count: note.correct_count,
      });
    }

    setHidden('#studyLoading', true);
    setHidden('#studyEmpty', true);
    setHidden('#studyWorkspace', false);

    renderStudyHeader();
    renderStudyNoteList();

    if (shouldResetQuiz) resetQuiz();
    if (shouldResetCards) resetCardSession(false);

    renderTabs();
    renderActiveTab();
    updateStudyUrl();
  }

  function renderStudyHeader() {
    const note = state.study.current;
    if (!note) return;

    const subject = $('#studySubject');
    if (subject) {
      subject.className = `subject-pill ${subjectTone(note.subject)}`;
      subject.textContent = note.subject || '一般';
    }

    setText('#studyTitle', note.title);
    setText(
      '#studyMeta',
      `建立於 ${formatDate(note.created_at, true)} · ${note.questions.length} 道題目 · ${note.cards.length} 張閃卡`
    );

    const summaryButton = $('#btnSummary');
    if (summaryButton) {
      summaryButton.innerHTML = `${icon('sparkles')}${note.summary ? '重新摘要' : 'AI 摘要'}`;
    }

    const summaryBox = $('#studySummaryBox');
    if (summaryBox) {
      summaryBox.hidden = !note.summary;
      setText('#studySummaryText', note.summary || '');
      const tags = $('#studySummaryTags');
      if (tags) {
        const keywords = Array.isArray(note.keywords) ? note.keywords.filter(Boolean) : [];
        tags.innerHTML = keywords.map((keyword) => `<span class="tag">${esc(keyword)}</span>`).join('');
        tags.hidden = !keywords.length;
      }
    }

    setText('#studyContent', note.content || '');
  }

  function renderTabs() {
    const isQuiz = state.study.tab === 'quiz';
    const note = state.study.current;

    $('#tabQuiz')?.classList.toggle('is-active', isQuiz);
    $('#tabQuiz')?.setAttribute('aria-selected', String(isQuiz));
    $('#tabCards')?.classList.toggle('is-active', !isQuiz);
    $('#tabCards')?.setAttribute('aria-selected', String(!isQuiz));

    setText('#quizCount', String(note?.questions.length || 0));
    setText('#cardsCount', String(note?.cards.length || 0));

    setHidden('#quizPane', !isQuiz);
    setHidden('#cardsPane', isQuiz);
  }

  function renderActiveTab() {
    if (state.study.tab === 'quiz') renderQuiz();
    else renderCards();
  }

  function switchStudyTab(tab, { updateUrl = true } = {}) {
    if (tab !== 'quiz' && tab !== 'cards') return;
    state.study.tab = tab;
    renderTabs();
    renderActiveTab();
    if (updateUrl) updateStudyUrl();
  }

  function resetQuiz() {
    const questions = Array.isArray(state.study.current?.questions)
      ? state.study.current.questions
      : [];
    state.study.quiz = {
      questions: [...questions],
      index: 0,
      selected: null,
      submitted: false,
      submitting: false,
      correct: 0,
      answered: 0,
      finished: questions.length === 0,
      feedback: null,
    };
  }

  function resetCardSession(shuffleDeck = false) {
    const cards = Array.isArray(state.study.current?.cards)
      ? state.study.current.cards
      : [];
    const deck = shuffleDeck ? shuffle(cards) : [...cards];
    state.study.cards = {
      deck,
      index: 0,
      flipped: false,
      marking: false,
      remembered: 0,
      forgotten: 0,
      finished: deck.length === 0,
    };
  }

  function updateStudyUrl() {
    const note = state.study.current;
    if (!note) return;
    const params = new URLSearchParams();
    params.set('note', String(note.id));
    params.set('tab', state.study.tab);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }

  async function generateStudyContent(kind, button) {
    const note = state.study.current;
    if (!note || state.study.generating) return;

    const config = {
      summarize: { endpoint: 'summarize', loading: 'AI 摘要中…', label: '摘要' },
      questions: { endpoint: 'questions', loading: 'AI 出題中…', label: '題目' },
      cards: { endpoint: 'cards', loading: 'AI 製作閃卡中…', label: '閃卡' },
    }[kind];
    if (!config) return;

    state.study.generating = true;
    const aiButtons = $$('.study-ai-actions .btn');
    aiButtons.forEach((item) => { item.disabled = true; });
    setLoading(button, true, config.loading);

    try {
      const data = await api(`/api/notes/${note.id}/${config.endpoint}`, { method: 'POST' });
      if (state.study.current?.id !== note.id) return;

      if (kind === 'summarize') {
        toast('重點與關鍵字已更新', 'success', 'AI 摘要完成');
        await loadStudyNote(note.id, { resetQuiz: false, resetCards: false });
      } else if (kind === 'questions') {
        toast(`已新增 ${data.count} 道題目,開始測試自己吧`, 'success', 'AI 出題完成');
        await loadStudyNote(note.id, { resetQuiz: true, resetCards: false });
        switchStudyTab('quiz');
      } else {
        toast(`已新增 ${data.count} 張閃卡`, 'success', '閃卡製作完成');
        await loadStudyNote(note.id, { resetQuiz: false, resetCards: true });
        switchStudyTab('cards');
      }
    } catch (error) {
      toast(error.message, 'error', `AI 產生${config.label}失敗`);
    } finally {
      state.study.generating = false;
      aiButtons.forEach((item) => { item.disabled = false; });
      setLoading(button, false);
    }
  }

  async function handleQuizClick(event) {
    const generateButton = event.target.closest('[data-quiz-generate]');
    if (generateButton) {
      generateStudyContent('questions', generateButton);
      return;
    }

    if (event.target.closest('[data-quiz-restart]')) {
      resetQuiz();
      renderQuiz();
      return;
    }

    if (event.target.closest('[data-go-cards]')) {
      switchStudyTab('cards');
      return;
    }

    const nextButton = event.target.closest('[data-quiz-next]');
    if (nextButton) {
      nextQuizQuestion();
      return;
    }

    const option = event.target.closest('[data-option]');
    if (option) {
      selectQuizOption(Number(option.dataset.option));
      return;
    }

    const submitButton = event.target.closest('[data-quiz-submit]');
    if (submitButton) submitQuizAnswer(submitButton);
  }

  function selectQuizOption(index) {
    const quiz = state.study.quiz;
    if (!quiz || quiz.submitted || quiz.submitting || quiz.finished) return;
    const question = quiz.questions[quiz.index];
    if (!question || index < 0 || index >= question.options.length) return;

    quiz.selected = index;
    $$('.quiz-option', $('#quizStage')).forEach((button) => {
      const selected = Number(button.dataset.option) === index;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const submit = $('[data-quiz-submit]');
    if (submit) submit.disabled = false;
  }

  async function submitQuizAnswer(button) {
    const quiz = state.study.quiz;
    const note = state.study.current;
    if (!quiz || !note || quiz.submitted || quiz.submitting || quiz.finished) return;
    if (quiz.selected === null || quiz.selected === undefined) return;

    const question = quiz.questions[quiz.index];
    if (!question) return;

    quiz.submitting = true;
    $$('.quiz-option', $('#quizStage')).forEach((option) => { option.disabled = true; });
    if (button) {
      button.disabled = true;
      setLoading(button, true, '批改中…');
    }

    try {
      const result = await api(`/api/questions/${question.id}/answer`, {
        method: 'POST',
        body: { answer: quiz.selected },
      });

      if (state.study.current?.id !== note.id || state.study.quiz !== quiz) return;

      quiz.submitted = true;
      quiz.answered += 1;
      if (result.correct) quiz.correct += 1;
      quiz.feedback = result;
      renderQuiz();
    } catch (error) {
      $$('.quiz-option', $('#quizStage')).forEach((option) => { option.disabled = false; });
      if (button) {
        button.disabled = false;
      }
      toast(error.message, 'error', '送出答案失敗');
    } finally {
      quiz.submitting = false;
      setLoading(button, false);
    }
  }

  function nextQuizQuestion() {
    const quiz = state.study.quiz;
    if (!quiz || !quiz.submitted) return;

    if (quiz.index + 1 >= quiz.questions.length) {
      quiz.finished = true;
      renderQuiz();
      return;
    }

    quiz.index += 1;
    quiz.selected = null;
    quiz.submitted = false;
    quiz.feedback = null;
    renderQuiz();
  }

  function renderQuiz() {
    const stage = $('#quizStage');
    if (!stage) return;
    const quiz = state.study.quiz;
    const questions = quiz.questions || [];

    if (!questions.length) {
      stage.innerHTML = `
        <div class="empty-state compact">
          <div class="empty-illustration" aria-hidden="true">${icon('help')}</div>
          <h3>這篇筆記還沒有題目</h3>
          <p>讓 AI 根據筆記產生 3 道選擇題,作答後會立即批改、顯示解析並記錄成績。</p>
          <button class="btn btn-primary" type="button" data-quiz-generate>${icon('sparkles')}AI 產生題目</button>
        </div>
      `;
      return;
    }

    if (quiz.finished) {
      const answered = quiz.answered || questions.length;
      const accuracy = answered ? Math.round((quiz.correct / answered) * 100) : 0;
      const ringColor = accuracy >= 80 ? '#0e9f6e' : accuracy >= 60 ? '#f79009' : '#e5484d';
      const message = accuracy >= 90
        ? '太強了,幾乎全對!'
        : accuracy >= 70
          ? '掌握得不錯,再複習幾題會更穩。'
          : accuracy >= 50
            ? '有抓到方向,把錯題解析再看一次。'
            : '別灰心,先看摘要與閃卡再回來挑戰。';

      stage.innerHTML = `
        <div class="result-card">
          <div class="score-ring" style="--value:${accuracy};--ring-color:${ringColor}">
            <div class="score-ring-inner"><strong>${accuracy}%</strong><span>答對率</span></div>
          </div>
          <h2>${message}</h2>
          <p>本輪完成 ${questions.length} 道題目,每一次作答都已存入學習紀錄。</p>
          <div class="result-stats">
            <div class="result-stat"><strong style="color:var(--success)">${quiz.correct}</strong><span>答對</span></div>
            <div class="result-stat"><strong style="color:var(--danger)">${Math.max(0, answered - quiz.correct)}</strong><span>答錯</span></div>
            <div class="result-stat"><strong>${questions.length}</strong><span>總題數</span></div>
          </div>
          <div class="result-actions">
            <button class="btn btn-primary" type="button" data-quiz-restart>${icon('refresh')}再測一次</button>
            <button class="btn btn-ghost" type="button" data-go-cards>${icon('cards')}複習閃卡</button>
          </div>
        </div>
      `;
      return;
    }

    const question = questions[quiz.index];
    if (!question) {
      quiz.finished = true;
      renderQuiz();
      return;
    }

    const feedback = quiz.feedback;
    const correctAnswer = feedback?.correctAnswer;
    const optionHtml = question.options.map((option, index) => {
      let classes = 'quiz-option';
      let disabled = quiz.submitted ? 'disabled' : '';

      if (!quiz.submitted && quiz.selected === index) classes += ' is-selected';
      if (quiz.submitted) {
        if (index === correctAnswer) classes += ' is-correct';
        else if (index === quiz.selected) classes += ' is-wrong';
        else classes += ' is-dimmed';
      }

      return `
        <button class="${classes}" type="button" data-option="${index}" ${disabled} aria-pressed="${!quiz.submitted && quiz.selected === index}">
          <span class="option-key">${letter(index)}</span>
          <span>${esc(option)}</span>
        </button>
      `;
    }).join('');

    const progress = Math.round(((quiz.index + 1) / questions.length) * 100);
    const isLast = quiz.index + 1 >= questions.length;
    const feedbackHtml = quiz.submitted && feedback ? `
      <div class="feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}">
        <span class="feedback-icon">${feedback.correct ? icon('check') : icon('x')}</span>
        <div>
          <h4>${feedback.correct ? '答對了!' : '再想想,這題答錯了'}</h4>
          ${!feedback.correct && correctAnswer !== undefined
            ? `<div class="answer-line">正確答案:${letter(correctAnswer)}. ${esc(question.options[correctAnswer] || '')}</div>`
            : ''}
          <p>${esc(feedback.explanation || '這題沒有附解析,請回到筆記確認相關概念。')}</p>
        </div>
      </div>
    ` : '';

    stage.innerHTML = `
      <div class="quiz-topline">
        <span>第 <strong>${quiz.index + 1}</strong> / ${questions.length} 題</span>
        <span>已答對 <strong>${quiz.correct}</strong> 題</span>
      </div>
      <div class="progress-track"><span style="width:${progress}%"></span></div>
      <article class="quiz-card">
        <p class="quiz-kicker">Single Choice</p>
        <h2 class="quiz-question">${esc(question.question)}</h2>
        <div class="quiz-options" role="group" aria-label="答案選項">${optionHtml}</div>
        ${feedbackHtml}
        <div class="quiz-actions">
          ${quiz.submitted
            ? `<span class="hint">這次作答已記錄 · 按 Enter 繼續</span>
               <button class="btn btn-primary" type="button" data-quiz-next>${isLast ? '查看結果' : '下一題'}${icon('arrow')}</button>`
            : `<span class="hint">選擇一個答案,送出後會立即批改</span>
               <button class="btn btn-primary" type="button" data-quiz-submit ${quiz.selected === null ? 'disabled' : ''}>送出答案${icon('arrow')}</button>`}
        </div>
      </article>
    `;
  }

  function handleCardsClick(event) {
    const generateButton = event.target.closest('[data-cards-generate]');
    if (generateButton) {
      generateStudyContent('cards', generateButton);
      return;
    }

    if (event.target.closest('[data-cards-restart]')) {
      resetCardSession(true);
      renderCards();
      return;
    }

    if (event.target.closest('[data-go-quiz]')) {
      switchStudyTab('quiz');
      return;
    }

    const markButton = event.target.closest('[data-card-mark]');
    if (markButton) {
      markCard(markButton.dataset.cardMark === 'remembered', markButton);
      return;
    }

    if (event.target.closest('[data-card-flip]')) flipCard();
  }

  function flipCard() {
    if (state.study.tab !== 'cards' || state.study.cards.finished) return;
    state.study.cards.flipped = !state.study.cards.flipped;
    const card = $('.flashcard');
    if (card) {
      card.classList.toggle('is-flipped', state.study.cards.flipped);
      card.setAttribute('aria-label', state.study.cards.flipped ? '翻回正面' : '翻面查看答案');
    }
  }

  async function markCard(remembered, button) {
    const cardsState = state.study.cards;
    const note = state.study.current;
    if (!cardsState || !note || cardsState.marking || cardsState.finished) return;
    const card = cardsState.deck[cardsState.index];
    if (!card) return;

    cardsState.marking = true;
    const markButtons = $$('[data-card-mark]', $('#cardsStage'));
    markButtons.forEach((item) => { item.disabled = true; });
    setLoading(button, true, '記錄中…');

    try {
      const updated = await api(`/api/cards/${card.id}/review`, {
        method: 'POST',
        body: { remembered },
      });

      if (state.study.current?.id !== note.id || state.study.cards !== cardsState) return;

      if (remembered) {
        cardsState.remembered += 1;
        card.remembered = updated.remembered;
      } else {
        cardsState.forgotten += 1;
        card.forgotten = updated.forgotten;
      }

      cardsState.index += 1;
      cardsState.flipped = false;
      if (cardsState.index >= cardsState.deck.length) cardsState.finished = true;
      cardsState.marking = false;
      renderCards();
    } catch (error) {
      markButtons.forEach((item) => { item.disabled = false; });
      toast(error.message, 'error', '記錄複習結果失敗');
    } finally {
      cardsState.marking = false;
      setLoading(button, false);
    }
  }

  function renderCards() {
    const stage = $('#cardsStage');
    if (!stage || !state.study.current) return;

    let cardsState = state.study.cards;
    if (!cardsState.deck.length && state.study.current.cards.length) {
      resetCardSession(false);
      cardsState = state.study.cards;
    }

    if (!cardsState.deck.length) {
      stage.innerHTML = `
        <div class="empty-state compact">
          <div class="empty-illustration" aria-hidden="true">${icon('cards')}</div>
          <h3>這篇筆記還沒有閃卡</h3>
          <p>讓 AI 把重點整理成翻面卡片,先想答案,再翻面確認自己記不記得。</p>
          <button class="btn btn-primary" type="button" data-cards-generate>${icon('sparkles')}AI 製作閃卡</button>
        </div>
      `;
      return;
    }

    if (cardsState.finished) {
      const total = cardsState.deck.length;
      const rate = total ? Math.round((cardsState.remembered / total) * 100) : 0;
      const ringColor = rate >= 70 ? '#0e9f6e' : rate >= 40 ? '#f79009' : '#e5484d';
      const message = rate >= 80
        ? '記憶力滿分,這些重點很穩!'
        : rate >= 50
          ? '大部分都記住了,再複習一次會更牢。'
          : '先把不記得的卡片再看一遍,下一次會更好。';

      stage.innerHTML = `
        <div class="result-card">
          <div class="score-ring" style="--value:${rate};--ring-color:${ringColor}">
            <div class="score-ring-inner"><strong>${rate}%</strong><span>記得比例</span></div>
          </div>
          <h2>${message}</h2>
          <p>本輪複習 ${total} 張閃卡,標記結果已累計到學習統計。</p>
          <div class="result-stats">
            <div class="result-stat"><strong style="color:var(--success)">${cardsState.remembered}</strong><span>記得</span></div>
            <div class="result-stat"><strong style="color:var(--danger)">${cardsState.forgotten}</strong><span>不記得</span></div>
            <div class="result-stat"><strong>${total}</strong><span>本輪卡片</span></div>
          </div>
          <div class="result-actions">
            <button class="btn btn-primary" type="button" data-cards-restart>${icon('refresh')}再複習一次</button>
            <button class="btn btn-ghost" type="button" data-go-quiz>${icon('help')}回去做題</button>
          </div>
        </div>
      `;
      return;
    }

    const card = cardsState.deck[cardsState.index];
    if (!card) {
      cardsState.finished = true;
      renderCards();
      return;
    }

    const progress = Math.round(((cardsState.index + 1) / cardsState.deck.length) * 100);

    stage.innerHTML = `
      <div class="cards-topline">
        <span>第 <strong>${cardsState.index + 1}</strong> / ${cardsState.deck.length} 張</span>
        <div class="session-stats">
          <span><i class="dot green"></i>記得 ${cardsState.remembered}</span>
          <span><i class="dot red"></i>不記得 ${cardsState.forgotten}</span>
        </div>
      </div>
      <div class="progress-track"><span style="width:${progress}%"></span></div>
      <div class="flashcard ${cardsState.flipped ? 'is-flipped' : ''}" data-card-flip tabindex="0" role="button" aria-label="${cardsState.flipped ? '翻回正面' : '翻面查看答案'}" aria-pressed="${cardsState.flipped}">
        <div class="flashcard-inner">
          <div class="flashcard-face front">
            <span class="flashcard-label">問題</span>
            <div class="flashcard-content">${esc(card.front)}</div>
            <span class="flashcard-hint">${icon('flip')}點一下卡片看答案</span>
          </div>
          <div class="flashcard-face back">
            <span class="flashcard-quote" aria-hidden="true">”</span>
            <span class="flashcard-label light">答案</span>
            <div class="flashcard-content answer">${esc(card.back)}</div>
            <span class="flashcard-hint">${icon('flip')}點一下翻回正面</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-danger-soft" type="button" data-card-mark="forgotten">${icon('x')}不記得</button>
        <button class="btn btn-success" type="button" data-card-mark="remembered">${icon('check')}記得了</button>
      </div>
      <p class="flip-hint">空白鍵翻面 · 按 1 不記得 · 按 2 記得</p>
    `;
  }

  function handleStudyShortcuts(event) {
    if (page !== 'study' || !state.study.current) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (document.querySelector('dialog[open]')) return;

    const tag = event.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable) return;

    if (state.study.tab === 'quiz') {
      const quiz = state.study.quiz;
      if (!quiz || quiz.finished || !quiz.questions.length) return;

      if (/^[1-4]$/.test(event.key) && !quiz.submitted && !quiz.submitting) {
        event.preventDefault();
        selectQuizOption(Number(event.key) - 1);
        return;
      }

      if (event.key === 'Enter' && !event.target.closest('button, a, [role="button"]')) {
        if (quiz.submitted) {
          event.preventDefault();
          nextQuizQuestion();
        } else if (quiz.selected !== null) {
          event.preventDefault();
          submitQuizAnswer($('[data-quiz-submit]'));
        }
      }
      return;
    }

    const cards = state.study.cards;
    if (!cards || cards.finished || !cards.deck.length) return;

    if (event.key === '1' && !cards.marking) {
      event.preventDefault();
      markCard(false, $('[data-card-mark="forgotten"]'));
      return;
    }

    if (event.key === '2' && !cards.marking) {
      event.preventDefault();
      markCard(true, $('[data-card-mark="remembered"]'));
      return;
    }

    if (event.key === ' ' && !event.target.closest('button, [data-card-flip]')) {
      event.preventDefault();
      flipCard();
    }
  }

  /* =========================================================
     學習統計
     ========================================================= */

  function initStatsPage() {
    $('#btnRefreshStats')?.addEventListener('click', (event) => {
      loadStats(event.currentTarget);
    });

    loadStats();

    const redraw = debounce(() => {
      if (page === 'stats' && state.stats) drawAllCharts(state.stats);
    }, 180);

    window.addEventListener('resize', redraw);
    window.addEventListener('orientationchange', redraw);
  }

  async function loadStats(button = null) {
    if (button) setLoading(button, true, '整理中…');
    setText('#statsUpdated', '正在更新…');

    try {
      const data = await api('/api/stats');
      state.stats = data;
      renderStats(data);
      setText('#statsUpdated', `更新於 ${formatTime(data.generated_at) || '剛剛'}`);
    } catch (error) {
      setText('#statsUpdated', '更新失敗');
      toast(error.message, 'error', '無法載入學習統計');
    } finally {
      if (button) setLoading(button, false);
    }
  }

  function renderStats(data) {
    const totals = data.totals || {};

    animateNumber($('#statAttempts'), totals.attempts || 0);
    animateNumber($('#statAccuracy'), totals.accuracy || 0, {
      suffix: '%',
      dash: !totals.attempts,
    });
    animateNumber($('#statReviews'), totals.reviews || 0);
    animateNumber($('#statNotes'), totals.notes || 0);

    setText(
      '#statAttemptsHint',
      totals.attempts
        ? `答對 ${formatNumber(totals.correct)} 題 · 共 ${formatNumber(totals.attempts)} 次`
        : '每一次作答都會被記錄'
    );
    setText(
      '#statAccuracyHint',
      totals.attempts
        ? `答對 ${formatNumber(totals.correct)} / ${formatNumber(totals.attempts)} 題`
        : '作答後自動計算'
    );
    setText(
      '#statReviewsHint',
      totals.reviews
        ? `記得 ${formatNumber(totals.remembered)} · 不記得 ${formatNumber(totals.forgotten)}`
        : '記得與不記得的累計次數'
    );
    setText(
      '#statNotesHint',
      totals.notes
        ? `${formatNumber(totals.questions)} 道題目 · ${formatNumber(totals.cards)} 張閃卡`
        : '持續累積你的學習資料'
    );

    const notice = $('#statsNotice');
    if (notice) notice.hidden = Boolean(totals.attempts || totals.reviews);

    animateNumber($('#rememberedValue'), totals.remembered || 0);
    animateNumber($('#forgottenValue'), totals.forgotten || 0);
    const reviews = totals.reviews || 0;
    setText(
      '#cardRememberRate',
      reviews
        ? `記得比例 ${Math.round(((totals.remembered || 0) / reviews) * 100)}% · 共複習 ${formatNumber(reviews)} 次`
        : '尚無複習紀錄'
    );

    renderWeakSubjects(data.subjects || []);
    renderRecentAttempts(data.recent || []);

    requestAnimationFrame(() => drawAllCharts(data));
  }

  function renderWeakSubjects(subjects) {
    const container = $('#weakList');
    if (!container) return;

    const ranked = [...subjects]
      .filter((item) => item.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
      .slice(0, 4);

    if (!ranked.length) {
      container.innerHTML = '<div class="mini-empty">還沒有作答紀錄。做幾題選擇題後,就能看出哪一科最需要加強。</div>';
      return;
    }

    container.innerHTML = ranked.map((item) => {
      const tone = item.accuracy >= 80 ? 'good' : item.accuracy >= 60 ? 'mid' : 'low';
      return `
        <a class="weak-item ${tone}" href="/index.html?subject=${encodeURIComponent(item.subject)}" title="到筆記庫篩選 ${esc(item.subject)}">
          <div class="weak-top">
            ${subjectPill(item.subject)}
            <strong class="${tone}">${item.accuracy}%</strong>
          </div>
          <div class="weak-bar"><span style="width:${Math.max(4, item.accuracy)}%"></span></div>
          <p class="weak-meta">答對 ${item.correct} / ${item.attempts} 題 · ${item.note_count} 篇筆記</p>
        </a>
      `;
    }).join('');
  }

  function renderRecentAttempts(recent) {
    const container = $('#recentList');
    if (!container) return;

    if (!recent.length) {
      container.innerHTML = '<div class="mini-empty" style="grid-column:1/-1">還沒有作答紀錄。到「測驗與閃卡」做一輪題目,這裡就會出現你的學習軌跡。</div>';
      return;
    }

    container.innerHTML = recent.map((item) => `
      <div class="recent-item">
        <span class="result-dot ${item.is_correct ? 'correct' : 'wrong'}" aria-label="${item.is_correct ? '答對' : '答錯'}">
          ${item.is_correct ? icon('check') : icon('x')}
        </span>
        <div class="recent-copy">
          <p>${esc(truncate(item.question, 90))}</p>
          <span>${esc(item.subject)} · ${esc(item.note_title)} · ${timeAgo(item.created_at)}</span>
        </div>
      </div>
    `).join('');
  }

  /* ------------------------------ Canvas charts ------------------------------ */

  const CHART = {
    brand: '#5b5bf6',
    brandLight: 'rgba(91, 91, 246, 0.18)',
    green: '#0e9f6e',
    red: '#e5484d',
    amber: '#f79009',
    ink: '#172033',
    muted: '#667085',
    faint: '#98a2b3',
    grid: 'rgba(23, 32, 51, 0.08)',
    track: '#eff0f6',
    font: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
  };

  function prepareCanvas(canvas, height) {
    if (!canvas) return null;
    const parentWidth = canvas.parentElement?.clientWidth || canvas.clientWidth || 360;
    const width = Math.max(260, Math.floor(parentWidth));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }

  function prepareSquareCanvas(canvas, size = 180) {
    if (!canvas) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    return { ctx, width: size, height: size };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
  }

  function fitCanvasText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && ctx.measureText(`${output}…`).width > maxWidth) {
      output = output.slice(0, -1);
    }
    return `${output}…`;
  }

  function drawChartEmpty(ctx, width, height, message) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(23, 32, 51, 0.11)';
    ctx.lineWidth = 1;
    roundedRect(ctx, 8, 8, width - 16, height - 16, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CHART.faint;
    ctx.font = `12px ${CHART.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
    ctx.restore();
  }

  function drawSubjectChart(data) {
    const canvas = $('#subjectChart');
    if (!canvas) return;

    const subjects = (data.subjects || [])
      .filter((item) => item.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy || a.subject.localeCompare(b.subject));

    const rowHeight = 48;
    const height = subjects.length
      ? Math.max(190, 16 + subjects.length * rowHeight + 10)
      : 220;
    const prepared = prepareCanvas(canvas, height);
    if (!prepared) return;
    const { ctx, width } = prepared;

    if (!subjects.length) {
      drawChartEmpty(ctx, width, height, '還沒有科目作答紀錄');
      canvas.setAttribute('aria-label', '各科目答對率:尚無資料');
      return;
    }

    const compact = width < 420;
    const left = compact ? 64 : 82;
    const right = compact ? 48 : 70;
    const barX = left;
    const barWidth = Math.max(30, width - left - right);

    ctx.textBaseline = 'middle';

    subjects.forEach((item, index) => {
      const top = 12 + index * rowHeight;
      const barY = top + 12;

      ctx.textAlign = 'right';
      ctx.fillStyle = CHART.ink;
      ctx.font = `700 ${compact ? 11 : 12}px ${CHART.font}`;
      ctx.fillText(fitCanvasText(ctx, item.subject, left - 14), left - 10, top + 20);

      ctx.fillStyle = CHART.faint;
      ctx.font = `600 10px ${CHART.font}`;
      ctx.fillText(`${item.attempts} 題`, left - 10, top + 35);

      ctx.fillStyle = CHART.track;
      roundedRect(ctx, barX, barY, barWidth, 16, 8);
      ctx.fill();

      const colors = item.accuracy < 60
        ? ['#f97066', '#e5484d']
        : item.accuracy < 80
          ? ['#fdb022', '#f79009']
          : ['#32d583', '#0e9f6e'];

      const fillWidth = Math.max(5, (barWidth * item.accuracy) / 100);
      const gradient = ctx.createLinearGradient(barX, 0, barX + fillWidth, 0);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);
      ctx.fillStyle = gradient;
      roundedRect(ctx, barX, barY, fillWidth, 16, 8);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = CHART.ink;
      ctx.font = `900 ${compact ? 12 : 13}px ${CHART.font}`;
      ctx.fillText(`${item.accuracy}%`, barX + barWidth + 10, top + 21);
    });

    canvas.setAttribute(
      'aria-label',
      `各科目答對率:${subjects.map((item) => `${item.subject} ${item.accuracy}%`).join('、')}`
    );
  }

  function drawDailyChart(data) {
    const canvas = $('#dailyChart');
    if (!canvas) return;

    const daily = Array.isArray(data.daily) ? data.daily : [];
    const prepared = prepareCanvas(canvas, 260);
    if (!prepared) return;
    const { ctx, width, height } = prepared;

    if (!daily.length) {
      drawChartEmpty(ctx, width, height, '近 7 天尚無資料');
      return;
    }

    const left = 30;
    const right = 10;
    const top = 24;
    const bottom = 34;
    const plotWidth = Math.max(40, width - left - right);
    const plotHeight = height - top - bottom;
    const maximum = Math.max(1, ...daily.map((item) => item.attempts));
    const gridMaximum = maximum <= 4 ? 4 : Math.ceil(maximum / 4) * 4;
    const step = gridMaximum / 4;

    ctx.textBaseline = 'middle';

    for (let line = 0; line <= 4; line += 1) {
      const value = step * line;
      const y = top + plotHeight - (plotHeight * line) / 4;
      ctx.strokeStyle = CHART.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y + 0.5);
      ctx.lineTo(width - right, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = CHART.faint;
      ctx.font = `600 9px ${CHART.font}`;
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(value)), left - 7, y);
    }

    const slot = plotWidth / daily.length;
    const barWidth = Math.min(32, slot * 0.52);
    const baseline = top + plotHeight;

    daily.forEach((item, index) => {
      const centerX = left + slot * index + slot / 2;
      const totalHeight = (item.attempts / gridMaximum) * plotHeight;
      const correctHeight = (item.correct / gridMaximum) * plotHeight;

      if (item.attempts > 0) {
        ctx.fillStyle = CHART.brandLight;
        roundedRect(ctx, centerX - barWidth / 2, baseline - totalHeight, barWidth, Math.max(2, totalHeight), 7);
        ctx.fill();
      }

      if (item.correct > 0) {
        const gradient = ctx.createLinearGradient(0, baseline - correctHeight, 0, baseline);
        gradient.addColorStop(0, '#34d399');
        gradient.addColorStop(1, CHART.green);
        ctx.fillStyle = gradient;
        roundedRect(ctx, centerX - barWidth / 2, baseline - correctHeight, barWidth, Math.max(2, correctHeight), 7);
        ctx.fill();
      }

      if (item.attempts > 0) {
        ctx.fillStyle = CHART.ink;
        ctx.font = `800 10px ${CHART.font}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(item.attempts), centerX, baseline - totalHeight - 8);
      }

      ctx.fillStyle = CHART.muted;
      ctx.font = `600 ${width < 380 ? 9 : 10}px ${CHART.font}`;
      ctx.textAlign = 'center';
      ctx.fillText(item.label, centerX, height - 12);
    });

    if (!daily.some((item) => item.attempts > 0)) {
      ctx.fillStyle = CHART.faint;
      ctx.font = `12px ${CHART.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('近 7 天還沒有作答', left + plotWidth / 2, top + plotHeight / 2);
    }

    canvas.setAttribute(
      'aria-label',
      `近七天作答:${daily.map((item) => `${item.label} 作答 ${item.attempts} 題、答對 ${item.correct} 題`).join(';')}`
    );
  }

  function drawCardChart(data) {
    const canvas = $('#cardChart');
    if (!canvas) return;
    const { ctx, width, height } = prepareSquareCanvas(canvas, 180) || {};
    if (!ctx) return;

    const totals = data.totals || {};
    const remembered = Number(totals.remembered) || 0;
    const forgotten = Number(totals.forgotten) || 0;
    const total = remembered + forgotten;
    const center = width / 2;
    const radius = 62;
    const lineWidth = 20;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = CHART.track;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (total > 0) {
      const start = -Math.PI / 2;
      const gap = 0.018;
      const rememberedAngle = (remembered / total) * Math.PI * 2;
      const forgottenAngle = (forgotten / total) * Math.PI * 2;

      ctx.lineCap = 'round';

      if (remembered > 0) {
        ctx.strokeStyle = CHART.green;
        ctx.beginPath();
        ctx.arc(center, center, radius, start + gap, start + rememberedAngle - gap);
        ctx.stroke();
      }

      if (forgotten > 0) {
        ctx.strokeStyle = CHART.red;
        ctx.beginPath();
        ctx.arc(center, center, radius, start + rememberedAngle + gap, start + rememberedAngle + forgottenAngle - gap);
        ctx.stroke();
      }
    }

    const rate = total ? Math.round((remembered / total) * 100) : 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = CHART.ink;
    ctx.font = `900 28px ${CHART.font}`;
    ctx.fillText(`${rate}%`, center, center - 5);
    ctx.fillStyle = CHART.muted;
    ctx.font = `700 10px ${CHART.font}`;
    ctx.fillText(total ? '記得' : '尚無複習', center, center + 22);

    canvas.setAttribute(
      'aria-label',
      total
        ? `閃卡記憶狀況:記得 ${remembered} 次、不記得 ${forgotten} 次,記得比例 ${rate}%`
        : '閃卡記憶狀況:尚無複習紀錄'
    );
  }

  function drawAllCharts(data) {
    drawSubjectChart(data);
    drawDailyChart(data);
    drawCardChart(data);
  }

  /* ------------------------------ Init ------------------------------ */

  function init() {
    setupCommon();

    if (page === 'notes') initNotesPage();
    else if (page === 'study') initStudyPage();
    else if (page === 'stats') initStatsPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();





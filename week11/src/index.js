import {
  addAttempt,
  addCards,
  addQuestions,
  createNote,
  deleteNote,
  getCard,
  getNote,
  getQuestion,
  getStats,
  listCards,
  listNotes,
  listQuestions,
  listSubjects,
  reviewCard,
  saveSummary,
  updateNote,
} from './db.js';
import {
  AiError,
  generateCards,
  generateQuestions,
  summarizeNote,
} from './ai.js';

class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

function json(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: JSON_HEADERS,
  });
}

function fail(code, message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function notFound(message = '找不到資料') {
  return new ApiError('NOT_FOUND', message, 404);
}

function methodNotAllowed(allow) {
  return new ApiError(
    'METHOD_NOT_ALLOWED',
    `這個路徑不支援 ${allow} 以外的方法`,
    405
  );
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  if (text.length > 1_000_000) {
    throw new ApiError('PAYLOAD_TOO_LARGE', '請求內容過大', 413);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_JSON', '請求格式不是合法的 JSON', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('INVALID_JSON', '請求內容必須是 JSON 物件', 400);
  }
  return body;
}

function cleanText(value, { field, max, required = false, fallback = '' }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError('VALIDATION_ERROR', `請填寫${field}`, 400);
    return fallback;
  }
  if (typeof value !== 'string') {
    throw new ApiError('VALIDATION_ERROR', `${field}格式不正確`, 400);
  }

  const text = value.trim();
  if (required && !text) {
    throw new ApiError('VALIDATION_ERROR', `請填寫${field}`, 400);
  }
  if (text.length > max) {
    throw new ApiError('VALIDATION_ERROR', `${field}不可超過 ${max} 個字`, 400);
  }
  return text || fallback;
}

function normalizeSubject(value) {
  return cleanText(value, { field: '科目', max: 30, fallback: '一般' }) || '一般';
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ApiError('VALIDATION_ERROR', '識別碼格式不正確', 400);
  }
  return id;
}

function publicQuestion(question) {
  return {
    id: question.id,
    note_id: question.note_id,
    question: question.question,
    options: question.options,
  };
}

async function getNoteBundle(env, id) {
  const note = await getNote(env.DB, id);
  if (!note) return null;

  const [questions, cards] = await Promise.all([
    listQuestions(env.DB, id),
    listCards(env.DB, id),
  ]);

  return {
    ...note,
    questions: questions.map(publicQuestion),
    cards,
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS' && path.startsWith('/api/')) {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  /* ---------------------------- 健康檢查 ---------------------------- */
  if (path === '/api/health') {
    if (method !== 'GET') throw methodNotAllowed('GET');
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({
      status: 'ok',
      database: 'ok',
      ai: env.AI ? 'bound' : 'missing',
      time: new Date().toISOString(),
    });
  }

  /* ------------------------------ 筆記 ------------------------------ */
  if (path === '/api/notes') {
    if (method === 'GET') {
      const q = cleanText(url.searchParams.get('q'), {
        field: '搜尋關鍵字',
        max: 100,
      });
      const subject = cleanText(url.searchParams.get('subject'), {
        field: '科目',
        max: 30,
      });

      const [notes, subjects] = await Promise.all([
        listNotes(env.DB, { q, subject }),
        listSubjects(env.DB),
      ]);

      return json({ notes, subjects, count: notes.length });
    }

    if (method === 'POST') {
      const body = await readJson(request);
      const subject = normalizeSubject(body.subject);
      const title = cleanText(body.title, {
        field: '標題',
        max: 100,
        required: true,
      });
      const content = cleanText(body.content, {
        field: '筆記內容',
        max: 20_000,
        required: true,
      });

      const note = await createNote(env.DB, { subject, title, content });
      return json(note, 201);
    }

    throw methodNotAllowed('GET, POST');
  }

  let match = path.match(/^\/api\/notes\/(\d+)$/);
  if (match) {
    const id = parseId(match[1]);

    if (method === 'GET') {
      const bundle = await getNoteBundle(env, id);
      if (!bundle) throw notFound('找不到這篇筆記');
      return json(bundle);
    }

    if (method === 'PUT') {
      const body = await readJson(request);
      const fields = {};

      if ('subject' in body) fields.subject = normalizeSubject(body.subject);
      if ('title' in body) {
        fields.title = cleanText(body.title, {
          field: '標題',
          max: 100,
          required: true,
        });
      }
      if ('content' in body) {
        fields.content = cleanText(body.content, {
          field: '筆記內容',
          max: 20_000,
          required: true,
        });
      }
      if ('pinned' in body) {
        if (typeof body.pinned !== 'boolean' && body.pinned !== 0 && body.pinned !== 1) {
          throw new ApiError('VALIDATION_ERROR', '釘選狀態格式不正確', 400);
        }
        fields.pinned = body.pinned ? 1 : 0;
      }

      if (!Object.keys(fields).length) {
        throw new ApiError('VALIDATION_ERROR', '沒有可更新的欄位', 400);
      }

      const note = await updateNote(env.DB, id, fields);
      if (!note) throw notFound('找不到這篇筆記');
      return json(note);
    }

    if (method === 'DELETE') {
      const deleted = await deleteNote(env.DB, id);
      if (!deleted) throw notFound('找不到這篇筆記');
      return json({ id });
    }

    throw methodNotAllowed('GET, PUT, DELETE');
  }

  /* --------------------------- AI 摘要 ----------------------------- */
  match = path.match(/^\/api\/notes\/(\d+)\/summarize$/);
  if (match) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    const id = parseId(match[1]);
    const note = await getNote(env.DB, id);
    if (!note) throw notFound('找不到這篇筆記');

    const { summary, keywords } = await summarizeNote(env, note);
    const updated = await saveSummary(env.DB, id, summary, keywords);
    return json(updated);
  }

  /* ---------------------------- AI 出題 ---------------------------- */
  match = path.match(/^\/api\/notes\/(\d+)\/questions$/);
  if (match) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    const id = parseId(match[1]);
    const note = await getNote(env.DB, id);
    if (!note) throw notFound('找不到這篇筆記');

    const generated = await generateQuestions(env, note);
    const questions = await addQuestions(env.DB, id, generated);
    const updated = await getNote(env.DB, id);

    return json({
      note: updated,
      questions: questions.map(publicQuestion),
      count: generated.length,
    });
  }

  /* --------------------------- AI 閃卡 ---------------------------- */
  match = path.match(/^\/api\/notes\/(\d+)\/cards$/);
  if (match) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    const id = parseId(match[1]);
    const note = await getNote(env.DB, id);
    if (!note) throw notFound('找不到這篇筆記');

    const generated = await generateCards(env, note);
    const cards = await addCards(env.DB, id, generated);
    const updated = await getNote(env.DB, id);

    return json({
      note: updated,
      cards,
      count: generated.length,
    });
  }

  /* ----------------------------- 作答 ----------------------------- */
  match = path.match(/^\/api\/questions\/(\d+)\/answer$/);
  if (match) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    const id = parseId(match[1]);
    const body = await readJson(request);
    const answer = typeof body.answer === 'string' && /^[0-3]$/.test(body.answer)
      ? Number(body.answer)
      : body.answer;

    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw new ApiError('VALIDATION_ERROR', '請選擇 0 到 3 的答案索引', 400);
    }

    const question = await getQuestion(env.DB, id);
    if (!question) throw notFound('找不到這道題目');

    const isCorrect = answer === question.answer;
    const attemptId = await addAttempt(env.DB, id, isCorrect);

    return json({
      questionId: id,
      attemptId,
      correct: isCorrect,
      correctAnswer: question.answer,
      explanation: question.explanation,
    });
  }

  /* --------------------------- 閃卡複習 --------------------------- */
  match = path.match(/^\/api\/cards\/(\d+)\/review$/);
  if (match) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    const id = parseId(match[1]);
    const body = await readJson(request);

    if (typeof body.remembered !== 'boolean') {
      throw new ApiError('VALIDATION_ERROR', 'remembered 必須是 true 或 false', 400);
    }

    const card = await getCard(env.DB, id);
    if (!card) throw notFound('找不到這張閃卡');

    const updated = await reviewCard(env.DB, id, body.remembered);
    return json(updated);
  }

  /* ----------------------------- 統計 ----------------------------- */
  if (path === '/api/stats') {
    if (method !== 'GET') throw methodNotAllowed('GET');
    const stats = await getStats(env.DB);
    return json(stats);
  }

  throw new ApiError('NOT_FOUND', '找不到這個 API 路徑', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        if (error instanceof ApiError || error instanceof AiError) {
          return fail(error.code, error.message, error.status);
        }

        console.error('Unhandled API error:', error);
        return fail('INTERNAL_ERROR', '伺服器發生錯誤,請稍後再試', 500);
      }
    }

    if (!env.ASSETS) {
      return new Response('StudyBox: static assets binding is missing.', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

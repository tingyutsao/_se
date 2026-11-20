/**
 * StudyBox D1 資料存取層
 * 所有函式都只和 env.DB 互動,方便在 Worker 中重複使用。
 */

const NOTE_SELECT = `
  SELECT n.*,
    (SELECT COUNT(*) FROM questions q WHERE q.note_id = n.id) AS question_count,
    (SELECT COUNT(*) FROM cards c WHERE c.note_id = n.id) AS card_count,
    (SELECT COUNT(*) FROM attempts a
       JOIN questions q ON q.id = a.question_id
      WHERE q.note_id = n.id) AS attempt_count,
    (SELECT COALESCE(SUM(a.is_correct), 0) FROM attempts a
       JOIN questions q ON q.id = a.question_id
      WHERE q.note_id = n.id) AS correct_count
  FROM notes n
`;

function safeParseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapNote(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    pinned: Number(row.pinned) || 0,
    keywords: safeParseArray(row.keywords),
    question_count: Number(row.question_count) || 0,
    card_count: Number(row.card_count) || 0,
    attempt_count: Number(row.attempt_count) || 0,
    correct_count: Number(row.correct_count) || 0,
  };
}

export function mapQuestion(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    note_id: Number(row.note_id),
    options: safeParseArray(row.options),
    answer: Number(row.answer),
  };
}

export function mapCard(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    note_id: Number(row.note_id),
    remembered: Number(row.remembered) || 0,
    forgotten: Number(row.forgotten) || 0,
  };
}

export async function listNotes(db, { q = '', subject = '' } = {}) {
  const clauses = [];
  const params = [];

  if (subject) {
    clauses.push('n.subject = ?');
    params.push(subject);
  }

  if (q) {
    const like = `%${q}%`;
    clauses.push('(n.title LIKE ? OR n.content LIKE ? OR n.summary LIKE ? OR n.keywords LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db
    .prepare(`${NOTE_SELECT} ${where} ORDER BY n.pinned DESC, n.created_at DESC`)
    .bind(...params)
    .all();

  return (results || []).map(mapNote);
}

export async function listSubjects(db) {
  const { results } = await db
    .prepare(`
      SELECT subject, COUNT(*) AS count
      FROM notes
      GROUP BY subject
      ORDER BY subject COLLATE NOCASE ASC
    `)
    .all();

  return (results || []).map((row) => ({
    subject: row.subject,
    count: Number(row.count) || 0,
  }));
}

export async function getNote(db, id) {
  const row = await db.prepare(`${NOTE_SELECT} WHERE n.id = ?`).bind(id).first();
  return mapNote(row);
}

export async function createNote(db, { subject, title, content, pinned = 0 }) {
  const createdAt = new Date().toISOString();
  const result = await db
    .prepare(`
      INSERT INTO notes (subject, title, content, summary, keywords, pinned, created_at)
      VALUES (?, ?, ?, '', '[]', ?, ?)
    `)
    .bind(subject, title, content, pinned ? 1 : 0, createdAt)
    .run();

  return getNote(db, Number(result.meta.last_row_id));
}

export async function updateNote(db, id, fields) {
  const current = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
  if (!current) return null;

  const subject = fields.subject !== undefined ? fields.subject : current.subject;
  const title = fields.title !== undefined ? fields.title : current.title;
  const content = fields.content !== undefined ? fields.content : current.content;
  const pinned = fields.pinned !== undefined ? (fields.pinned ? 1 : 0) : current.pinned;

  await db
    .prepare('UPDATE notes SET subject = ?, title = ?, content = ?, pinned = ? WHERE id = ?')
    .bind(subject, title, content, pinned, id)
    .run();

  return getNote(db, id);
}

export async function deleteNote(db, id) {
  const existing = await db.prepare('SELECT id FROM notes WHERE id = ?').bind(id).first();
  if (!existing) return false;

  // 明確刪除關聯資料,不依賴資料庫是否開啟 foreign_keys。
  await db.batch([
    db.prepare(`
      DELETE FROM attempts
      WHERE question_id IN (SELECT id FROM questions WHERE note_id = ?)
    `).bind(id),
    db.prepare('DELETE FROM cards WHERE note_id = ?').bind(id),
    db.prepare('DELETE FROM questions WHERE note_id = ?').bind(id),
    db.prepare('DELETE FROM notes WHERE id = ?').bind(id),
  ]);

  return true;
}

export async function saveSummary(db, id, summary, keywords) {
  await db
    .prepare('UPDATE notes SET summary = ?, keywords = ? WHERE id = ?')
    .bind(summary, JSON.stringify(keywords || []), id)
    .run();

  return getNote(db, id);
}

export async function listQuestions(db, noteId) {
  const { results } = await db
    .prepare('SELECT * FROM questions WHERE note_id = ? ORDER BY id ASC')
    .bind(noteId)
    .all();

  return (results || []).map(mapQuestion);
}

export async function getQuestion(db, id) {
  const row = await db.prepare('SELECT * FROM questions WHERE id = ?').bind(id).first();
  return mapQuestion(row);
}

export async function addQuestions(db, noteId, questions) {
  if (!questions.length) return [];

  await db.batch(
    questions.map((question) =>
      db
        .prepare(`
          INSERT INTO questions (note_id, question, options, answer, explanation)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          noteId,
          question.question,
          JSON.stringify(question.options),
          question.answer,
          question.explanation || ''
        )
    )
  );

  return listQuestions(db, noteId);
}

export async function addAttempt(db, questionId, isCorrect) {
  const result = await db
    .prepare('INSERT INTO attempts (question_id, is_correct, created_at) VALUES (?, ?, ?)')
    .bind(questionId, isCorrect ? 1 : 0, new Date().toISOString())
    .run();

  return Number(result.meta.last_row_id);
}

export async function listCards(db, noteId) {
  const { results } = await db
    .prepare('SELECT * FROM cards WHERE note_id = ? ORDER BY id ASC')
    .bind(noteId)
    .all();

  return (results || []).map(mapCard);
}

export async function addCards(db, noteId, cards) {
  if (!cards.length) return [];

  await db.batch(
    cards.map((card) =>
      db
        .prepare('INSERT INTO cards (note_id, front, back) VALUES (?, ?, ?)')
        .bind(noteId, card.front, card.back)
    )
  );

  return listCards(db, noteId);
}

export async function getCard(db, id) {
  const row = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first();
  return mapCard(row);
}

export async function reviewCard(db, id, remembered) {
  const row = await db
    .prepare(`
      UPDATE cards
         SET remembered = remembered + ?,
             forgotten  = forgotten  + ?
       WHERE id = ?
       RETURNING *
    `)
    .bind(remembered ? 1 : 0, remembered ? 0 : 1, id)
    .first();

  return mapCard(row);
}

/* ------------------------------ 統計 ------------------------------ */

function taipeiDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function roundPercent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export async function getStats(db) {
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const [totalsResult, subjectsResult, attemptsResult, recentResult] = await db.batch([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM notes)                                   AS notes,
        (SELECT COUNT(*) FROM questions)                               AS questions,
        (SELECT COUNT(*) FROM cards)                                   AS cards,
        (SELECT COUNT(*) FROM attempts)                                AS attempts,
        (SELECT COALESCE(SUM(is_correct), 0) FROM attempts)            AS correct,
        (SELECT COALESCE(SUM(remembered), 0) FROM cards)               AS remembered,
        (SELECT COALESCE(SUM(forgotten), 0) FROM cards)                AS forgotten
    `),
    db.prepare(`
      SELECT n.subject AS subject,
             COUNT(a.id) AS attempts,
             COALESCE(SUM(a.is_correct), 0) AS correct,
             COUNT(DISTINCT n.id) AS note_count
        FROM attempts a
        JOIN questions q ON q.id = a.question_id
        JOIN notes n ON n.id = q.note_id
       GROUP BY n.subject
       ORDER BY attempts DESC, n.subject ASC
    `),
    db.prepare('SELECT created_at, is_correct FROM attempts WHERE created_at >= ? ORDER BY created_at ASC').bind(cutoff),
    db.prepare(`
      SELECT a.id, a.is_correct, a.created_at,
             q.question, n.title AS note_title, n.subject
        FROM attempts a
        JOIN questions q ON q.id = a.question_id
        JOIN notes n ON n.id = q.note_id
       ORDER BY a.created_at DESC
       LIMIT 8
    `),
  ]);

  const totalsRow = totalsResult.results?.[0] || {};
  const attempts = Number(totalsRow.attempts) || 0;
  const correct = Number(totalsRow.correct) || 0;
  const remembered = Number(totalsRow.remembered) || 0;
  const forgotten = Number(totalsRow.forgotten) || 0;

  const totals = {
    notes: Number(totalsRow.notes) || 0,
    questions: Number(totalsRow.questions) || 0,
    cards: Number(totalsRow.cards) || 0,
    attempts,
    correct,
    accuracy: roundPercent(correct, attempts),
    remembered,
    forgotten,
    reviews: remembered + forgotten,
  };

  const subjects = (subjectsResult.results || []).map((row) => {
    const subjectAttempts = Number(row.attempts) || 0;
    const subjectCorrect = Number(row.correct) || 0;
    return {
      subject: row.subject,
      attempts: subjectAttempts,
      correct: subjectCorrect,
      accuracy: roundPercent(subjectCorrect, subjectAttempts),
      note_count: Number(row.note_count) || 0,
    };
  });

  // 以台北時區計算最近 7 天,補齊沒有作答的日期。
  const dailyMap = new Map();
  for (const row of attemptsResult.results || []) {
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = taipeiDateKey(date);
    const current = dailyMap.get(key) || { attempts: 0, correct: 0 };
    current.attempts += 1;
    current.correct += Number(row.is_correct) ? 1 : 0;
    dailyMap.set(key, current);
  }

  const daily = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = taipeiDateKey(date);
    const value = dailyMap.get(key) || { attempts: 0, correct: 0 };
    const [, month, day] = key.split('-');
    daily.push({
      date: key,
      label: `${Number(month)}/${Number(day)}`,
      attempts: value.attempts,
      correct: value.correct,
      accuracy: roundPercent(value.correct, value.attempts),
    });
  }

  const recent = (recentResult.results || []).map((row) => ({
    id: Number(row.id),
    is_correct: Number(row.is_correct) || 0,
    created_at: row.created_at,
    question: row.question,
    note_title: row.note_title,
    subject: row.subject,
  }));

  return {
    totals,
    subjects,
    daily,
    recent,
    generated_at: new Date().toISOString(),
  };
}

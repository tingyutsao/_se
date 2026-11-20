-- StudyBox D1 schema
-- 使用方式:
--   npx wrangler d1 execute studybox-db --local  --file=./schema.sql
--   npx wrangler d1 execute studybox-db --remote --file=./schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject    TEXT    NOT NULL DEFAULT '一般',
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  summary    TEXT    NOT NULL DEFAULT '',
  keywords   TEXT    NOT NULL DEFAULT '[]',
  pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  question    TEXT    NOT NULL,
  options     TEXT    NOT NULL,
  answer      INTEGER NOT NULL CHECK (answer BETWEEN 0 AND 3),
  explanation TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  is_correct  INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  front       TEXT    NOT NULL,
  back        TEXT    NOT NULL,
  remembered  INTEGER NOT NULL DEFAULT 0 CHECK (remembered >= 0),
  forgotten   INTEGER NOT NULL DEFAULT 0 CHECK (forgotten >= 0)
);

CREATE INDEX IF NOT EXISTS idx_notes_subject    ON notes(subject);
CREATE INDEX IF NOT EXISTS idx_notes_pinned     ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_questions_note   ON questions(note_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_note       ON cards(note_id);

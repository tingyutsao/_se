import { Hono } from "hono";

/** 資料庫中一列待辦（done 為 SQLite INTEGER 0/1） */
interface TodoRowTable {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

/** 對外回傳的待辦（done 已轉為 boolean） */
export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
}

/** 準備後的查詢（結構相容 D1PreparedStatement；無參數時可不 bind 直接執行） */
export interface TodoStatement {
  bind(...values: unknown[]): TodoStatement;
  run(): Promise<{ meta: { changes?: number; last_row_id?: number } }>;
  first<T = TodoRowTable>(): Promise<T | null>;
  all<T = TodoRowTable>(): Promise<{ results?: T[] | null }>;
}

/** 準備查詢的介面（結構相容 D1Database，任何同形介面皆可傳入） */
export interface TodoDatabase {
  prepare(sql: string): TodoStatement;
}

export interface TodoApiOptions {
  /** D1 資料庫綁定（結構相容 Cloudflare D1Database） */
  db: TodoDatabase;
  /** 資料表名稱，預設 "todos"；只允許 [A-Za-z_][A-Za-z0-9_]* */
  table?: string;
  /** 標題最大長度，預設 200 */
  titleMaxLength?: number;
}

/** 把 SQLite 列轉成對外格式（done: 0/1 → boolean） */
export function toTodo(row: TodoRowTable): Todo {
  return { ...row, done: row.done === 1 };
}

/** 限制資料表名稱只能是不含特殊字元的識別字，避免注入 */
function safeTable(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

/**
 * 建立 Todo API 的 Hono 子應用（路由前綴相對）：
 * - GET    "/"       列出全部待辦（時間倒序）
 * - POST   "/"       新增待辦（body: { title }）
 * - PATCH  "/:id"    更新待辦（body: { done? , title? }）
 * - DELETE "/:id"    刪除待辦
 *
 * 典型用法（在自己的 Cloudflare Worker 中）：
 *
 * ```ts
 * import { Hono } from "hono";
 * import { createTodoApi } from "hono-todo-d1";
 *
 * type Env = { DB: D1Database };
 *
 * const app = new Hono<Env>();
 * app.get("/health", (c) => c.text("ok"));
 * app.all("/api/todos/*", (c) =>
 *   createTodoApi({ db: c.env.DB }).fetch(c.req.raw)
 * );
 * export default app;
 * ```
 */
export function createTodoApi(options: TodoApiOptions): Hono {
  const { db } = options;
  const table = safeTable(options.table ?? "todos");
  const maxLen = options.titleMaxLength ?? 200;
  const app = new Hono();

  /** 取得全部待辦 */
  app.get("/", async (c) => {
    const { results } = await db
      .prepare(
        `SELECT id, title, done, created_at FROM ${table} ORDER BY created_at DESC, id DESC`
      )
      .all<TodoRowTable>();
    return c.json({ todos: (results ?? []).map(toTodo) });
  });

  /** 新增待辦 */
  app.post("/", async (c) => {
    const body = await c.req.json<{ title?: unknown }>().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return c.json({ error: "請提供待辦標題" }, 400);
    }
    if (title.length > maxLen) {
      return c.json({ error: `標題最長 ${maxLen} 字` }, 400);
    }

    const result = await db
      .prepare(`INSERT INTO ${table} (title) VALUES (?)`)
      .bind(title)
      .run();

    const row = await db
      .prepare(`SELECT id, title, done, created_at FROM ${table} WHERE id = ?`)
      .bind(result.meta.last_row_id)
      .first<TodoRowTable>();

    return c.json({ todo: row ? toTodo(row) : null }, 201);
  });

  /** 更新待辦（切換完成狀態或改標題） */
  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id < 1) {
      return c.json({ error: "無效的 id" }, 400);
    }

    const body = await c.req
      .json<{ done?: boolean; title?: string }>()
      .catch(() => null);
    if (!body) {
      return c.json({ error: "無效的請求內容" }, 400);
    }

    if (typeof body.done === "boolean") {
      await db
        .prepare(`UPDATE ${table} SET done = ? WHERE id = ?`)
        .bind(body.done ? 1 : 0, id)
        .run();
    }

    if (typeof body.title === "string" && body.title.trim()) {
      const title = body.title.trim().slice(0, maxLen);
      await db
        .prepare(`UPDATE ${table} SET title = ? WHERE id = ?`)
        .bind(title, id)
        .run();
    }

    const row = await db
      .prepare(`SELECT id, title, done, created_at FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<TodoRowTable>();

    if (!row) {
      return c.json({ error: "找不到這筆待辦" }, 404);
    }
    return c.json({ todo: toTodo(row) });
  });

  /** 刪除待辦 */
  app.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id < 1) {
      return c.json({ error: "無效的 id" }, 400);
    }

    const result = await db
      .prepare(`DELETE FROM ${table} WHERE id = ?`)
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return c.json({ error: "找不到這筆待辦" }, 404);
    }
    return c.json({ ok: true });
  });

  return app;
}

/**
 * 便利包裝：回傳一個已掛上 /api/todos 前綴的 Hono 應用，
 * 需要 D1 binding 才能建立。適合在 Worker fetch handler 裡
 * 依 request 現場組合：
 *
 * ```ts
 * export default {
 *   fetch: (req, env) => createTodoApp({ db: env.DB }).fetch(req),
 * };
 * ```
 */
export function createTodoApp(options: TodoApiOptions): Hono {
  const app = new Hono();
  app.route("/api/todos", createTodoApi(options));
  return app;
}

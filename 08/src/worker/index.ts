import { Hono } from "hono";

// D1 資料庫綁定
interface Env {
  DB: D1Database;
}

interface TodoRow {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

function toTodo(row: TodoRow) {
  return { ...row, done: row.done === 1, created_at: row.created_at };
}

const app = new Hono<{ Bindings: Env }>();

/** 取得全部待辦 */
app.get("/api/todos", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, done, created_at FROM todos ORDER BY created_at DESC, id DESC"
  ).all<TodoRow>();
  return c.json({ todos: (results ?? []).map(toTodo) });
});

/** 新增待辦 */
app.post("/api/todos", async (c) => {
  const body = await c.req.json<{ title?: unknown }>().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return c.json({ error: "請提供待辦標題" }, 400);
  }
  if (title.length > 200) {
    return c.json({ error: "標題最長 200 字" }, 400);
  }

  const result = await c.env.DB.prepare("INSERT INTO todos (title) VALUES (?)")
    .bind(title)
    .run();

  const row = await c.env.DB.prepare(
    "SELECT id, title, done, created_at FROM todos WHERE id = ?"
  )
    .bind(result.meta.last_row_id)
    .first<TodoRow>();

  return c.json({ todo: row ? toTodo(row) : null }, 201);
});

/** 更新待辦（切換完成狀態或改標題） */
app.patch("/api/todos/:id", async (c) => {
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
    await c.env.DB.prepare("UPDATE todos SET done = ? WHERE id = ?")
      .bind(body.done ? 1 : 0, id)
      .run();
  }

  if (typeof body.title === "string" && body.title.trim()) {
    const title = body.title.trim().slice(0, 200);
    await c.env.DB.prepare("UPDATE todos SET title = ? WHERE id = ?")
      .bind(title, id)
      .run();
  }

  const row = await c.env.DB.prepare(
    "SELECT id, title, done, created_at FROM todos WHERE id = ?"
  )
    .bind(id)
    .first<TodoRow>();

  if (!row) {
    return c.json({ error: "找不到這筆待辦" }, 404);
  }
  return c.json({ todo: toTodo(row) });
});

/** 刪除待辦 */
app.delete("/api/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ error: "無效的 id" }, 400);
  }

  const result = await c.env.DB.prepare("DELETE FROM todos WHERE id = ?")
    .bind(id)
    .run();
  if (result.meta.changes === 0) {
    return c.json({ error: "找不到這筆待辦" }, 404);
  }
  return c.json({ ok: true });
});

export default app;

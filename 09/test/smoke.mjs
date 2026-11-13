// 煙霧測試：用 Node 內建 node:sqlite 做假的 D1 binding，
// 驗證 CRUD 路由的行為與 _se/08 原始 Worker 一致。
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { createTodoApi, createTodoApp } from "../dist/index.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(
  "CREATE TABLE todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
);

// 模擬 D1Database.prepare(sql).bind(...).run/first/all 介面
const db = {
  prepare: (sql) => {
    const stmt = sqlite.prepare(sql);
    const makeStatement = (vals = []) => ({
      bind: (...next) => makeStatement([...vals, ...next]),
      run: () => {
        const info = stmt.run(...vals);
        return {
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
      first: () => {
        const row = stmt.get(...vals);
        return row === undefined ? null : row;
      },
      all: () => ({ results: stmt.all(...vals) }),
    });
    return makeStatement();
  },
};

const app = createTodoApi({ db });

async function post(title) {
  return app.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

// 1) 空清單
let res = await app.request("/");
assert.equal(res.status, 200);
assert.deepEqual(await res.json(), { todos: [] });

// 2) 新增
res = await post("買牛奶");
assert.equal(res.status, 201);
let created = (await res.json()).todo;
assert.equal(created.title, "買牛奶");
assert.equal(created.done, false);
assert.equal(created.id, 1);

res = await post("寫作業");
assert.equal((await res.json()).todo.id, 2);

// 3) 驗證錯誤
res = await post("   ");
assert.equal(res.status, 400);
res = await post("x".repeat(201));
assert.equal(res.status, 400);

// 4) 列表（時間倒序）
res = await app.request("/");
let list = (await res.json()).todos;
assert.equal(list.length, 2);
assert.equal(list[0].title, "寫作業");

// 5) 勾選完成
res = await app.request("/1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ done: true }),
});
assert.equal(res.status, 200);
assert.equal((await res.json()).todo.done, true);

// 6) 改標題
res = await app.request("/1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "買兩罐牛奶" }),
});
assert.equal((await res.json()).todo.title, "買兩罐牛奶");

// 7) 不存在的 id
res = await app.request("/999", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ done: true }),
});
assert.equal(res.status, 404);
res = await app.request("/999", { method: "DELETE" });
assert.equal(res.status, 404);

// 8) 刪除
res = await app.request("/2", { method: "DELETE" });
assert.equal(res.status, 200);
assert.deepEqual(await res.json(), { ok: true });
res = await app.request("/");
list = (await res.json()).todos;
assert.equal(list.length, 1);
assert.equal(list[0].id, 1);

// 9) 無效 id
res = await app.request("/abc", { method: "DELETE" });
assert.equal(res.status, 400);

// 10) createTodoApp 已掛 /api/todos 前綴
res = await createTodoApp({ db }).request("/api/todos");
assert.equal(res.status, 200);
assert.equal((await res.json()).todos.length, 1);

// 11) SQL injection 嘗試（prepared statement 應無害）
res = await post("'; DROP TABLE todos; --");
assert.equal(res.status, 201);
res = await app.request("/");
assert.equal(res.status, 200); // 資料表還在

console.log("All smoke tests passed ✔");

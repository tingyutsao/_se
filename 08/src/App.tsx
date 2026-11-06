import { useCallback, useEffect, useState } from "react";

// TODO 資料型別
export interface Todo {
  id: number;
  title: string;
  done: boolean;
  created_at: string;
}

export type TodoResponse = { todos: Todo[] };
export type TodoItemResponse = { todo: Todo };
export type DeleteResponse = { ok: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `API 錯誤：${res.status}`);
  }
  return res.json() as Promise<T>;
}

type Filter = "all" | "active" | "done";

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await api<TodoResponse>("/api/todos");
      setTodos(data.todos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || adding) return;

    setAdding(true);
    setError(null);
    try {
      const data = await api<TodoItemResponse>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ title: value }),
      });
      if (data.todo) {
        setTodos((prev) => [data.todo as Todo, ...prev]);
        setTitle("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTodo(todo: Todo) {
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))
    );
    try {
      const data = await api<TodoItemResponse>(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !todo.done }),
      });
      if (data.todo) {
        setTodos((prev) =>
          prev.map((t) => (t.id === todo.id ? (data.todo as Todo) : t))
        );
      }
    } catch (err) {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t))
      );
      setError(err instanceof Error ? err.message : "更新失敗");
    }
  }

  async function removeTodo(id: number) {
    const snapshot = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await api<DeleteResponse>(`/api/todos/${id}`, { method: "DELETE" });
    } catch (err) {
      setTodos(snapshot);
      setError(err instanceof Error ? err.message : "刪除失敗");
    }
  }

  const visible =
    filter === "all"
      ? todos
      : todos.filter((t) => (filter === "done" ? t.done : !t.done));

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <main className="app">
      <header className="header">
        <h1>待辦清單</h1>
        <p className="subtitle">React + Hono + Cloudflare D1</p>
      </header>

      <form className="add-form" onSubmit={addTodo}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="想做的事…"
          maxLength={200}
          aria-label="新的待辦項目"
        />
        <button type="submit" disabled={!title.trim() || adding}>
          {adding ? "新增中…" : "新增"}
        </button>
      </form>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="empty">載入中…</p>
      ) : visible.length === 0 ? (
        <p className="empty">
          {todos.length === 0 ? "目前沒有待辦事項，加一筆吧！" : "這個分類沒有項目"}
        </p>
      ) : (
        <ul className="todo-list">
          {visible.map((todo) => (
            <li key={todo.id} className={todo.done ? "todo done" : "todo"}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo)}
                />
                <span className="title">{todo.title}</span>
              </label>
              <button
                className="delete"
                onClick={() => removeTodo(todo.id)}
                aria-label={`刪除「${todo.title}」`}
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="footer">
        <div className="filters" role="tablist">
          {(
            [
              ["all", "全部"],
              ["active", "未完成"],
              ["done", "已完成"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "chip active" : "chip"}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="count">還有 {remaining} 項未完成</span>
      </footer>
    </main>
  );
}

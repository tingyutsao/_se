"use strict";

const listEl = document.querySelector('[data-testid="todo-list"]');
const formEl = document.querySelector('[data-testid="add-form"]');
const inputEl = document.querySelector('[data-testid="todo-input"]');
const errorEl = document.querySelector('[data-testid="error-msg"]');
const countEl = document.querySelector('[data-testid="count"]');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
}

async function fetchJson(res) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body && body.error) || `請求失敗(${res.status})`;
    throw new Error(message);
  }
  return body;
}

let loadSeq = 0;
async function loadTodos() {
  const seq = ++loadSeq;
  const todos = await fetchJson(await fetch("/api/todos"));
  if (seq !== loadSeq) return; // 已有更新的請求,丟棄過期結果
  render(todos);
}

function render(todos) {
  listEl.textContent = "";
  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.testid = "todo-item";
    li.dataset.id = todo.id;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = todo.done;
    check.dataset.testid = "todo-check";
    check.addEventListener("change", async () => {
      try {
        clearError();
        await fetchJson(await fetch(`/api/todos/${todo.id}`, { method: "PATCH" }));
        await loadTodos();
      } catch (err) {
        check.checked = !check.checked;
        showError(err.message);
      }
    });

    const title = document.createElement("span");
    title.className = "todo-title" + (todo.done ? " done" : "");
    title.dataset.testid = "todo-title";
    title.textContent = todo.title;

    const del = document.createElement("button");
    del.type = "button";
    del.dataset.testid = "todo-delete";
    del.textContent = "刪除";
    del.addEventListener("click", async () => {
      try {
        clearError();
        await fetchJson(await fetch(`/api/todos/${todo.id}`, { method: "DELETE" }));
        await loadTodos();
      } catch (err) {
        showError(err.message);
      }
    });

    li.append(check, title, del);
    listEl.append(li);
  }

  const doneCount = todos.filter((t) => t.done).length;
  countEl.textContent = todos.length
    ? `共 ${todos.length} 項,完成 ${doneCount} 項`
    : "目前沒有待辦事項 🎉";
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const title = inputEl.value;
  // 同步先清空輸入框,避免連續新增時被前一筆請求的回呼覆蓋掉剛輸入的值
  inputEl.value = "";
  try {
    await fetchJson(
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
    );
    await loadTodos();
    inputEl.focus();
  } catch (err) {
    showError(err.message);
    inputEl.value = title; // 新增失敗時還原輸入內容
  }
});

loadTodos().catch(showError);

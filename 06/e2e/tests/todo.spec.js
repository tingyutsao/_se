// E2E 測試:用 Playwright 開真實頁面(無頭瀏覽器),
// 走「使用者會做的事」:新增、勾選完成、刪除、輸入內容驗證。
import { test, expect } from "@playwright/test";

// 每個測試前,先用 web API 把 server 上現存的待辦全部刪掉,
// 讓每個測試都從乾淨狀態開始。
test.beforeEach(async ({ request }) => {
  const todos = (await request.get("/api/todos")).json();
  for (const todo of await todos) {
    await request.delete(`/api/todos/${todo.id}`);
  }
});

test("一開始頁面顯示空清單", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/待辦/);
  await expect(page.getByTestId("todo-item")).toHaveCount(0);
  await expect(page.getByTestId("count")).toHaveText(/目前沒有待辦/);
});

test("可以新增待辦並顯示在清單上", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("todo-input").fill("寫 e2e 測試");
  await page.getByTestId("add-btn").click();

  const items = page.getByTestId("todo-item");
  await expect(items).toHaveCount(1);
  await expect(items.first().getByTestId("todo-title")).toHaveText("寫 e2e 測試");
  // 新增後輸入框應該被清空
  await expect(page.getByTestId("todo-input")).toHaveValue("");
});

test("新增多筆會依序顯示", async ({ page }) => {
  await page.goto("/");
  for (const title of ["第一項", "第二項", "第三項"]) {
    await page.getByTestId("todo-input").fill(title);
    await page.getByTestId("add-btn").click();
  }
  const titles = page.getByTestId("todo-title");
  await expect(titles).toHaveCount(3);
  await expect(titles.nth(0)).toHaveText("第一項");
  await expect(titles.nth(2)).toHaveText("第三項");
});

test("送出空白標題不會新增,並顯示錯誤訊息", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("add-btn").click(); // 完全沒輸入
  await expect(page.getByTestId("error-msg")).toBeVisible();
  await expect(page.getByTestId("error-msg")).toHaveText(/不可為空/);
  await expect(page.getByTestId("todo-item")).toHaveCount(0);

  await page.getByTestId("todo-input").fill("   "); // 只有空白
  await page.getByTestId("add-btn").click();
  await expect(page.getByTestId("todo-item")).toHaveCount(0);
});

test("勾選核取方塊會加上刪節線,再取消會復原", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("todo-input").fill("勾選我");
  await page.getByTestId("add-btn").click();

  const title = page.getByTestId("todo-title").first();
  await expect(title).not.toHaveClass(/done/);

  await page.getByTestId("todo-check").first().check();
  await expect(title).toHaveClass(/done/);
  await expect(page.getByTestId("count")).toHaveText(/完成 1 項/);

  await page.getByTestId("todo-check").first().uncheck();
  await expect(title).not.toHaveClass(/done/);
});

test("可以刪除待辦", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("todo-input").fill("會被刪除的一項");
  await page.getByTestId("add-btn").click();
  await page.getByTestId("todo-input").fill("留下來的一項");
  await page.getByTestId("add-btn").click();

  await expect(page.getByTestId("todo-item")).toHaveCount(2);

  // 刪掉第一項(「會被刪除的一項」)
  await page.getByTestId("todo-delete").first().click();

  const items = page.getByTestId("todo-item");
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId("todo-title").first()).toHaveText("留下來的一項");
});

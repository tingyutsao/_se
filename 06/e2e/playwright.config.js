// E2E 測試設定:用 webServer 自動起 Rust server(env 帶 PORT)
// 測試跑在無頭瀏覽器(headless)中,直接操作真實的頁面。
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8787",
  },
  webServer: {
    command: "cargo run",
    cwd: "..",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PORT: "8787" },
  },
});

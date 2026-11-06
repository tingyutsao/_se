import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

// vite dev 同時會啟動 Worker（Hono API + D1），本機開發一站完成
export default defineConfig({
  plugins: [react(), cloudflare()],
});

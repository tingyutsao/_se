/**
 * 階段 5：互動式 CLI Agent
 *
 * 執行：
 *   node 05-cli-agent.mjs
 *
 * 指令：
 *   /tools  列出可用工具
 *   /reset  清空對話記憶
 *   /exit   離開
 *
 * 試試：
 *   幫我算 (23*17+9)/5
 *   現在幾點？
 *   讀 sandbox/notes.md，用三點摘要
 *   先算 12*8，再告訴我現在幾點
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createLLM } from "./lib/llm.mjs";
import { createDefaultTools } from "./lib/tools.mjs";
import { runAgent, MaxStepsError } from "./lib/agent.mjs";
import { createTrace } from "./lib/trace.mjs";
import { SYSTEM_PROMPT } from "./lib/prompts.mjs";

const llm = createLLM();
const tools = createDefaultTools();
const trace = createTrace();

let messages = [{ role: "system", content: SYSTEM_PROMPT }];

console.log("=".repeat(58));
console.log(" LLM API -> Agent 互動練習");
console.log(
  ` 模型：${llm.model}${llm.model.startsWith("mock") ? "（離線 Mock，不需金鑰）" : ""}`,
);
console.log(" 指令：/tools  /reset  /exit");
console.log(" 試試：幫我算 (23*17+9)/5");
console.log("       現在幾點？");
console.log("       讀 sandbox/notes.md");
console.log("=".repeat(58));

const rl = readline.createInterface({ input, output });

// 用 async iterator 讀取，EOF（Ctrl+D / 管線結束）時會自然離開迴圈
output.write("\n你 > ");

try {
  for await (const line of rl) {
    const text = line.trim();

    if (text === "/exit" || text === "/quit") break;

    if (text === "/reset") {
      messages = [{ role: "system", content: SYSTEM_PROMPT }];
      console.log("（已清空對話記憶）");
      output.write("\n你 > ");
      continue;
    }

    if (text === "/tools") {
      console.log(`可用工具：${tools.names().join(", ")}`);
      output.write("\n你 > ");
      continue;
    }

    if (!text) {
      output.write("\n你 > ");
      continue;
    }

    try {
      // 先放進暫存陣列，成功後才更新正式 history
      const turnMessages = [...messages, { role: "user", content: text }];

      const result = await runAgent({
        llm,
        tools,
        messages: turnMessages,
        maxSteps: 8,
        onEvent: trace,
      });

      messages = result.messages;
      console.log(`\n助理 > ${result.text}`);
    } catch (err) {
      console.error(`\n[錯誤] ${err.message}`);
      if (err instanceof MaxStepsError) {
        console.error("提示：模型一直要求工具，已強制停止。可以按 /reset 重來。");
      }
    }

    output.write("\n你 > ");
  }
} finally {
  rl.close();
}

console.log("\n再見！");

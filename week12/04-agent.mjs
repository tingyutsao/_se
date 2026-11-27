/**
 * 階段 4：Agent 迴圈
 *
 * 執行：
 *   node 04-agent.mjs
 *   node 04-agent.mjs "先算 12*8，再告訴我現在幾點"
 *   node 04-agent.mjs "讀 sandbox/notes.md，用三點摘要"
 *
 * 和 03 的差別：
 *   03 只處理「一次」工具呼叫。
 *   04 用 while 迴圈重複「LLM -> 工具 -> LLM」，
 *   所以模型可以連續使用多個工具、修正錯誤、分好幾步完成任務。
 *
 * 這就是 Agent。
 */

import { createLLM } from "./lib/llm.mjs";
import { createDefaultTools } from "./lib/tools.mjs";
import { runAgent } from "./lib/agent.mjs";
import { createTrace } from "./lib/trace.mjs";
import { SYSTEM_PROMPT } from "./lib/prompts.mjs";

const question =
  process.argv.slice(2).join(" ") || "先幫我算 12 * 8，再告訴我現在幾點。";

const llm = createLLM();
const tools = createDefaultTools();
const trace = createTrace();

console.log(`模型：${llm.model}`);
console.log(`問題：${question}`);

try {
  const result = await runAgent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
    maxSteps: 8,
    onEvent: trace,
  });

  console.log("\n=== 最終回答 ===");
  console.log(result.text);
  console.log(
    `\n（總共呼叫 LLM ${result.steps} 次，history 最後有 ${result.messages.length} 則訊息）`,
  );
} catch (err) {
  console.error(`\n[失敗] ${err.message}`);
  process.exitCode = 1;
}

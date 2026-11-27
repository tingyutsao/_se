/**
 * 階段 3：Tool Calling（最重要的一步）
 *
 * 執行：
 *   node 03-tools.mjs
 *   node 03-tools.mjs "現在幾點？"
 *   node 03-tools.mjs "讀 sandbox/notes.md"
 *
 * 請注意：模型「沒有」執行任何工具。
 * 它只是回傳 tool_calls，告訴你的程式：
 *   「我想呼叫 calculator，參數是 {"expression":"..."}」
 * 真正執行的是下面這段 await tools.execute(...)。
 */

import { createLLM } from "./lib/llm.mjs";
import { createDefaultTools } from "./lib/tools.mjs";

const question = process.argv.slice(2).join(" ") || "幫我算 (23 * 17 + 9) / 5";
const llm = createLLM();
const tools = createDefaultTools();

console.log(`模型：${llm.model}`);
console.log(`問題：${question}`);

const messages = [
  {
    role: "system",
    content:
      "你是助理。需要計算、查時間或讀檔案時，請呼叫工具，不要自己心算或編造。",
  },
  { role: "user", content: question },
];

/* ---------- 第一次呼叫：模型可能要求使用工具 ---------- */
const first = await llm.chat({
  messages,
  tools: tools.specs(),
});

messages.push({
  role: "assistant",
  content: first.message.content ?? "",
  ...(first.message.tool_calls?.length
    ? { tool_calls: first.message.tool_calls }
    : {}),
});

console.log("\n=== 第一次 LLM 回應 ===");
console.log(JSON.stringify(first.message, null, 2));

if (!first.message.tool_calls?.length) {
  console.log("\n模型沒有呼叫工具，直接回答：");
  console.log(first.message.content);
} else {
  /* ---------- 你的程式執行工具 ---------- */
  for (const call of first.message.tool_calls) {
    console.log(`\n=== 你的程式執行工具：${call.function.name} ===`);
    console.log(`模型給的參數：${call.function.arguments}`);

    const outcome = await tools.execute(call.function.name, call.function.arguments);
    console.log("工具回傳：", outcome);

    // 把工具結果用 role:"tool" 塞回 messages，並用 tool_call_id 對應
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(outcome),
    });
  }

  /* ---------- 第二次呼叫：模型看到工具結果，給最終答案 ---------- */
  const second = await llm.chat({
    messages,
    tools: tools.specs(),
  });

  console.log("\n=== 第二次 LLM 回應（模型已看到工具結果）===");
  if (second.message.tool_calls?.length) {
    console.log("（模型還想呼叫更多工具；這種多步流程就需要階段 4 的迴圈。）");
  } else {
    console.log(second.message.content);
  }
}

/*
 * 完整協議（OpenAI 格式）：
 *
 * 1. 你送：
 *    {
 *      messages: [...],
 *      tools: [{
 *        type: "function",
 *        function: {
 *          name: "calculator",
 *          description: "...",
 *          parameters: { type: "object", properties: {...}, required: [...] }
 *        }
 *      }]
 *    }
 *
 * 2. 模型回：
 *    {
 *      role: "assistant",
 *      content: null,
 *      tool_calls: [{
 *        id: "call_abc",
 *        type: "function",
 *        function: { name: "calculator", arguments: "{\"expression\":\"1+1\"}" }
 *      }]
 *    }
 *
 * 3. 你送：
 *    { role: "tool", tool_call_id: "call_abc", content: "{\"ok\":true,...}" }
 *
 * 4. 模型回最終答案。
 */

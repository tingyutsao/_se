/**
 * 階段 1：最小 LLM API 呼叫
 *
 * 執行：
 *   node 01-chat.mjs
 *   node 01-chat.mjs "用一句話解釋什麼是 HTTP"
 *
 * 觀察重點：
 *   1. 你送出的是 messages 陣列
 *   2. 模型回傳的是一則 assistant message
 *   3. API 本身不保存任何狀態，下一次呼叫要自己再送一次歷史
 */

import { createLLM } from "./lib/llm.mjs";

const prompt = process.argv.slice(2).join(" ") || "用三句話解釋什麼是 LLM API。";
const llm = createLLM();

console.log(`模型：${llm.model}`);
console.log(`問題：${prompt}\n`);

const response = await llm.chat({
  messages: [
    {
      role: "system",
      content: "你是擅長用簡單例子解釋技術的老師，請用繁體中文回答。",
    },
    {
      role: "user",
      content: prompt,
    },
  ],
});

console.log("=== 模型回答 ===");
console.log(response.message.content);

console.log("\n=== 這次呼叫的用量 ===");
console.log(response.usage ?? "（供應商沒有回傳 usage）");
console.log(`finish_reason: ${response.finishReason ?? "unknown"}`);

/*
 * 背後實際送出的 HTTP request 長這樣：
 *
 * POST https://api.openai.com/v1/chat/completions
 * Authorization: Bearer sk-...
 * Content-Type: application/json
 *
 * {
 *   "model": "gpt-4o-mini",
 *   "temperature": 0.2,
 *   "messages": [
 *     { "role": "system", "content": "你是..." },
 *     { "role": "user",   "content": "..." }
 *   ]
 * }
 *
 * 回來的 JSON：
 *
 * {
 *   "choices": [{
 *     "message": { "role": "assistant", "content": "..." },
 *     "finish_reason": "stop"
 *   }],
 *   "usage": { "prompt_tokens": 30, "completion_tokens": 80, "total_tokens": 110 }
 * }
 */

/**
 * 階段 2：對話記憶
 *
 * 執行：
 *   node 02-history.mjs
 *   node 02-history.mjs "我叫小明" "我叫什麼名字？"
 *
 * 觀察重點：
 *   模型沒有記憶。它之所以能回答「我叫什麼名字」，
 *   是因為你的程式把前面的 user / assistant 訊息一起送進去。
 *
 * 但 history 不能無限成長，否則會：
 *   1. 超過 context window
 *   2. 花更多 token 與延遲
 *   所以需要裁剪或摘要。
 */

import { createLLM } from "./lib/llm.mjs";

const defaultTurns = [
  "我叫庭瑜，我正在學怎麼做 AI Agent。",
  "我剛剛說我叫什麼名字？",
  "用一個比喻說明 LLM API 和 Agent 的差別。",
];

const turns = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTurns;
const llm = createLLM();

const messages = [
  {
    role: "system",
    content: "你是繁體中文助理。回答簡潔，不要重複使用者說過的話。",
  },
];

console.log(`模型：${llm.model}`);

for (const turn of turns) {
  messages.push({ role: "user", content: turn });

  const response = await llm.chat({ messages });
  const reply = response.message.content ?? "";
  messages.push({ role: "assistant", content: reply });

  console.log(`\n你 > ${turn}`);
  console.log(`助理 > ${reply}`);
  console.log(
    `[history] ${messages.length} 則訊息，約 ${JSON.stringify(messages).length} 字元`,
  );
}

console.log("\n=== 最後實際送給模型的完整 messages ===");
console.log(JSON.stringify(messages, null, 2));

// 示範：用「字元數」粗估 token，保留 system + 最近幾則訊息
const trimmed = trimHistory(messages, 350);
console.log("\n=== 裁剪後（模擬 context 快滿了）===");
console.log(
  `原始 ${JSON.stringify(messages).length} 字元 -> 裁剪後 ${JSON.stringify(trimmed).length} 字元`,
);
console.log(JSON.stringify(trimmed, null, 2));

if (trimmed.length < messages.length) {
  console.log(
    "\n（注意：較早的對話被裁掉了。重要資訊應放進 system prompt 或長期記憶，不要只依賴 history。）",
  );
}

/**
 * 按「完整的一輪」裁剪：每一輪從 user 訊息開始，
 * 後面帶著的 assistant / tool 訊息會一起保留。
 * 這樣才不會把 assistant(tool_calls) 和 role:"tool" 的配對切斷。
 */
function trimHistory(history, maxChars = 4000) {
  const systemMessages = history.filter((message) => message.role === "system");
  const conversation = history.filter((message) => message.role !== "system");

  // 切成一輪一輪：遇到 user 就開新的一輪
  const turns = [];
  for (const message of conversation) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([]);
    }
    turns.at(-1).push(message);
  }

  let used = systemMessages.reduce((sum, message) => sum + charCount(message), 0);
  const kept = [];

  // 從最新的一輪往前放，直到超過預算
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const cost = turns[i].reduce((sum, message) => sum + charCount(message), 0);
    if (used + cost > maxChars) break;
    kept.unshift(...turns[i]);
    used += cost;
  }

  return [...systemMessages, ...kept];
}

function charCount(message) {
  return JSON.stringify(message).length;
}

import test from "node:test";
import assert from "node:assert/strict";

import { calculate, createDefaultTools } from "../lib/tools.mjs";
import { runAgent, MaxStepsError } from "../lib/agent.mjs";
import { MockLLM } from "../lib/llm.mjs";

test("calculator 遵守運算優先序", () => {
  assert.equal(calculate("(23 * 17 + 9) / 5"), 80);
  assert.equal(calculate("2 + 3 * 4"), 14);
  assert.equal(calculate("-2 * (3 + 4)"), -14);
  assert.equal(calculate("10 % 3"), 1);
});

test("calculator 拒絕非數學輸入與除以零", () => {
  assert.throws(() => calculate("process.exit()"), /只能包含/);
  assert.throws(() => calculate("1 / 0"), /除以 0/);
  assert.throws(() => calculate("(1 + 2"), /括號沒有配對/);
});

test("read_file 不能跳出 sandbox", async () => {
  const tools = createDefaultTools();
  const outcome = await tools.execute(
    "read_file",
    JSON.stringify({ path: "../README.md" }),
  );

  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /sandbox/);
});

test("read_file 可以讀 sandbox 內的檔案", async () => {
  const tools = createDefaultTools();

  for (const filePath of ["notes.md", "sandbox/notes.md", "./sandbox/notes.md"]) {
    const outcome = await tools.execute(
      "read_file",
      JSON.stringify({ path: filePath }),
    );

    assert.equal(outcome.ok, true, `${filePath} 應該可以讀取`);
    assert.match(outcome.result.content, /Agent/);
  }
});

test("工具參數缺少必填欄位時回傳錯誤，而不是丟例外", async () => {
  const tools = createDefaultTools();
  const outcome = await tools.execute("calculator", "{}");

  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /缺少必填參數/);
});

test("agent 會呼叫工具並把結果變成最終回答", async () => {
  const tools = createDefaultTools();
  const llm = new MockLLM();

  const result = await runAgent({
    llm,
    tools,
    systemPrompt: "你是助理",
    messages: [{ role: "user", content: "幫我算 (23 * 17 + 9) / 5" }],
  });

  assert.equal(result.steps, 2);
  assert.match(result.text, /80/);
  assert.ok(result.messages.some((message) => message.role === "tool"));
});

test("agent 超過 maxSteps 會停止", async () => {
  const tools = createDefaultTools();

  const loopingLLM = {
    async chat() {
      return {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_loop",
              type: "function",
              function: { name: "calculator", arguments: '{"expression":"1+1"}' },
            },
          ],
        },
        usage: null,
      };
    },
  };

  await assert.rejects(
    () =>
      runAgent({
        llm: loopingLLM,
        tools,
        messages: [{ role: "user", content: "loop" }],
        maxSteps: 3,
      }),
    MaxStepsError,
  );
});

test("MockLLM 會依問題同時要求多個工具", async () => {
  const tools = createDefaultTools();
  const llm = new MockLLM();

  const response = await llm.chat({
    messages: [{ role: "user", content: "先算 12 * 8，再告訴我現在幾點" }],
    tools: tools.specs(),
  });

  const names = response.message.tool_calls.map((call) => call.function.name);
  assert.deepEqual(names, ["calculator", "get_current_time"]);
});

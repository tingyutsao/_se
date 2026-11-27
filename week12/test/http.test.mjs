import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

import { OpenAICompatibleLLM } from "../lib/llm.mjs";
import { createDefaultTools } from "../lib/tools.mjs";
import { runAgent } from "../lib/agent.mjs";

/**
 * 啟動一個本機的假 OpenAI 伺服器，跑完測試後關閉。
 * 這樣不需要真的 API 金鑰，也能驗證 HTTP request / response 格式。
 */
async function withFakeOpenAI(handler, fn) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

test("OpenAICompatibleLLM 送出正確的請求並解析 tool_calls", async () => {
  let received;

  await withFakeOpenAI(
    async (req, res) => {
      received = {
        url: req.url,
        authorization: req.headers.authorization,
        body: await readJsonBody(req),
      };

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "calculator",
                      arguments: '{"expression":"1+1"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    },
    async (baseUrl) => {
      const llm = new OpenAICompatibleLLM({
        apiKey: "test-key",
        baseUrl,
        model: "fake-model",
      });

      const response = await llm.chat({
        messages: [{ role: "user", content: "1+1" }],
        tools: createDefaultTools().specs(),
      });

      assert.equal(response.message.tool_calls[0].function.name, "calculator");
      assert.equal(response.usage.total_tokens, 15);
    },
  );

  assert.equal(received.url, "/v1/chat/completions");
  assert.equal(received.authorization, "Bearer test-key");
  assert.equal(received.body.model, "fake-model");
  assert.ok(received.body.tools.length >= 4);
});

test("runAgent 能透過真實 HTTP 協議完成工具呼叫", async () => {
  let callCount = 0;

  await withFakeOpenAI(
    async (req, res) => {
      const body = await readJsonBody(req);
      callCount += 1;

      const last = body.messages.at(-1);
      let message;
      let finishReason;

      if (last.role === "tool") {
        const toolResult = JSON.parse(last.content);
        message = {
          role: "assistant",
          content: `答案是 ${toolResult.result.value}`,
        };
        finishReason = "stop";
      } else {
        message = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_math",
              type: "function",
              function: {
                name: "calculator",
                arguments: '{"expression":"(23*17+9)/5"}',
              },
            },
          ],
        };
        finishReason = "tool_calls";
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message, finish_reason: finishReason }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    },
    async (baseUrl) => {
      const llm = new OpenAICompatibleLLM({
        apiKey: "test-key",
        baseUrl,
        model: "fake-model",
      });

      const result = await runAgent({
        llm,
        tools: createDefaultTools(),
        messages: [{ role: "user", content: "算 (23*17+9)/5" }],
      });

      assert.equal(result.text, "答案是 80");
      assert.equal(result.steps, 2);
    },
  );

  assert.equal(callCount, 2);
});

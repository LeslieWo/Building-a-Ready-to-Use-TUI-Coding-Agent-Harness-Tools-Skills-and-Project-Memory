import { test, expect } from "bun:test";
import { z } from "zod";
import { OpenAIProvider } from "../src/agent/providers/openai";
import type { ModelRequest, ProviderEvent } from "../src/contracts";
const request: ModelRequest = {
  model: "fixture",
  instructions: "test",
  messages: [{ role: "user", content: "hello" }],
  tools: [
    {
      name: "read",
      description: "Read",
      inputSchema: z.object({ path: z.string() }),
    },
  ],
  maxOutputTokens: 200,
  temperature: 0,
  signal: new AbortController().signal,
};
function response(chunks: unknown[]) {
  return new Response(
    chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
      "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
function chunk(delta: unknown, finish_reason: string | null = null) {
  return {
    id: "test",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture",
    choices: [{ index: 0, delta, finish_reason }],
  };
}
async function collect(provider: OpenAIProvider, req = request) {
  const events: ProviderEvent[] = [];
  for await (const e of provider.stream(req)) events.push(e);
  return events;
}
test("official SDK normalizes fragmented tool calls and trailing usage", async () => {
  let body: Record<string, unknown> = {};
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    baseURL: "https://fixture.invalid/v1",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return response([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "c1",
              type: "function",
              function: { name: "read", arguments: '{"pa' },
            },
          ],
        }),
        chunk({
          tool_calls: [{ index: 0, function: { arguments: 'th":"x"}' } }],
        }),
        chunk({}, "tool_calls"),
        {
          choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
        },
      ]);
    },
  });
  expect(await collect(provider)).toEqual([
    {
      type: "tool_call",
      call: { id: "c1", name: "read", arguments: { path: "x" } },
    },
    { type: "usage", inputTokens: 12, outputTokens: 5 },
    { type: "finish", reason: "tool_calls" },
  ]);
  expect(body.stream).toBe(true);
  expect(body.max_tokens).toBe(200);
});
test("malformed tool JSON never becomes an executable call", async () => {
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    fetch: async () =>
      response([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "c1",
              type: "function",
              function: { name: "read", arguments: "{" },
            },
          ],
        }),
        chunk({}, "tool_calls"),
      ]),
  });
  await expect(collect(provider)).rejects.toThrow("invalid_tool_json");
});
test("HTTP errors are not silently retried", async () => {
  let requests = 0;
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    fetch: async () => {
      requests++;
      return new Response('{"error":{"message":"fixture"}}', {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  await expect(collect(provider)).rejects.toThrow();
  expect(requests).toBe(1);
});
test("truncated response signals length without executing partial arguments", async () => {
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    fetch: async () =>
      response([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "c1",
              type: "function",
              function: { name: "read", arguments: "{" },
            },
          ],
        }),
        chunk({}, "length"),
      ]),
  });
  expect(await collect(provider)).toEqual([
    { type: "finish", reason: "length" },
  ]);
});
test("missing finish marker fails closed", async () => {
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    fetch: async () => response([chunk({ content: "incomplete" })]),
  });
  await expect(collect(provider)).rejects.toThrow("missing_finish");
});
test("pre-aborted requests do not contact the endpoint", async () => {
  let calls = 0;
  const provider = new OpenAIProvider({
    apiKey: "fixture",
    fetch: async () => {
      calls++;
      return response([]);
    },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    collect(provider, { ...request, signal: controller.signal }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

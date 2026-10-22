import { test, expect } from "bun:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  runAgent,
  OpenAIProvider,
  JsonMemoryStore,
  type AgentEvent,
} from "../src/index";

test("SDK -> runtime -> file -> SDK integrates with scoped project facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-integration-"));
  try {
    const marker = randomUUID();
    await writeFile(join(root, "fixture.txt"), marker);
    const memory = new JsonMemoryStore(join(root, "app-data"));
    const scope = {
      projectId: "p",
      revision: "rev",
      baselineId: "orientation",
      trialId: "1",
    };
    await memory.upsert(
      { ...scope, trialId: "baseline" },
      {
        id: "command",
        content: "Run bun test",
        source: "package.json",
        sourceRevision: "rev",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
    );
    let requests = 0;
    const events: AgentEvent[] = [];
    const provider = new OpenAIProvider({
      apiKey: "fixture-only",
      baseURL: "https://fixture.invalid/v1",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        requests++;
        expect(body.messages[0].content).toContain("Run bun test");
        const delta =
          requests === 1
            ? {
                tool_calls: [
                  {
                    index: 0,
                    id: "read-1",
                    type: "function",
                    function: { name: "read_fixture", arguments: "{}" },
                  },
                ],
              }
            : { content: marker };
        if (requests === 2) {
          expect(body.messages.at(-1).role).toBe("tool");
          expect(body.messages.at(-1).tool_call_id).toBe("read-1");
          expect(body.messages.at(-1).content).toContain(marker);
        }
        const chunks = [
          { choices: [{ index: 0, delta, finish_reason: null }] },
          {
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: requests === 1 ? "tool_calls" : "stop",
              },
            ],
          },
          { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } },
        ];
        return new Response(
          chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
            "data: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });
    const result = await runAgent(
      {
        runId: "integration",
        sessionId: "integration",
        projectId: "p",
        workspace: root,
        task: "Read fixture",
        model: "fixture",
        memory: scope,
      },
      {
        provider,
        memory,
        events: {
          emit: async (e) => {
            events.push(e);
          },
        },
        tools: {
          describe: () => [
            {
              name: "read_fixture",
              description: "Read test file",
              inputSchema: z.object({}).strict(),
            },
          ],
          execute: async (call) => ({
            callId: call.id,
            status: "success",
            output: await readFile(join(root, "fixture.txt"), "utf8"),
            truncated: false,
          }),
        },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.text).toBe(marker);
    expect(requests).toBe(2);
    expect(result.checkpoint.tokens).toBe(240);
    expect(result.checkpoint.usageEstimated).toBe(false);
    expect(events.filter((e) => e.type === "model_usage")).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

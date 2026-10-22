import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { runAgent } from "../src/agent/runtime";
import type {
  AgentEvent,
  Dependencies,
  ModelRequest,
  ProviderEvent,
  ToolRegistry,
} from "../src/contracts";
export const config = {
  runId: "r1",
  sessionId: "s1",
  projectId: "p1",
  workspace: "/tmp/fixture",
  task: "Read the marker",
  model: "fixture",
};
function setup(turns: ProviderEvent[][]) {
  const events: AgentEvent[] = [];
  const requests: ModelRequest[] = [];
  const executed: string[] = [];
  const tools: ToolRegistry = {
    describe: () => [
      {
        name: "read",
        description: "Read fixture",
        inputSchema: z.object({ path: z.string() }).strict(),
      },
    ],
    execute: async (call) => {
      executed.push(call.id);
      return {
        callId: call.id,
        status: "success",
        output: "MARKER=42",
        truncated: false,
      };
    },
  };
  const deps: Dependencies = {
    events: {
      emit: async (e) => {
        events.push(e);
      },
    },
    tools,
    provider: {
      async *stream(request) {
        requests.push(request);
        yield* turns.shift() ?? [{ type: "finish", reason: "stop" }];
      },
    },
  };
  return { deps, events, requests, executed };
}
const call = { id: "c1", name: "read", arguments: { path: "fixture.txt" } };
const toolTurn: ProviderEvent[] = [
  { type: "tool_call", call },
  { type: "finish", reason: "tool_calls" },
];
describe("agent runtime", () => {
  test("roundtrip pairs tool result and persists intent before execution", async () => {
    const f = setup([
      toolTurn,
      [
        { type: "text", text: "42" },
        { type: "finish", reason: "stop" },
      ],
    ]);
    const execute = f.deps.tools.execute;
    f.deps.tools.execute = async (c, ctx) => {
      expect(f.events.at(-1)?.type).toBe("tool_started");
      expect(
        f.events.some(
          (e) =>
            e.type === "checkpoint" && e.checkpoint.pendingCalls.length === 1,
        ),
      ).toBe(true);
      return execute(c, ctx);
    };
    const result = await runAgent(config, f.deps);
    expect(result.status).toBe("completed");
    expect(result.text).toBe("42");
    expect(f.executed).toEqual(["c1"]);
    expect(f.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      result: { callId: "c1", output: "MARKER=42" },
    });
    expect(f.events.filter((e) => e.type === "terminal")).toHaveLength(1);
    expect(f.events.map((e) => e.sequence)).toEqual(
      f.events.map((_, i) => i + 1),
    );
  });
  test("invalid arguments become observations without executing", async () => {
    const f = setup([
      [
        { type: "tool_call", call: { ...call, arguments: { path: 3 } } },
        { type: "finish", reason: "tool_calls" },
      ],
    ]);
    expect((await runAgent(config, f.deps)).status).toBe("completed");
    expect(f.executed).toHaveLength(0);
    expect(f.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      result: { status: "error" },
    });
  });
  test("step limit prevents another model turn", async () => {
    const f = setup([toolTurn]);
    expect(
      (await runAgent({ ...config, limits: { maxTurns: 1 } }, f.deps)).status,
    ).toBe("budget_exhausted");
    expect(f.requests).toHaveLength(1);
  });
  test("zero tool budget prevents side effects", async () => {
    const f = setup([toolTurn]);
    expect(
      (await runAgent({ ...config, limits: { maxToolCalls: 0 } }, f.deps))
        .status,
    ).toBe("budget_exhausted");
    expect(f.executed).toHaveLength(0);
  });
  test("sink failure before execution stops all side effects", async () => {
    const f = setup([toolTurn]);
    f.deps.events.emit = async (e) => {
      if (e.type === "tool_started") throw new Error("disk full");
    };
    await expect(runAgent(config, f.deps)).rejects.toThrow("disk full");
    expect(f.executed).toHaveLength(0);
  });
  test("cancelled provider produces one terminal event", async () => {
    const f = setup([]);
    const controller = new AbortController();
    f.deps.provider = {
      async *stream(req) {
        controller.abort();
        req.signal.throwIfAborted();
        yield { type: "finish", reason: "stop" };
      },
    };
    expect(
      (await runAgent(config, f.deps, { signal: controller.signal })).status,
    ).toBe("cancelled");
    expect(f.events.filter((e) => e.type === "terminal")).toHaveLength(1);
  });
  test("resume rejects unresolved side effects", async () => {
    const f = setup([toolTurn]);
    const done = await runAgent(config, f.deps);
    await expect(
      runAgent(config, f.deps, {
        checkpoint: { ...done.checkpoint, pendingCalls: [call] },
      }),
    ).rejects.toThrow("unresolved");
  });
  test("memory disabled never reads the store", async () => {
    const f = setup([]);
    f.deps.memory = {
      list: async () => {
        throw new Error("must not read");
      },
      upsert: async () => {},
    };
    expect((await runAgent(config, f.deps)).status).toBe("completed");
  });
  test("tool exception is returned to the model without leaking raw error", async () => {
    const f = setup([toolTurn]);
    f.deps.tools.execute = async () => {
      throw new Error("SECRET_TOKEN");
    };
    await runAgent(config, f.deps);
    expect(JSON.stringify(f.events)).not.toContain("SECRET_TOKEN");
    expect(f.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      result: { status: "error" },
    });
  });
});
test("provider usage is emitted as a model_usage event and counted", async () => {
  const f = setup([
    [
      { type: "usage", inputTokens: 10, outputTokens: 3 },
      { type: "finish", reason: "stop" },
    ],
  ]);
  const r = await runAgent(config, f.deps);
  expect(r.checkpoint.tokens).toBe(13);
  expect(f.events.find((e) => e.type === "model_usage")).toMatchObject({
    inputTokens: 10,
    outputTokens: 3,
    estimated: false,
  });
});
test("a completed run cannot silently resume and execute again", async () => {
  const f = setup([]);
  const r = await runAgent(config, f.deps);
  await expect(
    runAgent(config, f.deps, { checkpoint: r.checkpoint }),
  ).rejects.toThrow("terminal");
});
test("checkpoint after a completed tool resumes without replay", async () => {
  const f = setup([toolTurn]);
  await runAgent(config, f.deps);
  const saved = [...f.events]
    .reverse()
    .find(
      (e) =>
        e.type === "checkpoint" &&
        e.checkpoint.phase === "ready" &&
        e.checkpoint.messages.at(-1)?.role === "tool" &&
        e.checkpoint.pendingCalls.length === 0,
    );
  expect(saved?.type).toBe("checkpoint");
  if (saved?.type !== "checkpoint") throw new Error("missing checkpoint");
  const next = setup([
    [
      { type: "text", text: "restored" },
      { type: "finish", reason: "stop" },
    ],
  ]);
  expect(
    (
      await runAgent({ ...config, runId: "r2" }, next.deps, {
        checkpoint: saved.checkpoint,
      })
    ).text,
  ).toBe("restored");
  expect(next.executed).toEqual([]);
});
test("approval defaults to deny and emits a paired decision", async () => {
  const f = setup([toolTurn]);
  f.deps.tools.execute = async (c, ctx) => {
    const approved = await ctx.approval.request(
      { callId: c.id, description: "Write fixture" },
      ctx.signal,
    );
    return {
      callId: c.id,
      status: approved ? "success" : "denied",
      output: "decision",
      truncated: false,
    };
  };
  await runAgent(config, f.deps);
  expect(f.events.find((e) => e.type === "approval_decided")).toMatchObject({
    approved: false,
    callId: "c1",
  });
});
test("elapsed deadline aborts a cooperative waiting provider", async () => {
  const f = setup([]);
  f.deps.provider = {
    async *stream(req) {
      await new Promise<void>((_, reject) => {
        req.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
      yield { type: "finish", reason: "stop" };
    },
  };
  const r = await runAgent({ ...config, limits: { maxElapsedMs: 20 } }, f.deps);
  expect(r.status).toBe("budget_exhausted");
  expect(r.reason).toBe("elapsed_limit");
});
test("token limit prevents requesting a model when input cannot fit", async () => {
  const f = setup([]);
  const r = await runAgent({ ...config, limits: { maxTokens: 1 } }, f.deps);
  expect(r.reason).toBe("token_limit");
  expect(f.requests).toHaveLength(0);
});
test("duplicate tool IDs cannot cause repeated execution", async () => {
  const f = setup([toolTurn, toolTurn]);
  expect((await runAgent(config, f.deps)).status).toBe("failed");
  expect(f.executed).toEqual(["c1"]);
});
test("tool output is truncated before it reaches the next model request", async () => {
  const f = setup([toolTurn]);
  await runAgent({ ...config, limits: { maxToolOutputChars: 3 } }, f.deps);
  expect(f.requests[1]?.messages.at(-1)).toMatchObject({
    role: "tool",
    result: { output: "MAR", truncated: true },
  });
});

test("final answer never exposes a resumable checkpoint before terminal persistence", async () => {
  const f = setup([
    [
      { type: "text", text: "done" },
      { type: "finish", reason: "stop" },
    ],
  ]);
  f.deps.events.emit = async (event) => {
    if (event.type === "checkpoint" && event.checkpoint.phase === "terminal")
      throw new Error("terminal disk failure");
    f.events.push(event);
  };
  await expect(runAgent(config, f.deps)).rejects.toThrow(
    "terminal disk failure",
  );
  const unsafe = f.events.filter(
    (e) =>
      e.type === "checkpoint" &&
      e.checkpoint.phase === "ready" &&
      e.checkpoint.messages.at(-1)?.role === "assistant",
  );
  expect(unsafe).toHaveLength(0);
});
test("actual usage above budget cannot be reported as successful completion", async () => {
  const f = setup([
    [
      { type: "usage", inputTokens: 2000, outputTokens: 1 },
      { type: "finish", reason: "stop" },
    ],
  ]);
  const result = await runAgent(
    { ...config, limits: { maxTokens: 1000 } },
    f.deps,
  );
  expect(result.status).toBe("budget_exhausted");
  expect(result.reason).toBe("token_limit");
  expect(result.checkpoint.tokens).toBe(2001);
});
test("completion exactly at the measured token budget remains successful", async () => {
  const f = setup([
    [
      { type: "usage", inputTokens: 999, outputTokens: 1 },
      { type: "finish", reason: "stop" },
    ],
  ]);
  expect(
    (await runAgent({ ...config, limits: { maxTokens: 1000 } }, f.deps)).status,
  ).toBe("completed");
});

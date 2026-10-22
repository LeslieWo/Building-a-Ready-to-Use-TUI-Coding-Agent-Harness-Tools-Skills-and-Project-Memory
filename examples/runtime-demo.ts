import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { runAgent, type ModelProvider, type ToolRegistry } from "../src/index";

// A development fixture, not Joe's production tool registry or a real model.
const workspace = await mkdtemp(join(tmpdir(), "coding-agent-demo-"));
try {
  await writeFile(join(workspace, "marker.txt"), "DEMO_MARKER=42");
  const provider: ModelProvider = {
    async *stream(request) {
      const last = request.messages.at(-1);
      if (last?.role === "tool") {
        yield { type: "text", text: `Observed ${last.result.output}` };
        yield { type: "finish", reason: "stop" };
      } else {
        yield {
          type: "tool_call",
          call: { id: "demo-read", name: "read_marker", arguments: {} },
        };
        yield { type: "finish", reason: "tool_calls" };
      }
    },
  };
  const tools: ToolRegistry = {
    describe: () => [
      {
        name: "read_marker",
        description: "Read the demo fixture only.",
        inputSchema: z.object({}).strict(),
      },
    ],
    async execute(call, context) {
      context.signal.throwIfAborted();
      return {
        callId: call.id,
        status: "success",
        output: await readFile(join(workspace, "marker.txt"), "utf8"),
        truncated: false,
      };
    },
  };
  const result = await runAgent(
    {
      runId: "demo-run",
      sessionId: "demo-session",
      projectId: "demo",
      workspace,
      task: "Read the demo marker.",
      model: "deterministic-fixture",
    },
    {
      provider,
      tools,
      events: {
        async emit(event) {
          if (event.type !== "checkpoint") console.log(JSON.stringify(event));
        },
      },
    },
  );
  if (
    result.status !== "completed" ||
    result.text !== "Observed DEMO_MARKER=42"
  )
    throw new Error("Demo roundtrip failed");
  console.log(
    JSON.stringify({
      result: result.status,
      text: result.text,
      turns: result.checkpoint.turns,
      usageEstimated: result.checkpoint.usageEstimated,
    }),
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}

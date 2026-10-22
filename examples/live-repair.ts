import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import {
  runAgent,
  OpenAIProvider,
  type AgentEvent,
  type ModelProvider,
} from "../src/index";
import { createRepairFixture } from "./support/repair-fixture";
import { verifiedRepairSequence } from "./support/repair-acceptance";

const apiKey = process.env.AGENT_API_KEY;
const model = process.env.AGENT_MODEL;
if (!apiKey || !model)
  throw new Error(
    "Set AGENT_API_KEY and AGENT_MODEL; optionally AGENT_BASE_URL.",
  );
const fixture = await createRepairFixture();
const events: AgentEvent[] = [];
const failures: { name: string; status?: number }[] = [];
const controller = new AbortController();
const cancel = () => controller.abort();
process.on("SIGINT", cancel);
try {
  const before = await fixture.source();
  const initialVisible = await fixture.check(false, controller.signal);
  if (initialVisible.passed)
    throw new Error("Fixture must fail before repair.");
  const adapter = new OpenAIProvider({
    apiKey,
    baseURL: process.env.AGENT_BASE_URL,
  });
  const provider: ModelProvider = {
    async *stream(request) {
      try {
        yield* adapter.stream(request);
      } catch (error) {
        failures.push({
          name: error instanceof Error ? error.name : "UnknownError",
          ...(typeof error === "object" &&
          error &&
          "status" in error &&
          typeof error.status === "number"
            ? { status: error.status }
            : {}),
        });
        throw error;
      }
    },
  };
  const started = new Date().toISOString();
  const result = await runAgent(
    {
      runId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      projectId: "clamp-development-fixture",
      workspace: fixture.workspace,
      model,
      task: "Repair clamp(value, lower, upper) in solution.py. Return value within the inclusive bounds, preserve values already inside, and raise ValueError when lower > upper. Read the source and visible tests, fix the source, then run the tests before reporting completion. Only use the provided fixture tools.",
      instructions:
        "You are a coding assistant working on a disposable development fixture. Inspect the code before changing it. Use replace_source for a minimal correction and verify with run_tests. Do not add imports, network operations, subprocesses or filesystem operations to solution.py.",
      limits: {
        maxTurns: 8,
        maxToolCalls: 12,
        maxElapsedMs: 180000,
        maxTokens: 16000,
        contextTokens: 12000,
        maxOutputTokens: 2048,
      },
    },
    {
      provider,
      tools: fixture.tools,
      approval: { request: async () => true }, // Only the fixed disposable source-file write is authorized.
      events: {
        emit: async (event) => {
          events.push(event);
          if (event.type === "tool_started" || event.type === "terminal")
            console.log(JSON.stringify(event));
        },
      },
    },
    { signal: controller.signal },
  );
  const after = await fixture.source();
  // Independent fixed tests are outside the model's tool-visible workspace.
  const visible = await fixture.check(false, new AbortController().signal);
  const heldOut = await fixture.check(true, new AbortController().signal);
  const successful = new Set(
    events
      .filter((e) => e.type === "tool_result" && e.result.status === "success")
      .map((e) => (e.type === "tool_result" ? e.result.callId : "")),
  );
  const used = events
    .filter((e) => e.type === "tool_started" && successful.has(e.call.id))
    .map((e) => (e.type === "tool_started" ? e.call.name : ""));
  const passed =
    result.status === "completed" &&
    before !== after &&
    visible.passed &&
    heldOut.passed &&
    verifiedRepairSequence(events);
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const summary = {
    schemaVersion: 1,
    scenario: "development-clamp-repair",
    started,
    model,
    passed,
    status: result.status,
    reason: result.reason,
    modelTurns: result.checkpoint.turns,
    toolCalls: result.checkpoint.toolCalls,
    totalTokens: result.checkpoint.tokens,
    usageEstimated: result.checkpoint.usageEstimated,
    elapsedMs: result.checkpoint.elapsedMs,
    sourceBeforeSha256: hash(before),
    sourceAfterSha256: hash(after),
    initialVisiblePassed: initialVisible.passed,
    visiblePassed: visible.passed,
    heldOutPassed: heldOut.passed,
    successfulTools: used,
    providerFailures: failures,
    limitations: [
      "Single development task, not the frozen benchmark.",
      "Fixture tools, not the production team registry.",
      "Fixed test commands and cleared child environment are not an OS sandbox.",
      "Event sink is in-memory; no persistence or TUI integration claim.",
    ],
  };
  const directory = resolve(
    "reports",
    `live-repair-${started.replaceAll(":", "-")}`,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  await writeFile(
    join(directory, "events.json"),
    JSON.stringify(events, null, 2).replaceAll(
      fixture.workspace,
      "$FIXTURE_WORKSPACE",
    ) + "\n",
  );
  await writeFile(join(directory, "before.py"), before);
  await writeFile(join(directory, "after.py"), after);
  await writeFile(
    join(directory, "verification.json"),
    JSON.stringify({ initialVisible, visible, heldOut }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...summary, report: directory }));
  if (!passed) process.exitCode = 1;
} finally {
  process.off("SIGINT", cancel);
  await fixture.cleanup();
}

import { runAgent, OpenAIProvider } from "../src/index";

const apiKey = process.env.AGENT_API_KEY;
const model = process.env.AGENT_MODEL;
if (!apiKey || !model) {
  console.error(
    "Set AGENT_API_KEY and AGENT_MODEL; optionally set AGENT_BASE_URL.",
  );
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  try {
    const result = await runAgent(
      {
        runId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        projectId: "live-smoke",
        workspace: process.cwd(),
        model,
        task: "Reply exactly AGENT_LIVE_SMOKE_OK. Do not use tools.",
        limits: {
          maxTurns: 1,
          maxToolCalls: 0,
          maxElapsedMs: 30000,
          maxOutputTokens: 64,
        },
      },
      {
        provider: new OpenAIProvider({
          apiKey,
          baseURL: process.env.AGENT_BASE_URL,
        }),
        tools: {
          describe: () => [],
          execute: async () => {
            throw new Error("No tools enabled");
          },
        },
        events: { emit: async () => {} },
      },
      { signal: controller.signal },
    );
    console.log(
      JSON.stringify({
        status: result.status,
        reason: result.reason,
        text: result.text,
        tokens: result.checkpoint.tokens,
        usageEstimated: result.checkpoint.usageEstimated,
      }),
    );
    if (
      result.status !== "completed" ||
      result.text.trim() !== "AGENT_LIVE_SMOKE_OK"
    )
      process.exitCode = 1;
  } catch {
    console.error(
      "Live smoke failed. Check endpoint configuration; credentials are not printed.",
    );
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", cancel);
  }
}

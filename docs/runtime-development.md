# Agent runtime: development and teammate integration

Siyuan's first implementation includes the provider adapter, explicit single-agent loop, bounded context and project-fact memory. It does not implement Joe's production tools/MCP/skills or Ni's TUI/session database/evaluation runner. Public exports are in `src/index.ts` and contracts in `src/contracts/index.ts`.

## Run locally

Use Bun 1.3.11 (the locally verified version):

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run lint
bun run format:check
bun run demo
bun run demo:node
```

The demo is network-free. It creates a temporary fixture, runs a deterministic model -> read -> model sequence, checks `Observed DEMO_MARKER=42`, then removes only its temporary directory. It is a development example, not a production tool executor. `demo:node` builds the example for Node and runs the same assertions there. `dist/` is ignored. Application source uses standard Node/Web APIs; Bun owns development commands and tests.

Dependencies have exact versions in package.json and bun.lock. TypeScript is pinned to 5.9.3 because the installed lint parser does not support TypeScript 7. Bun executing TypeScript is not a substitute for the separate typecheck.

## Calling the runtime

```ts
import { runAgent, OpenAIProvider, JsonMemoryStore } from './src/index';

// registry, durableSink and approvalUI are supplied by the composition layer.
const result = await runAgent({
  runId: crypto.randomUUID(),
  sessionId: session.id,
  projectId: project.id,
  workspace: project.absolutePath,
  task: 'Fix the failing parser test.',
  model: configuredModel,
  memory: {
    projectId: project.id,
    revision: project.revision,
    baselineId: 'orientation-v1',
    trialId: experimentTrialId,
  },
  limits: { maxTurns: 8, maxToolCalls: 20, maxElapsedMs: 120000 },
}, {
  provider: new OpenAIProvider({ apiKey: configuredKey, baseURL: configuredEndpoint }),
  tools: registry,
  events: durableSink,
  approval: approvalUI,
  memory: new JsonMemoryStore(applicationDataDirectory),
}, { signal: cancellationController.signal });
```

This is an integration sketch: session/project/configuration objects belong to Ni's composition layer. The fully runnable example is `examples/runtime-demo.ts`. Omit `memory` from configuration to disable it completely. `skillsEnabled` is passed to Joe's executor; Joe owns loading and its observability. The runtime has no direct dependency on a TUI, MCP server or shell implementation.

## Joe: implement ToolRegistry

- `describe()` returns unique names, descriptions and Zod argument schemas. The provider converts schemas to JSON Schema.
- `execute(call, context)` returns a `ToolResult` with exactly the original call ID, a status, bounded text and a truncation flag. Runtime argument validation catches unknown tools and malformed inputs; Joe still enforces all filesystem, subprocess and MCP boundaries.
- Check `context.signal`, enforce command timeouts, and terminate/reap owned subprocesses before resolving cancellation. A noncooperative executor can exceed the runtime's deadline; the runtime deliberately does not pretend an outstanding side effect has stopped.
- Use `context.approval.request({callId, description}, context.signal)` before operations requiring consent. Missing approval UI defaults to denial. Runtime emits request/decision events, but executor code is responsible for honoring denial.
- Calls are sequential. No automatic tool retry occurs. Unknown thrown tool errors become generic error observations to avoid copying credentials or stack traces into model context. Return a safe structured error when useful details are available.

## Ni: implement EventSink and restoration

`emit(event)` is async. Events contain version, run/session IDs, event ID, per-run sequence, timestamp and discriminated payload. Persist tool/checkpoint boundaries before resolving; forward events to the UI independently so approvals can be answered while the runtime awaits them. A sink failure rejects the run and stops further side effects: a terminal event cannot be guaranteed on a broken sink.

Checkpoint phases are `ready`, `streaming`, `tools`, and `terminal`. Pass only the latest consistent **ready** checkpoint as `options.checkpoint`. The runtime validates the configuration fingerprint, counters and complete tool-result groups. Only `runId` may differ. Counters and elapsed execution time carry forward; time spent while the application is closed is not charged.

Do not select an older ready checkpoint when newer persisted tool intent exists. Pending calls or streaming/terminal checkpoints are rejected. If execution began but its result is missing, inspect/reconcile actual effects before constructing any new continuation; this release supplies no automatic reconciliation mechanism. Completed tool observations are reused without executing those calls again. A completed session needs a new task/run rather than resuming its terminal checkpoint. The fingerprint detects configuration mismatch; it is not an authenticity signature. Persist checkpoints in trusted application data, not model-editable files.

Session exclusivity is enforced within one process. Ni must enforce cross-process session ownership. Event storage, disk flush policy, UI reconstruction and evaluation exports remain Ni's work.

## Context, budget and usage semantics

Context keeps the initial task, instructions/facts and the latest complete message group. Older assistant/tool groups are trimmed together; orphan results and duplicate call IDs are rejected. If the minimum valid context cannot fit, the run stops explicitly. Summarization is not implemented.

Budgets constrain model turns, tool attempts, elapsed active time, total scheduling tokens, requested output tokens, context estimate and tool output characters. Schema sizes count toward estimated input. Provider-reported usage is retained when available; missing usage uses a UTF-8-byte estimate and marks `usageEstimated`. Estimates are not tokenization or billing guarantees. A provider may report an actual token total above the estimate; already billed usage cannot be undone. Interrupted/failed streams may not report final usage, and their terminal counters can undercount provider charges. Do not label them zero-cost trials. No automatic provider retries are enabled in this version.

The adapter supports the Chat Completions streaming protocol, including fragmented function arguments, finish reasons and trailing usage. A complete valid tool call is required before execution. Length-limited calls cannot execute partial arguments. Other model APIs, OAuth, image/audio inputs and endpoint-specific parameter differences require additional adapters or capability work.

## Project facts and experiment isolation

Facts contain ID, content, source, source revision and timestamp. Documents are keyed by a hash of project/revision/baseline/trial identity. `trialId: 'baseline'` is reserved for explicit orientation setup. A trial reads that baseline plus its own overlay; another trial never reads that overlay. Do not write to the baseline after evaluation starts. Runtime only reads facts; promotion or automatic fact extraction is not implemented.

The store checks revision/scope and rejects corrupt or oversized documents. It uses temporary files, file sync and atomic rename, plus a cross-process exclusive lock. Same-instance writes serialize. Contention or a leftover lock fails explicitly; inspect stale locks before recovery. Atomic rename prevents partial JSON visibility but is not a full database transaction or power-loss guarantee. Keep the store in a trusted application-data directory outside the agent workspace. It is not a sandbox against an attacker who can modify that directory.

## Optional real-provider smoke

Set `AGENT_API_KEY`, `AGENT_MODEL` and optionally `AGENT_BASE_URL` in your shell, then run:

```sh
bun run smoke:live
```

This sends a paid-provider request if configured, with no tools and a 30-second limit. It prints status, reply and usage, never the key. A configured Z.AI/GLM-5.3 no-tools smoke and a separate live code-repair acceptance have now passed; they are not part of the offline test suite. See [live acceptance evidence](validation/live-repair-2026-10-21/README.md). Fixture success does not certify a particular live service, OAuth flow, production tool boundary or TUI integration.

Reference implementations: [official OpenAI JavaScript SDK](https://github.com/openai/openai-node), [Zod JSON schemas](https://zod.dev/json-schema), [Bun TypeScript documentation](https://bun.sh/docs/runtime/typescript). OpenCode architectural research is documented separately under `docs/research/opencode`; this implementation is independently written.

## Live code repair and evaluation preparation

`bun run acceptance:live` uses four narrowly scoped development tools to read and fix a disposable Python fixture, run visible tests, and independently check held-out assertions. It saves local evidence under ignored reports/. The numerical candidate passes a narrow AST policy before test execution; this is not a general-purpose sandbox. See [published evidence](validation/live-repair-2026-10-21/README.md), [four draft evaluation tasks](../eval/tasks/siyuan/README.md), and [draft technical report/demo sequence](report/siyuan-runtime-section.md). Production tool/session integration and formal A/B/C/D trials remain pending.

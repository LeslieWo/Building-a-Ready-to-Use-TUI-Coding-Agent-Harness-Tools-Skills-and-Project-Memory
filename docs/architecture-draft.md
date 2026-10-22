# Architecture and collaboration design: TypeScript and Bun

Status: TypeScript + Bun direction approved by the project owner on October 21, 2026; detailed shared interfaces remain subject to affected teammate review. No implementation or test results are implied. This design refines the submitted proposal and preserves the ownership in `team-work-plan.md`.

## Decision and alternatives

Use TypeScript with strict type checking and Bun for the runtime, package management and tests. Use Zod for runtime validation and JSON schemas, the official OpenAI JavaScript SDK behind our provider port for the first compatible endpoint, and the official MCP TypeScript SDK for tool-server integration. Use TypeScript's compiler for type checks and ESLint/Prettier for source quality. Pin compatible dependency versions and commit bun.lock during implementation.

OpenTUI with SolidJS is the preferred TUI candidate, conditional on a minimal streaming, input, cancellation and packaging spike led by Ni. The headless runtime must not depend on it. Do not assume Bun's TypeScript execution performs static type checking; run tsc separately.

This supersedes the Python/Textual implementation proposal. TypeScript/Bun reduces translation effort when studying OpenCode and exposes the same language ecosystem. Python/Textual remains a reasonable simpler alternative, but is no longer the selected direction. A mixed Python/TypeScript runtime adds transport and packaging complexity. No comparative performance benchmark has been run: model latency and tool subprocesses may dominate end-to-end time.

The submitted proposal PDF, text and Chinese review artifact remain unchanged historical records. See [ADR 001](decisions/001-typescript-bun.md) for the approved change. Initial benchmark target repositories may still be Python; the implementation language and task language are independent.

Implement the loop directly instead of delegating orchestration to an agent framework. Learn from OpenCode's separation of provider, loop, tools, and events; do not transplant its complete application or claim our implementation is OpenCode. Attribute any reused source under its license.

## Scope and ownership

Use a single TypeScript package. The initial target is a single agent working on small Python repositories. Multiple agents are optional future work.

| Owner | Proposed paths | Responsibility |
| --- | --- | --- |
| Siyuan | `src/agent/`, `src/memory/` | Provider adapter, loop, budgets, active context, project facts |
| Joe | `src/tools/`, `src/mcp/`, `src/skills/`, `skills/` | Registry, execution controls, MCP adapter, skill loading and assets |
| Ni | `src/tui/`, `src/session/`, `src/cli.ts`, `eval/` | Interface, composition, session persistence/recovery, evaluation runner |
| Shared | `src/contracts/`, `package.json`, `tsconfig.json`, `bun.lock` | Public types and ports, dependencies, configuration |

Tests mirror module ownership under `tests/`. Shared contract fixtures live under `tests/contracts/`. Each owner can develop against fakes without importing another owner's implementation. Only the CLI/composition layer wires concrete providers, tools, storage, and UI together. The runtime must work without the TUI.

## Public contracts

Define these as TypeScript interfaces, discriminated unions and Zod schemas. Freeze a version-one schema and representative JSON fixtures before parallel integration.

| Contract | Operations / fields | Lead |
| --- | --- | --- |
| RunConfig | schema version, run/session/project/trial IDs, workspace, task, provider/model, sampling, feature flags, budgets, artifact directory | Ni |
| ModelProvider | stream one turn from normalized messages, tool definitions, and generation limits; yield text deltas, complete tool calls, usage, and finish reason | Siyuan |
| ToolRegistry | describe tools; execute a call with its ID, name, arguments, workspace and execution context; return structured result | Joe |
| EventSink | await emit of a versioned event; envelope includes event ID, run/session ID, sequence, timestamp, type, payload | Siyuan; Ni implements persistence |
| ApprovalPort | request decision for a call ID and operation description; return approved or denied, or propagate cancellation | Joe; Ni supplies UI/headless policy |
| MemoryStore | retrieve and upsert scoped project facts with source, timestamp, schema version and baseline snapshot ID | Siyuan |
| Runtime | run from request and injected ports; resume only from a validated checkpoint; return a typed terminal result | Siyuan |

Tool results carry call ID, status (`success`, `error`, `denied`, `timeout`, or `cancelled`), bounded output, error details, truncation marker, and optional artifact/diff references. Provider-specific response objects must not escape the adapter. Tool calls become executable only after their streamed arguments are complete and validated. Native and MCP tools use the same interface.

Event types cover run start, text delta, model usage, tool request/start/result, approval request/decision, skill load, checkpoint, and terminal completion/failure/cancellation/budget exhaustion. Every live run emits one terminal event if the process remains operational; crashes are represented by an unfinished persisted run. All related events share the same tool call ID. Secrets never belong in configuration snapshots or event payloads.

## Control flow

1. Ni validates configuration, creates a session sink and approval handler, and starts the runtime as an asynchronous task with AbortSignal cancellation.
2. Siyuan assembles context from instructions, selected project facts, and valid conversation groups, then calls the provider for one turn.
3. Text and usage events go to the sink. Completed tool calls go through Joe's registry, argument checks, approval flow, and execution controls.
4. Structured observations enter the conversation with matching call IDs. The loop makes the next model request or terminates on completion, cancellation, error, or budget.
5. Ni persists events and independently renders them. UI approval responses resolve pending approval requests without blocking the UI event loop.

Start with sequential tool execution, including when a model requests multiple tools. Joe owns workspace restrictions, subprocess lifecycle, timeout and output limits. Siyuan owns when the next model turn is allowed. Cancellation propagates to pending provider calls and tools; Joe must terminate and reap owned subprocesses before reporting cancellation.

## Persistence and recovery

Ni owns session JSONL event logs and atomic checkpoint files. Siyuan owns an independent atomic JSON project-fact store. Neither module writes the other's files. Runtime artifacts belong in a configurable local application data directory outside evaluation workspaces and are not committed.

Persist a tool execution intent before side effects and its result afterward. Await persistence at these boundaries. A restored intent without a result has an unknown outcome: do not silently replay it. Ni surfaces it for reconciliation, and the runtime refuses automatic continuation until it is resolved. Completed calls are restored as observations rather than executed again. This is not an exactly-once execution guarantee.

Facts contain project identity, content, provenance, source revision/hash where available, and creation/update times. First-version writes are explicit fact records, not unrestricted model-generated memory. A run has one memory writer. Reject stale or mismatched project records. Conversation transcripts and task solutions are not project facts.

## Context, limits, and failures

Configure maximum model turns, tool calls, elapsed time, context size, and token budget. Bound requested output tokens. Provider-reported usage is authoritative when available; estimates are marked as estimates. Missing usage is never recorded as zero. The token budget is a scheduling constraint, not a universal provider billing guarantee.

Trim complete older assistant/tool-result groups, preserving matching tool IDs and the current task. If the minimum valid context cannot fit, stop with an explicit context-limit reason. Defer model-generated summaries until the baseline is working; any later summary calls must count toward usage and evaluation cost.

Tool failures become observations the model may respond to. Do not automatically repeat side-effecting tools. Disable hidden SDK retries; allow at most two bounded transient request retries only before any response content has been exposed. Authentication, malformed responses and exhausted retries produce explicit failure events. An interrupted partial model turn is not a complete checkpoint.

## Evaluation isolation

Memory and skills are independently switchable for configurations A/B/C/D. Each trial begins from a clean repository copy and isolated session state. Memory-enabled trials receive only the frozen project-orientation baseline; trial writes cannot update the baseline or enter another trial. Project identity is explicit rather than inferred solely from a temporary worktree path. Held-out acceptance tests remain outside the agent workspace. Ni exports usage, elapsed time, tool/error counts, outcomes and whether usage was measured or estimated.

## Implementation sequence and acceptance

1. Agree on contracts, ownership, fixtures and stack. Siyuan leads the runtime/event draft; Joe reviews tool ports; Ni reviews run configuration and persistence boundaries.
2. Implement Siyuan's runtime against deterministic fake providers, tools, and sinks. Demonstrate model -> tool -> observation -> model, proper IDs, limits, cancellation, and explicit failures.
3. Add the compatible-provider adapter and an opt-in real-model smoke test with a separate workspace. Verify the chosen endpoint's tool calls and usage behavior; unit tests require no API key or network.
4. Add scoped fact storage and bounded context. Test memory on/off, stale facts, atomic saves, and cross-trial isolation.
5. Integrate Joe's registry and Ni's sink/UI. Verify approvals, interrupted calls, restart without replay, and a small task that edits a fixture repository and runs its tests.
6. Run the four-configuration pilot before expanding the benchmark or adding optional multi-agent features.

Siyuan's first implementation excludes production implementations of Joe's tools and Ni's TUI/session store; test fakes supply those ports. His part is not considered integration-complete until the real modules work together.

## Collaboration rules

Use focused feature branches and small PRs. Each owner maintains implementation and tests for their directories. Shared contract changes require review from affected owners; maintain versioned fixtures to expose incompatible changes. Coordinate dependency and lockfile updates in one PR at a time. Follow the existing review rotation and equal evaluation workload. Repository code, documentation, comments and user-facing text remain English.

## References

- [Submitted proposal](project-proposal.txt)
- [Team work plan](team-work-plan.md)
- [OpenTUI](https://github.com/anomalyco/opentui)
- [Official OpenAI JavaScript SDK](https://github.com/openai/openai-node)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Bun documentation](https://bun.sh/docs)

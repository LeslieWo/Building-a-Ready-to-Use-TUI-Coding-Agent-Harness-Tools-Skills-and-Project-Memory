# Draft report section: agent runtime and project memory

Status: implementation and development acceptance draft. Formal benchmark outcomes remain unmeasured.

## Design and responsibilities

We implement a single-agent coding harness in TypeScript, developed and tested with Bun. The runtime depends on explicit model, tool, approval, memory and event interfaces. This keeps agent orchestration independent of the terminal interface and permits deterministic testing. The core uses Node/Web APIs; a Node-target bundled demo also executes successfully. The implementation follows architectural lessons documented in the OpenCode investigation, but is independently written rather than a recovered or vendored OpenCode implementation.

Each turn assembles bounded context, asks the provider for a streamed response, validates completed tool calls, and dispatches them sequentially. Tool observations retain their original call IDs and become input to the next turn. The runtime stops on final completion, cancellation, errors or configured limits. Unknown errors are converted to safe summaries rather than blindly forwarding provider exceptions or credentials. The SDK does not execute tools or silently retry requests.

The event contract separates runtime behavior from Ni's storage/UI implementation. Execution intent is persisted through the sink before tool side effects. A checkpoint records phase, counters, messages and pending calls. Only a consistent ready checkpoint is resumable; partial streams, terminal states and unresolved tool operations are rejected. This prevents automatic replay of uncertain operations, but the sink's durability and cross-process ownership must be supplied by the session layer. Tool cancellation similarly depends on Joe's executor cleaning up its subprocesses.

## Context and memory

Context pruning retains the task and latest complete assistant/tool group, dropping older groups together to preserve protocol validity. No model-generated summarization is implemented in this baseline. Estimated input includes tool schemas and reserves requested output capacity. Provider usage is retained where available; otherwise the record explicitly marks an estimate. Interrupted streams can lack final usage, so the evaluation must not interpret missing usage as zero cost.

Project facts are distinct from conversation history. Facts carry provenance, revision and timestamps; documents are scoped by project, revision, orientation baseline and trial. A trial reads the frozen orientation facts and its own overlay. Writes do not automatically promote facts into another trial or the baseline. Files are validated and atomically replaced with exclusive writer coordination. The current implementation stores explicitly supplied facts; autonomous fact extraction is not claimed.

## Validation evidence

The current 44 offline tests cover tool roundtrips, invalid arguments, errors, approval denial, deadlines, context groups, token budgets, memory isolation, SDK stream normalization and safe checkpoint behavior. Independent code review identified final-checkpoint replay and measured-budget completion errors; regression tests reproduced both before correction.

A live development acceptance run on October 21, 2026 used the configured GLM-5.3 service to repair a small Python clamp function. The model inspected source/tests, patched the source and ran tests. The initial tests failed; all three visible and four held-out checks passed afterward. The run used four model turns and four tool calls, 22.556 seconds, and 4,671 provider-reported tokens. The exact source changes and selected trace are in [the acceptance evidence](../validation/live-repair-2026-10-21/README.md).

This result validates one bounded model/tool/code/test loop. It does not establish general coding success, project-memory benefit, production tool safety or TUI/session integration. The acceptance tools and in-memory event sink are development fixtures. Formal comparison awaits the shared tools/evaluator and review/freeze of all team tasks. Siyuan has prepared four draft tasks matching the agreed allocation; none of the planned 32 experiment runs is reported as completed.

## Demo sequence

1. Show the shared interfaces and the division between runtime, tools and session/UI.
2. Run `bun run demo` for a deterministic model/tool roundtrip.
3. Walk through the saved live-repair before/after source and trace; identify the permission request, tool result and next model turn.
4. Run the memory and runtime tests to show trial isolation and rejection of unresolved checkpoints.
5. State outstanding integration and benchmark work explicitly. A prerecorded trace is evidence of a prior run, not a claim of a live demo.

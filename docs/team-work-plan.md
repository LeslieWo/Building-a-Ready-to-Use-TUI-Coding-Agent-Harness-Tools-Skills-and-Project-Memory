# Team Work Plan

This is the proposed ownership plan for the submitted CS 5100 project. Implementation has not started. The owner approved TypeScript + Bun; see [ADR 001](decisions/001-typescript-bun.md) and the [architecture and contract design](architecture-draft.md). The aim is comparable effort and meaningful engineering, evaluation, and writing experience for all three members. Estimates are planning weights, not measured hours or a guarantee of equal difficulty.

## Ownership and workload

| Member | Primary engineering scope | Engineering points | Shared-work points | Total |
| --- | --- | ---: | ---: | ---: |
| Siyuan Liang (@LeslieWo) | Agent loop, model adapter, project memory and context | 18 | 12 | 30 |
| Joe Zou (@joezouf2017) | Native tools, execution boundaries, MCP, reusable skills | 18 | 12 | 30 |
| Ni Li (@annanil) | TUI, session persistence and recovery, evaluation runner | 18 | 12 | 30 |

Each member also owns four evaluation tasks (4 points), 32 planned evaluation runs and their analysis (3), cross-review and integration support (3), and a report section plus demo segment (2). No member is assigned only documentation or testing.

## Siyuan Liang: agent runtime and memory

- [ ] Implement the model-provider adapter and single-agent execution loop (8 points). Accept a task, call the model, dispatch tool requests through Joe's registry, append observations, and terminate on completion, interruption, or configured budgets. Expose structured events for Ni's consumers.
- [ ] Implement persistent project facts, provenance, update timestamps, and bounded context assembly (6 points). Separate project facts from conversation state and support turning memory on/off for evaluation. Use a simple structured local store first.
- [ ] Verify runtime failure handling and memory isolation with focused tests (4 points): tool failures return to the loop, budgets stop execution, and a new trial cannot inherit a previous trial's solution.

**Acceptance:** complete a small repository task using Joe's tools, stream events to Ni's TUI, and demonstrate memory-enabled and memory-disabled runs with explicit token/step limits. Report limitations rather than masking failed actions.

**Writing and demo:** explain the agent loop, provider integration, context strategy, and memory tradeoffs; demonstrate one task trajectory and memory behavior.

## Joe Zou: tools, MCP, and skills

- [ ] Implement the native tool registry and repository list/search/read/patch/test tools (8 points). Validate arguments, restrict edits to the workspace, bound outputs, enforce command timeouts, and surface confirmation requests for risky operations. Document what the execution boundary does and does not protect.
- [ ] Implement an MCP client adapter with one working server-backed tool (5 points). Normalize native and MCP results through the same registry and handle unavailable servers and malformed responses.
- [ ] Implement versioned skill descriptions and on-demand instruction loading (5 points). Include investigation and patch-validation procedures, a skills on/off switch, and focused tests for loading and tool errors. Skills must not embed evaluation solutions.

**Acceptance:** run native and MCP tools through the same agent loop, return understandable errors, demonstrate the approval path, and log which skill instructions were loaded. Keep actual test execution observable.

**Writing and demo:** explain tool interfaces, execution controls, MCP integration, and skill-loading tradeoffs; demonstrate a tool call and a skill-guided repair.

## Ni Li: TUI, session recovery, and experiment runner

- [ ] Implement the terminal interface and command-line entry point (8 points). Show conversation, live tool activity, test output, and diffs; support interruption and approval requests. Add installation and model-configuration guidance without exposing credentials.
- [ ] Implement session event persistence and restoration (5 points). Consume Siyuan's events, save conversation/tool progress, and restore sessions without silently re-running completed commands. Add focused persistence and UI-state tests.
- [ ] Implement a headless evaluation runner and machine-readable result export (5 points). Select configurations A/B/C/D, start clean repository copies, collect metrics from the shared event contract, and run held-out tests outside the agent-accessible workspace. Keep this a small runner, not a dashboard platform.

**Acceptance:** a teammate can follow setup instructions, launch a task, inspect its diff, interrupt safely, and restore a saved session. The runner executes a pilot for all four configurations and exports comparable results. The runner is Ni's responsibility; preparing and running the entire experiment is shared equally.

**Writing and demo:** explain user interaction, recovery behavior, and evaluation infrastructure; demonstrate the TUI and a saved-session restore.

## Shared interfaces: agree before implementation

All paths below are proposed ownership boundaries, not existing files.

| Contract | Lead | Required agreement |
| --- | --- | --- |
| Agent events | Siyuan | Run/session ID, event type, timestamp, payload; model usage, tool start/result, approval request, diff, interruption, completion, and failure events |
| Tool interface | Joe | Tool name, argument schema, execute operation, structured status/output/error, timeout and approval behavior; shared by native and MCP tools |
| Session and run configuration | Ni | Repository path, task, model identifier, sampling settings, skills/memory flags, context/step/token limits, trial ID, and output location; secret values are never persisted in logs |
| State ownership | All three | Siyuan owns project-fact memory and active context. Ni owns session/event storage and restore orchestration. Joe owns tool execution and skill assets. Recovery restores state through an agreed runtime interface. |

Suggested module boundaries: `src/agent/` and `src/memory/` (Siyuan); `src/tools/`, `src/mcp/`, `src/skills/`, and `skills/` (Joe); `src/tui/`, `src/session/`, and `eval/` (Ni). Each owner writes tests for their own modules. Keep shared schema changes in small PRs reviewed by all affected owners.

## Evaluation: equal participation

| Member | Bug-repair tasks | Feature tasks | Cross-file/convention tasks | Total tasks | Planned runs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Siyuan | 2 | 1 | 1 | 4 | 32 |
| Joe | 1 | 2 | 1 | 4 | 32 |
| Ni | 1 | 1 | 2 | 4 | 32 |
| Total | 4 | 4 | 4 | 12 | 96 |

Each task includes a frozen starting snapshot, task specification, visible tests, and separate held-out acceptance tests. Each member executes four configurations times two repetitions for each of their four tasks. A different member reviews task validity and test coverage before the benchmark is frozen.

Use separate development tasks for tuning. Keep the model, sampling settings, tools, context limit, and step/token budgets fixed across configurations. Provide the same preliminary repository-orientation opportunity; only memory-enabled conditions may persist its project facts. Never carry evaluation solutions, patches, or acceptance-test details across trials. Account for orientation costs separately. Each member reports success/regressions, input/output tokens, elapsed time, tool calls, invalid calls, and failed repair cycles for their assigned runs.

Ni maintains the export format, Siyuan checks runtime and memory accounting, and Joe checks tool/skill traces. All three jointly interpret aggregate outcomes. Pilot costs first; if scope must shrink, reduce the workload proportionally and document the change.

## Milestones and integration

These are dependency-based milestones, not invented course deadlines.

1. **Interfaces and pilot:** all three agree on contracts and select separate development tasks. Siyuan supplies a stub loop/events, Joe a stub tool, and Ni a minimal event-consuming TUI plus result schema. Each member reviews one related paper and shares design implications.
2. **End-to-end baseline:** Siyuan connects the model and loop; Joe connects native tools; Ni connects TUI, configuration, and logging. Together demonstrate task -> tool -> patch -> test -> diff.
3. **Proposal features:** Siyuan adds memory/context controls; Joe adds MCP/skills; Ni adds recovery and the headless runner. Run a small A/B/C/D pilot before adding more features.
4. **Freeze and evaluate:** each person supplies four reviewed tasks, runs their 32 trials, and analyzes failures. Fix evaluation infrastructure consistently; do not tune prompts against final held-out cases.
5. **Report and demo:** each writes their own technical section, contributes evaluation findings and limitations, and presents a comparable demo segment. Rotate final editing and integration work.

Multi-agent planning/review is a stretch goal. Start it only after all required features work and all three agree on capacity; it is not an additional default obligation for Siyuan.

## Collaboration and rebalancing

- Review rotation: Joe reviews Siyuan's PRs; Ni reviews Joe's; Siyuan reviews Ni's. For shared interfaces, add the affected owner as a reviewer.
- Use feature branches and small PRs with a short behavior summary and validation evidence. Aim for one teammate review before merging; this is a team convention, not an enforced branch rule.
- Assign one primary owner per task. Every member writes, tests, documents, and demonstrates their own work.
- At each milestone, record remaining effort and blockers. If one person's estimated remaining load is more than about 20% above another's, move a bounded task or pair on it and record the new ownership. Do not equate line counts or commit counts with contribution.
- Each person gets hands-on exposure to the other modules through review and an integration walkthrough. The designated owner is responsible for delivery, not the only person allowed to understand or edit the module.
- Keep plans, issues, PRs, code comments, and commit messages in English. The existing Chinese proposal review HTML remains the explicit exception.

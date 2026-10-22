# Agent Runtime Implementation Plan

**Goal:** Deliver Siyuan's independently testable TypeScript runtime, provider adapter, context assembly and isolated project-fact storage.

**Architecture:** Runtime depends on shared contracts and injected provider/tool/event ports. Use standard Node filesystem and Web cancellation APIs so the core does not require Bun-specific APIs. Ni's persistence and Joe's tools remain external implementations.

**Tech Stack:** TypeScript, Bun tests, Zod, official OpenAI JavaScript SDK, tsc, ESLint and Prettier.

## Files and acceptance sequence

- [x] `src/contracts/index.ts`: messages, tools, events, run limits, memory scope and checkpoints. Validate configuration and restored state; unresolved calls block resume.
- [x] `tests/runtime.test.ts` then `src/agent/runtime.ts`: fail a two-turn fixture before implementation; preserve call IDs, feed errors back, enforce step/tool/time/token limits, cancel via AbortSignal, persist intent before execution and checkpoints after complete turns. Exactly one terminal event for a functioning sink.
- [x] `tests/context.test.ts` then `src/agent/context.ts`: validate tool groups, trim oldest complete groups, preserve task and instructions; fail explicitly if minimum context exceeds the estimated budget.
- [x] `tests/memory.test.ts` then `src/memory/store.ts`: isolated project/revision/baseline/trial files, validated facts, atomic writes, no automatic promotion of trial facts. Test restarts, corruption, revisions and memory-off behavior.
- [x] `tests/provider.test.ts` then `src/agent/providers/openai.ts`: test the actual SDK with an injected HTTP fixture, including fragmented tool arguments, finish reasons, usage, abort and no hidden retry. Never execute tools inside the adapter.
- [x] `examples/runtime-demo.ts`, `docs/runtime-development.md`: network-free runnable roundtrip; teammate integration contracts, known limitations, optional live-provider configuration without stored secrets.
- [x] Run `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun run demo`. Inspect changes and commit on the feature branch. Do not claim live-provider or teammate integration acceptance from fixture tests.

For each implementation unit: write behavioral tests, run and observe failure, implement, then rerun. An initially missing module may be replaced by a deliberately unimplemented exported skeleton to demonstrate assertion-level failure. Use `bun test tests/<unit>.test.ts` for targeted verification and the full suite for final integration. Changes remain in the feature branch until reviewed.

## Validation record

October 21, 2026: Bun 1.3.11, Node 22.23.1. Frozen dependency install, 36 offline tests, tsc, ESLint, Prettier, Bun demo and Node-bundled demo passed. Independent review found final-checkpoint replay and measured-budget completion issues; regression tests reproduced both before fixes, and review confirmed the fixes. No real-model request was made. Teammate integration remains outstanding.

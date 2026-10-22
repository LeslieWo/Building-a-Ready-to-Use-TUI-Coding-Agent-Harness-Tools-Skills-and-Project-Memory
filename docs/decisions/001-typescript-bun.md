# ADR 001: TypeScript and Bun

Date: October 21, 2026. Status: approved by the project owner; not a claim of teammate review or instructor approval.

## Context and decision

The submitted proposal proposed Python with Textual. The owner now prioritizes learning the implementation of an OpenCode-like coding harness. Select TypeScript (strict mode) and Bun. Keep the single-agent baseline, team ownership, memory/skills experiments, and evaluation workload unchanged.

Use explicit async orchestration, shared TypeScript contracts validated with Zod, an OpenAI-compatible provider adapter using the official JavaScript SDK, and the official MCP TypeScript SDK. Prefer OpenTUI and SolidJS for the TUI, subject to Ni's minimal compatibility spike. Use Bun tests, tsc, ESLint and Prettier; lock dependency versions during implementation. No application scaffold is part of this documentation change.

## Alternatives and rationale

Python/Textual aligns with the original proposal and is viable for the coursework. TypeScript/Bun more directly matches the studied source and avoids translating its async and typing patterns across languages. A hybrid adds unnecessary boundaries. No performance comparison has been conducted, and this decision does not claim faster model generation or lower total memory usage.

Bun is the planned runtime for our implementation. The analyzed installed OpenCode desktop uses Electron and a Node utility process; it is inaccurate to describe every OpenCode execution mode as Bun.

## Consequences and delivery

Siyuan owns agent/provider/context/memory; Joe owns tools/MCP/skills; Ni owns TUI/session/CLI/evaluation. Shared schemas, call IDs, cancellation and durable execution boundaries come first. Each owner tests against contract fixtures and fakes. Keep a single package initially; do not copy OpenCode's entire monorepo or adopt its complete dependency stack.

Sequence: contracts -> deterministic runtime tests -> compatible provider -> isolated memory/context -> teammate integration -> four-configuration pilot. TUI acceptance includes text streaming, tool activity, approvals, cancellation and restoration; runtime tests remain headless.

The submitted PDF and companion proposal files remain exact historical artifacts. This ADR records the subsequent change and must be reflected in the final report. Python benchmark repositories remain in scope. Any reused upstream code requires attribution and applicable license compliance.

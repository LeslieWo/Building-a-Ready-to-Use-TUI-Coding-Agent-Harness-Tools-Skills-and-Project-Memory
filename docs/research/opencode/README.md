# OpenCode research: findings, evidence, and implementation lessons

Research target: OpenCode v1.18.30, macOS ARM64 installed desktop artifact. Official source commit: `3104c1428ec91f809e5ab86631300de41eb6952e`. Publication date: October 21, 2026.

This is a curated public research package from the local REA investigation. It combines shipped-artifact inspection, controlled runtime probes, matching upstream source, official test execution, and desktop smoke observations. It is not our project's implementation or benchmark result, and it does not establish complete software verification.

## Start here

- [Architecture and implementation boundaries](../../architecture-draft.md)
- [Approved language/stack decision](../../decisions/001-typescript-bun.md)
- [Evidence manifest with original and published SHA-256 hashes](evidence/manifest.json)
- [Source-to-bundle anchor correspondence](evidence/source-artifact-correspondence.json)
- [Official suite counts, including failures](evidence/official-suite-counts.json)
- [HTTP operation coverage inventory](evidence/api-coverage.csv)

The manifest identifies local source records by relative path. Paths in exported JSON are symbolic; controlled test IDs and random fixture markers remain to preserve relationships. These are selected evidence records, not a complete portable rerun kit. Raw application databases, credentials, personal UI captures, binary distributions, dependencies and full upstream source are excluded. Original private reports and logs remain local. Summary hashes provide traceability, not independent certification of results.

## Source provenance and native bootstrap

The corresponding official source tree was obtained from upstream, not reconstructed byte-for-byte from the compiled bundle. [Git-tree verification](evidence/source-tree-verification.json) reports 6,621 matching Git blobs, no missing/mismatched files and an untruncated tree. [Post-test integrity](evidence/source-integrity.json) reports the original 6,621 files unchanged. Twelve source/bundle anchors were matched; generic strings can have multiple matches, so their presence alone does not prove execution. No reproducible-build equivalence was established.

[Ghidra](evidence/ghidra-entry.json) and [Hopper](evidence/hopper-entry.json) independently decompiled ARM64 entry `0x100000460`. It checks Electron's RunAsNode fuse and `ELECTRON_RUN_AS_NODE` before selecting the Node or Electron entry path. This is the launcher, not the agent logic. Installed IDA Free lacked the required ARM64 processor support, so there is no IDA ARM64 result. REA's whole-bundle semantic analysis exhausted its 2 GB heap; manual bundle analysis and bounded runtime probes supplied the remaining evidence.

Observed desktop startup included renderer, GPU/network helpers and an OpenCode server utility process. A separate Electron IPC capture was incomplete; it must not be presented as a complete GUI-to-backend traffic trace. The installed desktop runs Electron/Node. TypeScript source and Bun tooling do not mean every distributed execution mode runs on Bun.

## Core architecture and reading map

All links below pin the investigated commit rather than a moving branch.

| Feature | Upstream source | Findings and implications |
| --- | --- | --- |
| Agent loop | [prompt.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/session/prompt.ts) | Selects history, checks pending tool work/completion, resolves model/tools, assembles instructions and invokes processing. Keep our loop explicit and bounded. |
| Stream processing | [processor.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/session/processor.ts) | Tracks tool call IDs and pending/running/completed/error states. Preserve IDs across model, executor and event sink. |
| Provider resolution | [provider.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/provider/provider.ts) | Resolves provider SDK/model and caches model objects. Put vendor-specific behavior behind our adapter. |
| Context compaction | [compaction.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/session/compaction.ts) | Retains a recent tail and runs a tool-free summarizer. Begin with bounded context before adding summaries. |
| Project instructions | [instruction.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/session/instruction.ts) | Loads AGENTS.md and configured instructions with source tracking. Instructions are not equivalent to autonomous project-fact memory. |
| Desktop server | [sidecar.ts](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/desktop/src/main/sidecar.ts) | Starts backend listener and reports readiness through parent IPC. Our initial TUI does not require an Electron shell. |

Bounded searches did not establish an autonomous structured project-fact store in the inspected implementation. This is not proof of global absence. Our fact/provenance store is an explicit project design requirement, separate from Ni's conversation persistence.

## Controlled dynamic results from the installed backend

These probes executed the original ASAR backend with isolated directories and a deterministic local model protocol fixture. They demonstrate orchestration and effects, not remote-model reasoning quality.

| Scenario | Evidence | Observed result and limit |
| --- | --- | --- |
| Model -> read -> model | [agent-chain.json](evidence/agent-chain.json) | Two model requests, completed read, random file marker in the next request, expected final reply. |
| Native tools | [native-tools.json](evidence/native-tools.json) | Seven cases passed: read, glob, grep, write, edit, bash and missing-file error feedback; checks include round count, status and effects. |
| MCP and skills | [mcp-skills.json](evidence/mcp-skills.json) | Local stdio MCP discovery/call, returned marker, skill instruction loading, and third model turn verified. No remote MCP reliability claim. |
| HTTP smoke/session operations | [api-smoke.json](evidence/api-smoke.json) | Read-only JSON responses and selected fork/delete/noReply behavior. Endpoint smoke does not prove subsystem correctness. |
| Cross-process persistence | [persistence.json](evidence/persistence.json) | Same session and message restored without a model request. Does not prove completed tool commands cannot replay. |
| Manual compaction | [compaction.json](evidence/compaction.json) | Summary message/part and tool-free model request observed. Automatic overflow, summary quality and pressure behavior untested. |
| Cancellation | [cancellation.json](evidence/cancellation.json) | Waiting model request aborted; error recorded and busy state cleared. Long-running shell/MCP cancellation untested. |

The HTTP inventory contains 188 operations: 23 smoke passes, 8 bounded behavior passes, and 157 untested operations. Do not count internal tool probes as extra HTTP endpoint coverage.

## Official tests and known failures

Tests used the matching source on macOS ARM64 with locally pinned Bun 1.3.14 and isolated test state. Dependency installation was partial: 4,691 packages installed, but a locked SolidStart preview URL returned 404. Source files were not modified to hide failures. Some initial sandbox listener failures required reruns; retries are not additive test counts.

See [machine-readable suite counts](evidence/official-suite-counts.json). Examples: core 1,091 pass/6 skip; TUI 193 pass/1 skip; LLM 298 pass/30 skip; codemode 263 pass; session-ui 83 pass; UI 27 pass; client 16 pass; HTTP recorder 33 pass. OAuth-focused tests had 77 passes using local mocks, not real account authorization.

Failures and limitations:

- App: 723 pass, 1 fail (pa-PK locale expected pa, obtained en).
- SDK-next: 2 pass, 3 fail with SQLITE_CANTOPEN.
- Code generation: 65 pass, 1 fail with a percent-encoded non-ASCII path; unchanged source copied to an ASCII path yielded 66 passes. These are two runs, not 131 distinct passes.
- PTY: 3 pass, 1 timeout failure; an earlier exit-state case passed on rerun. Cause was not established as an upstream defect.
- Real Chromium regression: 0 pass, 1 fail on legacy-new-session redirect. The separate 41-pass browser-condition suite used happy-dom and is not Chromium coverage.
- Broad opencode suite: terminated at the 360-second cap with one observed failure marker and no final totals. Null totals in the JSON are unknown, not zero.

No aggregate all-tests-pass claim is justified. Full raw logs remain local; the published counts are selected machine-readable summaries.

## Live desktop/model observations

The existing macOS app used its configured Z.AI Coding Plan connection and GLM-5.3. A no-tools request returned the exact requested marker. A second task requested one temporary fixture file: the UI asked for external-directory permission, one-time approval was selected, a read was shown, and the final reply matched the random file marker. Reload Webview restored that test session and response. Model search, context display, settings and available OAuth methods were also viewed.

This is an observation summary based on private screenshots/accessibility records; those records are not published because they include account/session context. It is weaker public evidence than the exported controlled JSON probes. No live-model edit/shell flow, exhaustive UI coverage, Windows/Linux execution or new OAuth consent was completed. UI-reported timing/usage is not an independent billing audit.

## OAuth and platform boundaries

Source review located Codex browser PKCE/state and device login, Copilot device login, and MCP callback/state handling. See pinned [Codex implementation](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/plugin/openai/codex.ts) and [MCP callback](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/mcp/oauth-callback.ts). MCP explicitly binds IPv4 loopback; Codex's inspected listen call does not explicitly set a host, which is distinct from its localhost redirect URI. No exploit or vulnerability conclusion was established.

The source [test workflow](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/.github/workflows/test.yml) defines Linux/Windows jobs. The [release](https://github.com/anomalyco/opencode/releases/tag/v1.18.30) offers multiple OS/architecture packages. Configuration and release availability are not execution proof. The exact-commit Actions query returned a notification workflow, not matching test-run proof. Real OAuth consent/refresh and native Windows/Linux behavior remain unverified.

## What each teammate should reuse as knowledge

- Siyuan: explicit loop, normalized provider events, paired tool call IDs, bounded context, cancellation and isolated project facts.
- Joe: one registry for native/MCP tools, validation, output/timeout controls, permission outcomes and observable skill loading.
- Ni: structured event consumption, durable checkpoints, unresolved-operation reconciliation, TUI rendering and headless metrics.

Read the small pinned source entry points rather than copying the entire application. Tests against OpenCode do not satisfy acceptance tests for our own code. Our architecture intentionally adds explicit project-fact provenance and evaluation isolation. OpenCode is third-party work; consult its pinned [license](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/LICENSE) and retain required notices for any future reuse. This package includes short evidence excerpts and decompiler output for analysis, not a vendored application.

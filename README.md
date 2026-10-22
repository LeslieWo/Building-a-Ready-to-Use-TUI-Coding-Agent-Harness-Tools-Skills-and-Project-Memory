# Building a Ready-to-Use TUI Coding Agent: Harness, Tools, Skills, and Project Memory

A CS 5100 team project exploring the harness behind a terminal-based coding agent inspired by OpenCode.

## Team

- Siyuan Liang
- Joe Zou
- Ni Li

## Status

Planning stage. Implementation has not started, and no experimental results are available yet. The proposed scope below is subject to team review.

## Project proposal

Read the full English proposal draft: [PDF](docs/project-proposal.pdf) or [plain text](docs/project-proposal.txt). It includes the motivation, paper-by-paper related-work analysis, methodology and alternatives, expected results, evaluation controls, and references. The draft remains subject to team review and has not been submitted to the course platform.

## Project goal

Build a coding agent with a text user interface (TUI) that lets a developer open a repository, describe a task, inspect tool activity, review changes, and restore a session after configuring a model API.

The initial focus is small Python repositories, bug fixes, bounded feature additions, and test-driven refinement.

## Planned capabilities

- A core agent loop with validated tool calls, observations, execution limits, and action logs.
- Repository search, file reading, patch-based editing, and test execution.
- A TUI showing conversation history, tool activity, test output, and diffs.
- An MCP client adapter for extensible tools.
- Reusable skills loaded on demand.
- Persistent project memory and session recovery.
- Optional planning or review agents after the single-agent workflow is reliable.

Python and Textual are the proposed implementation stack; final choices remain open for team review.

## Evaluation plan

Compare the core harness, harness with skills, harness with memory, and harness with both under a fixed model and execution budget. Measure task success using held-out tests, along with token usage, execution time, and tool behavior. The initial proposal targets 12 tasks and two runs per configuration, subject to a cost pilot.

## Milestones

1. Build the TUI and core tool loop.
2. Add MCP integration and reusable skills.
3. Add project memory and session recovery.
4. Evaluate the system and document installation and results.

## Related work

- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793)
- [The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents](https://arxiv.org/abs/2511.03690)
- [Building Effective AI Coding Agents for the Terminal: Scaffolding, Harness, Context Engineering, and Lessons Learned](https://arxiv.org/abs/2603.05344)

OpenCode is the product inspiration. Any reused implementation must be attributed and used in accordance with its license.

## Repository language

Use English for all repository content: documentation, code comments, user-facing strings, issues, pull requests, and commit messages. See [AGENTS.md](AGENTS.md) for the persistent project convention.

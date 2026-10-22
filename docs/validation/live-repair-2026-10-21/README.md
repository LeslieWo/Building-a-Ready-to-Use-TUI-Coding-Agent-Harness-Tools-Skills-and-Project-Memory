# Live-model code-repair acceptance

Observed October 21, 2026 (America/Los_Angeles); timestamps in JSON are UTC October 22. This tests our own runtime, not the previously investigated OpenCode executable.

The configured Z.AI Coding Plan / GLM-5.3 service completed a disposable Python clamp repair in **4 model turns, 4 tool calls, 22,556 ms**, with **4,671 provider-reported tokens**. Initial visible tests failed; after the model's patch, all **3 visible tests and 4 held-out tests passed**. Usage was reported, not estimated; no monetary charge calculation is claimed.

The trace shows read_source, read_tests, approved replace_source, and run_tests. A separate post-run check ran visible and held-out assertions. The model did not receive the held-out tests through any tool. The before/after files are the actual fixture source. This development task is excluded from the proposed final benchmark.

- [Machine-readable result](summary.json)
- [Selected tool/approval/usage trace](trace.json)
- [Test results before and after](verification.json)
- [Strengthened tool-sequence revalidation](sequence-revalidation.json)
- [Before](before.py) and [after](after.py)
- [Artifact hashes and transformations](manifest.json)

A preceding no-tools connectivity check returned the exact expected marker with 52 provider-reported tokens. The repair result above is the stronger behavioral evidence.

## Reproduce

Configure AGENT_API_KEY, AGENT_MODEL and optionally AGENT_BASE_URL, then run `bun run acceptance:live`. Local reports are saved under ignored `reports/`. The published runner never reads another application's credentials; credentials were supplied locally through process environment for this run and are not published.

The runner limits model turns, tools, tokens and elapsed time. Its only write tool patches one fixed file; Python checks use fixed argv, a cleared child environment, a timeout, and a narrow AST policy for this numerical fixture. This is not a general Python or OS security sandbox. It is not Joe's production tool implementation. The event sink is in-memory, so the result does not validate Ni's persistence or TUI. One successful small task is not a success-rate benchmark, model comparison, memory benefit, or all-provider compatibility result.

Endpoint configuration was checked against [Z.ai's official connection documentation](https://zcode.z.ai/en/docs/configuration). Provider behavior is specific to this tested service/model and date.

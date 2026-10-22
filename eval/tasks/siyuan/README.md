# Siyuan's draft evaluation tasks

These are candidate fixtures, not a frozen benchmark. They match the agreed allocation: two bug fixes, one feature and one cross-file/convention task. No agent benchmark runs or A/B/C/D comparisons have been performed.

| ID | Category | Task |
| --- | --- | --- |
| B1-closed-intervals | Bug | Merge touching closed intervals without mutating input |
| B2-page-window | Bug | Correct page windows and reject invalid bounds |
| F1-unique-slug | Feature | Allocate the smallest available normalized slug suffix |
| C1-shared-money-format | Cross-file | Share integer-safe currency formatting between modules |

Each task contains task.json, workspace/ (source plus visible tests), and heldout/ (acceptance tests). Dependencies are Python's standard library. Author preflight confirmed failing baselines and passing temporary reference fixes; reference solutions are not published. See [preflight results and draft file hashes](../../../docs/evaluation/siyuan-draft-preflight.json).

## Handoff to Ni's evaluator

1. Have a different team member review specifications, test validity and difficulty before freezing snapshots. These small fixtures may need difficulty adjustment; do not use them to claim realistic SWE-bench-level performance.
2. Copy **only workspace/** into a new disposable agent repository. Supply the task prompt from task.json separately. Never give the agent the whole project checkout containing heldout/ or research reports.
3. Preserve original visible tests and run held-out tests from an external evaluator location. Disallow changes to tests, runner and baseline infrastructure. Keeping tests in another directory alone is not a security boundary; the production executor must restrict access appropriately.
4. Give every configuration the same orientation opportunity. A uses core only; B enables Joe's skills; C enables Siyuan's project facts; D enables both. Freeze one non-solution orientation fact snapshot per project and keep trial overlays isolated.
5. Hold model, sampling, limits and tool set fixed. Run each task with four configurations and two repetitions: 32 runs for Siyuan, only after the shared runner and tools are integrated. Record orientation costs separately, failure reasons, usage availability, elapsed time, calls and test/regression outcomes.
6. Do not tune prompts or skills on these acceptance tests after freeze. Use the separate clamp development fixture for integration debugging.

The preflight is an author sanity check, not independent review or evidence that a model solved these tasks. For manual checks, add only the workspace to Python's import path and discover workspace/test_visible.py or heldout/test_acceptance.py in separate Python processes. Ni owns the production evaluation runner; this task package does not replace it.

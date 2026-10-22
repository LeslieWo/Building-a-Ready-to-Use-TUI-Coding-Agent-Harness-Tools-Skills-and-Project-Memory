import { test, expect } from "bun:test";
import { createRepairFixture } from "../examples/support/repair-fixture";
const signal = new AbortController().signal;
test("repair fixture starts failing and a source-only correction passes both suites", async () => {
  const f = await createRepairFixture();
  try {
    expect((await f.check(false, signal)).passed).toBe(false);
    const ctx = {
      workspace: f.workspace,
      signal,
      skillsEnabled: false,
      approval: { request: async () => true },
    };
    const read = await f.tools.execute(
      { id: "r", name: "read_source", arguments: {} },
      ctx,
    );
    expect(read.output).toContain("def clamp");
    const patched = await f.tools.execute(
      {
        id: "w",
        name: "replace_source",
        arguments: {
          old: "    return min(lower, max(value, upper))",
          replacement:
            '    if lower > upper:\n        raise ValueError("invalid bounds")\n    return min(upper, max(value, lower))',
        },
      },
      ctx,
    );
    expect(patched.status).toBe("success");
    expect((await f.check(false, signal)).passed).toBe(true);
    expect((await f.check(true, signal)).passed).toBe(true);
  } finally {
    await f.cleanup();
  }
});
test("denied writes leave the fixture unchanged", async () => {
  const f = await createRepairFixture();
  try {
    const before = await f.source();
    const result = await f.tools.execute(
      {
        id: "w",
        name: "replace_source",
        arguments: { old: "def", replacement: "bad" },
      },
      {
        workspace: f.workspace,
        signal,
        skillsEnabled: false,
        approval: { request: async () => false },
      },
    );
    expect(result.status).toBe("denied");
    expect(await f.source()).toBe(before);
  } finally {
    await f.cleanup();
  }
});
test("fixture rejects mismatched replacement and arbitrary tools", async () => {
  const f = await createRepairFixture();
  try {
    const ctx = {
      workspace: f.workspace,
      signal,
      skillsEnabled: false,
      approval: { request: async () => true },
    };
    expect(
      (
        await f.tools.execute(
          {
            id: "w",
            name: "replace_source",
            arguments: { old: "missing", replacement: "x" },
          },
          ctx,
        )
      ).status,
    ).toBe("error");
    expect(
      (
        await f.tools.execute(
          { id: "x", name: "shell", arguments: { command: "echo unsafe" } },
          ctx,
        )
      ).status,
    ).toBe("error");
  } finally {
    await f.cleanup();
  }
});
test("fixture test runner rejects added imports before candidate execution", async () => {
  const f = await createRepairFixture();
  try {
    const ctx = {
      workspace: f.workspace,
      signal,
      skillsEnabled: false,
      approval: { request: async () => true },
    };
    await f.tools.execute(
      {
        id: "w",
        name: "replace_source",
        arguments: { old: "def clamp", replacement: "import os\ndef clamp" },
      },
      ctx,
    );
    const outcome = await f.check(false, signal);
    expect(outcome.output).toContain(
      "Candidate rejected by fixture AST policy",
    );
  } finally {
    await f.cleanup();
  }
});

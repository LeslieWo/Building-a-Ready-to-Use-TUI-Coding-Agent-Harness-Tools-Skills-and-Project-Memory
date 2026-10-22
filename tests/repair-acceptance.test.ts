import { test, expect } from "bun:test";
import { verifiedRepairSequence } from "../examples/support/repair-acceptance";
import type { AgentEvent } from "../src/contracts";
function trace(names: string[]): AgentEvent[] {
  return names.flatMap((name, i) => {
    const meta = {
      version: 1 as const,
      id: String(i),
      runId: "run",
      sessionId: "session",
      sequence: i * 2,
      timestamp: "2026-10-21T00:00:00.000Z",
    };
    return [
      {
        ...meta,
        type: "tool_started" as const,
        call: { id: String(i), name, arguments: {} },
      },
      {
        ...meta,
        sequence: i * 2 + 1,
        type: "tool_result" as const,
        result: {
          callId: String(i),
          status: "success" as const,
          output: "ok",
          truncated: false,
        },
      },
    ];
  });
}
test("accepts inspection followed by a tested final patch", () => {
  expect(
    verifiedRepairSequence(
      trace(["read_source", "read_tests", "replace_source", "run_tests"]),
    ),
  ).toBe(true);
});
test("rejects omitted test inspection", () => {
  expect(
    verifiedRepairSequence(
      trace(["read_source", "replace_source", "run_tests"]),
    ),
  ).toBe(false);
});
test("rejects tests before the final patch", () => {
  expect(
    verifiedRepairSequence(
      trace([
        "read_source",
        "read_tests",
        "replace_source",
        "run_tests",
        "replace_source",
      ]),
    ),
  ).toBe(false);
});
test("rejects inspection only after modification", () => {
  expect(
    verifiedRepairSequence(
      trace(["replace_source", "read_source", "read_tests", "run_tests"]),
    ),
  ).toBe(false);
});

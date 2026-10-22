import { test, expect } from "bun:test";
import { assembleContext, estimateTokens } from "../src/agent/context";
import type { Message } from "../src/contracts";
const initial: Message = { role: "user", content: "current task" };
const group: Message[] = [
  {
    role: "assistant",
    content: "x".repeat(500),
    toolCalls: [{ id: "c", name: "read", arguments: {} }],
  },
  {
    role: "tool",
    result: {
      callId: "c",
      status: "success",
      output: "y".repeat(500),
      truncated: false,
    },
  },
];
test("context trims complete old groups and retains latest observations", () => {
  const recent: Message = {
    role: "assistant",
    content: "recent",
    toolCalls: [],
  };
  const result = assembleContext(
    "instructions",
    [initial, ...group, recent],
    300,
  );
  expect(result.messages).toEqual([initial, recent]);
  expect(result.estimatedTokens).toBeLessThanOrEqual(300);
});
test("oversize current task fails rather than dropping it", () => {
  expect(() => assembleContext("instructions", [initial], 1)).toThrow(
    "context_limit",
  );
});
test("unpaired tool calls rejected", () => {
  expect(() => assembleContext("", [initial, group[0]!], 9000)).toThrow(
    "incomplete",
  );
});
test("UTF8 estimate includes non-ASCII input", () => {
  expect(estimateTokens("你好")).toBeGreaterThan(estimateTokens("hi"));
});

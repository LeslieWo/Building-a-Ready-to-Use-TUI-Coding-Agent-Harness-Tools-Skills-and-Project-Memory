import type { AgentEvent } from "../../src/contracts";

/** Successful inspection must precede writes; the last write must be verified. */
export function verifiedRepairSequence(events: readonly AgentEvent[]): boolean {
  const started = new Map<string, string>();
  const completed: string[] = [];
  for (const event of events) {
    if (event.type === "tool_started")
      started.set(event.call.id, event.call.name);
    if (event.type === "tool_result" && event.result.status === "success") {
      const name = started.get(event.result.callId);
      if (name) completed.push(name);
    }
  }
  const firstWrite = completed.indexOf("replace_source");
  const lastWrite = completed.lastIndexOf("replace_source");
  return (
    firstWrite >= 0 &&
    ["read_source", "read_tests"].every(
      (name) =>
        completed.indexOf(name) >= 0 && completed.indexOf(name) < firstWrite,
    ) &&
    completed.lastIndexOf("run_tests") > lastWrite
  );
}

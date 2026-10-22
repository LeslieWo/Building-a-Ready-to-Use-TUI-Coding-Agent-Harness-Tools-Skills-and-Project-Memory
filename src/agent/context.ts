import type { Message } from "../contracts";

/** Scheduling estimate, not a tokenizer or a billing guarantee. */
export function estimateTokens(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length / 3);
}

export function validateHistory(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  const seen = new Set<string>();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role === "tool") throw new Error("incomplete_tool_group");
    const group: Message[] = [message];
    if (message.role === "assistant") {
      for (const call of message.toolCalls) {
        if (seen.has(call.id)) throw new Error("duplicate_call_id");
        seen.add(call.id);
        const result = messages[++index];
        if (result?.role !== "tool" || result.result.callId !== call.id)
          throw new Error("incomplete_tool_group");
        group.push(result);
      }
    }
    groups.push(group);
  }
  return groups;
}

export function assembleContext(
  instructions: string,
  messages: Message[],
  budget: number,
) {
  const groups = validateHistory(messages);
  if (groups[0]?.[0]?.role !== "user") throw new Error("missing_task");
  const measure = () =>
    estimateTokens(JSON.stringify({ instructions, messages: groups.flat() })) +
    32;
  while (measure() > budget && groups.length > 2) groups.splice(1, 1);
  if (measure() > budget) throw new Error("context_limit");
  return { messages: groups.flat(), estimatedTokens: measure() };
}

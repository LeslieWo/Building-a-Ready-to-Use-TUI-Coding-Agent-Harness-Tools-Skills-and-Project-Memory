import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import {
  CallSchema,
  type ModelProvider,
  type ModelRequest,
  type ProviderEvent,
} from "../../contracts";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/** One SDK request per turn. The runtime, not the SDK, owns tool execution. */
export class OpenAIProvider implements ModelProvider {
  private readonly client: OpenAI;
  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({ ...options, maxRetries: 0, timeout: 60000 });
  }
  async *stream(request: ModelRequest): AsyncIterable<ProviderEvent> {
    request.signal.throwIfAborted();
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: request.instructions },
    ];
    for (const message of request.messages) {
      if (message.role === "tool")
        messages.push({
          role: "tool",
          tool_call_id: message.result.callId,
          content: JSON.stringify(message.result),
        });
      else if (message.role === "user") messages.push(message);
      else
        messages.push({
          role: "assistant",
          content: message.content || null,
          ...(message.toolCalls.length
            ? {
                tool_calls: message.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: {
                    name: c.name,
                    arguments: JSON.stringify(c.arguments),
                  },
                })),
              }
            : {}),
        });
    }
    const stream = await this.client.chat.completions.create(
      {
        model: request.model,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(request.tools.length
          ? {
              tools: request.tools.map((t) => ({
                type: "function" as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: z.toJSONSchema(t.inputSchema),
                },
              })),
            }
          : {}),
      },
      { signal: request.signal },
    );
    const calls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finish: string | undefined;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    let buffered = 0;
    for await (const chunk of stream) {
      request.signal.throwIfAborted();
      if (chunk.usage)
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.index !== 0) throw new Error("unexpected_choice");
      if (finish && (choice.delta.content || choice.delta.tool_calls?.length))
        throw new Error("content_after_finish");
      if (choice.delta.content)
        yield { type: "text", text: choice.delta.content };
      for (const delta of choice.delta.tool_calls ?? []) {
        if (
          !Number.isInteger(delta.index) ||
          delta.index < 0 ||
          delta.index >= 128
        )
          throw new Error("invalid_tool_index");
        const call = calls.get(delta.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        call.id += delta.id ?? "";
        call.name += delta.function?.name ?? "";
        call.arguments += delta.function?.arguments ?? "";
        buffered +=
          (delta.id?.length ?? 0) +
          (delta.function?.name?.length ?? 0) +
          (delta.function?.arguments?.length ?? 0);
        if (buffered > 1_000_000) throw new Error("tool_arguments_limit");
        calls.set(delta.index, call);
      }
      if (choice.finish_reason) {
        if (finish) throw new Error("duplicate_finish");
        finish = choice.finish_reason;
      }
    }
    request.signal.throwIfAborted();
    if (!finish) throw new Error("missing_finish");
    if (!["stop", "tool_calls", "length", "content_filter"].includes(finish))
      throw new Error("unsupported_finish");
    if (finish === "tool_calls") {
      if (!calls.size) throw new Error("missing_tool_calls");
      const parsed = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, c]) => {
          let args: unknown;
          try {
            args = JSON.parse(c.arguments);
          } catch {
            throw new Error("invalid_tool_json");
          }
          return CallSchema.parse({ id: c.id, name: c.name, arguments: args });
        });
      if (new Set(parsed.map((c) => c.id)).size !== parsed.length)
        throw new Error("duplicate_call_id");
      for (const call of parsed) yield { type: "tool_call", call };
    } else if (finish === "stop" && calls.size)
      throw new Error("finish_tool_mismatch");
    if (usage) yield { type: "usage", ...usage };
    yield {
      type: "finish",
      reason: finish as "stop" | "tool_calls" | "length" | "content_filter",
    };
  }
}

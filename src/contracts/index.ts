import { z } from "zod";

const text = z.string().min(1);
export const ScopeSchema = z
  .object({ projectId: text, revision: text, baselineId: text, trialId: text })
  .strict();
export type MemoryScope = z.infer<typeof ScopeSchema>;
export const FactSchema = z
  .object({
    id: text,
    content: text.max(8000),
    source: text,
    sourceRevision: text,
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type Fact = z.infer<typeof FactSchema>;
export interface MemoryStore {
  list(scope: MemoryScope): Promise<Fact[]>;
  upsert(scope: MemoryScope, fact: Fact): Promise<void>;
}
export const ConfigSchema = z
  .object({
    runId: text,
    sessionId: text,
    projectId: text,
    workspace: text,
    task: text,
    model: text,
    instructions: z
      .string()
      .default(
        "You are a coding assistant. Use tools to inspect and verify changes.",
      ),
    temperature: z.number().min(0).max(2).default(0),
    memory: ScopeSchema.optional(),
    skillsEnabled: z.boolean().default(false),
    limits: z
      .object({
        maxTurns: z.number().int().positive().default(8),
        maxToolCalls: z.number().int().nonnegative().default(20),
        maxElapsedMs: z.number().int().positive().default(120000),
        maxTokens: z.number().int().positive().default(32000),
        contextTokens: z.number().int().positive().default(16000),
        maxOutputTokens: z.number().int().positive().default(2048),
        maxToolOutputChars: z.number().int().positive().default(16000),
      })
      .strict()
      .default({
        maxTurns: 8,
        maxToolCalls: 20,
        maxElapsedMs: 120000,
        maxTokens: 32000,
        contextTokens: 16000,
        maxOutputTokens: 2048,
        maxToolOutputChars: 16000,
      }),
  })
  .strict();
export type RunConfig = z.infer<typeof ConfigSchema>;
export const CallSchema = z
  .object({
    id: text,
    name: text,
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ToolCall = z.infer<typeof CallSchema>;
export const ResultSchema = z
  .object({
    callId: text,
    status: z.enum(["success", "error", "denied", "timeout", "cancelled"]),
    output: z.string(),
    truncated: z.boolean().default(false),
  })
  .strict();
export type ToolResult = z.infer<typeof ResultSchema>;
export const MessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string() }).strict(),
  z
    .object({
      role: z.literal("assistant"),
      content: z.string(),
      toolCalls: z.array(CallSchema).default([]),
    })
    .strict(),
  z.object({ role: z.literal("tool"), result: ResultSchema }).strict(),
]);
export type Message = z.infer<typeof MessageSchema>;
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
}
export interface ApprovalRequest {
  callId: string;
  description: string;
}
export interface ApprovalPort {
  request(request: ApprovalRequest, signal: AbortSignal): Promise<boolean>;
}
export interface ToolContext {
  workspace: string;
  signal: AbortSignal;
  approval: ApprovalPort;
  skillsEnabled: boolean;
}
export interface ToolRegistry {
  describe(): readonly ToolDefinition[];
  execute(call: ToolCall, context: ToolContext): Promise<ToolResult>;
}
export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | {
      type: "finish";
      reason: "stop" | "tool_calls" | "length" | "content_filter";
    };
export interface ModelRequest {
  model: string;
  instructions: string;
  messages: Message[];
  tools: readonly ToolDefinition[];
  maxOutputTokens: number;
  temperature: number;
  signal: AbortSignal;
}
export interface ModelProvider {
  stream(request: ModelRequest): AsyncIterable<ProviderEvent>;
}
export const CheckpointSchema = z
  .object({
    version: z.literal(1),
    phase: z.enum(["ready", "streaming", "tools", "terminal"]),
    configKey: text,
    messages: z.array(MessageSchema),
    pendingCalls: z.array(CallSchema),
    turns: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    usageEstimated: z.boolean(),
  })
  .strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type RunStatus =
  "completed" | "failed" | "cancelled" | "budget_exhausted";
export interface RunResult {
  status: RunStatus;
  reason: string;
  text: string;
  checkpoint: Checkpoint;
}
export type EventData =
  | { type: "run_started" }
  | { type: "text_delta"; text: string }
  | {
      type: "model_usage";
      inputTokens: number;
      outputTokens: number;
      estimated: boolean;
    }
  | { type: "tool_started"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult }
  | { type: "approval_requested"; request: ApprovalRequest }
  | { type: "approval_decided"; callId: string; approved: boolean }
  | { type: "checkpoint"; checkpoint: Checkpoint }
  | { type: "terminal"; status: RunStatus; reason: string };
export type AgentEvent = EventData & {
  version: 1;
  id: string;
  runId: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
};
/** emit must resolve only after durable persistence at tool/checkpoint boundaries. */
export interface EventSink {
  emit(event: AgentEvent): Promise<void>;
}
export interface Dependencies {
  provider: ModelProvider;
  tools: ToolRegistry;
  events: EventSink;
  approval?: ApprovalPort;
  memory?: MemoryStore;
}

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { buildCompactionPrompt } from "./prompt";
import type {
  CompactionOptions,
  CompactionResult,
  ConversationRecord,
  PreservationReason,
} from "./types/index";

export const defaultOptions: CompactionOptions = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
  preservedTailMessages: Number(process.env.PRESERVED_TAIL_MESSAGES ?? 8),
  includeSystemPrompt: process.env.INCLUDE_SYSTEM_PROMPT !== "false",
};

const summarySchema = z.object({
  summary: z.string().min(1),
});

export async function compactConversation(
  conversation: ConversationRecord,
  options: Partial<CompactionOptions> = {},
): Promise<CompactionResult> {
  const resolved = { ...defaultOptions, ...options };
  const preservationPlan = selectPreservedMessages(
    conversation.messages,
    resolved.preservedTailMessages,
  );
  const preservedMessageIndexes = preservationPlan.indexes;
  const preservedMessages = preservedMessageIndexes.map((index) => conversation.messages[index]!);
  const messagesToSummarize = conversation.messages
    .map((message, index) => ({ index, message }))
    .filter(({ index }) => !preservationPlan.reasons[index]?.length)
    .map(({ index, message }) => ({
      index,
      message: cleanMessageForSummarizationPrompt(message),
    }));

  const prompt = buildCompactionPrompt({
    conversationId: conversation.id,
    profile: conversation.profile,
    systemPrompt: resolved.includeSystemPrompt ? conversation.system_prompt : "[system prompt omitted by option]",
    messagesToSummarize,
    preservedMessages: preservedMessageIndexes.map((index) => ({
      index,
      reasons: preservationPlan.reasons[index] ?? [],
      message: conversation.messages[index]!,
    })),
    preservedMessageIndexes,
  });

  const result = await generateText({
    model: anthropic(resolved.model),
    output: Output.object({
      schema: summarySchema,
      name: "heymark_compaction",
      description: "A compact handoff summary for HeyMark conversation continuation.",
    }),
    prompt,
    temperature: 0,
    maxOutputTokens: 2500,
  });

  const summary = appendProtectedReferences(
    result.output.summary,
    collectProtectedReferences(conversation.messages),
  );

  return {
    summary,
    preserved_messages: preservedMessages,
    metadata: {
      conversation_id: conversation.id,
      profile: conversation.profile,
      model: resolved.model,
      preserved_message_indexes: preservedMessageIndexes,
      preservation_reasons: preservationPlan.reasons,
      usage: result.usage,
    },
  };
}

function selectPreservedMessages(
  messages: ConversationRecord["messages"],
  tailCount: number,
): {
  indexes: number[];
  reasons: Record<number, PreservationReason[]>;
} {
  const reasons: Record<number, PreservationReason[]> = {};
  const addReason = (index: number, reason: PreservationReason) => {
    const existing = reasons[index] ?? [];
    if (!existing.includes(reason)) {
      reasons[index] = [...existing, reason];
    }
  };

  const tailStart = Math.max(0, messages.length - tailCount);
  for (let index = tailStart; index < messages.length; index += 1) {
    addReason(index, "recent_tail");
  }

  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex !== undefined) {
    addReason(latestUserIndex, "latest_user_request");
  }

  messages.forEach((message, index) => {
    const searchable = messageToSearchableText(message);
    const compactEnough = isCompactEnoughToPreserve(searchable);

    if (containsConstraintOrDecision(searchable) && (message.role === "user" || compactEnough)) {
      addReason(index, "constraint_or_decision");
    }

    if (containsImportantReference(searchable) && (message.role === "user" || compactEnough)) {
      addReason(index, "important_reference");
    }

    if (containsImportantToolResult(message, compactEnough)) {
      addReason(index, "important_tool_result");
    }
  });

  return {
    indexes: Object.keys(reasons)
      .map(Number)
      .sort((a, b) => a - b),
    reasons,
  };
}

function findLatestUserIndex(messages: ConversationRecord["messages"]): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return undefined;
}

function messageToSearchableText(message: ConversationRecord["messages"][number]): string {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);
}

function containsConstraintOrDecision(text: string): boolean {
  return /\b(no|sin|must|should|debe|deben|prefiere|preferencia|tono|brand|marca|usar|usa|eleg[ií]|aprob|rechaz|descart|selected|chosen|final|pendiente|pending|next|siguiente|objetivo|goal)\b/i.test(text);
}

function containsImportantReference(text: string): boolean {
  return /(https?:\/\/|@[a-z0-9_.]+|\b(?:uuid|ws|brd|cnv|wgt)_[a-z0-9_]+\b|\b(?:creativeId|creative_id|videoId|video_id|scriptId|script_id|canvas_id|publication_id)\b|#[0-9a-f]{6}\b|\b\d+(?:\.\d+)?%\b)/i.test(text);
}

function isCompactEnoughToPreserve(text: string): boolean {
  return text.length <= 4_000;
}

function containsImportantToolResult(
  message: ConversationRecord["messages"][number],
  compactEnough: boolean,
): boolean {
  if (!Array.isArray(message.content)) return false;

  return message.content.some((part) => {
    if (!part || typeof part !== "object" || !("type" in part)) return false;
    const type = String(part.type);
    if (!type.startsWith("tool-")) return false;

    const toolName = type.replace(/^tool-/, "");
    if (LIFECYCLE_TOOL_NAMES.has(toolName)) return true;
    if (IMPORTANT_TOOL_NAMES.has(toolName) && compactEnough) return true;

    return compactEnough && containsImportantReference(JSON.stringify(part));
  });
}

const LIFECYCLE_TOOL_NAMES = new Set([
  "generate_video",
  "update_creative",
  "schedule_publication",
]);

const IMPORTANT_TOOL_NAMES = new Set([
  "present_creatives",
  "query_posts",
  "execute_sql",
  "get_performance_comparison",
  "analyze_competitor",
  "discover_accounts",
  "analyze_accounts",
]);

function cleanMessageForSummarizationPrompt(
  message: ConversationRecord["messages"][number],
): unknown {
  if (typeof message.content === "string") {
    return {
      ...message,
      content: truncateString(message.content, 8_000),
    };
  }

  if (!Array.isArray(message.content)) return message;

  return {
    ...message,
    content: message.content.map((part) => cleanPartForSummarizationPrompt(part)),
  };
}

function cleanPartForSummarizationPrompt(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  if (!("type" in part)) return part;

  const typedPart = part as Record<string, unknown>;
  const type = String(typedPart.type);

  if (type === "text") {
    return {
      ...typedPart,
      text: truncateString(String(typedPart.text ?? ""), 4_000),
    };
  }

  if (!type.startsWith("tool-")) return typedPart;

  const raw = JSON.stringify(typedPart);
  if (raw.length <= 3_000) return typedPart;

  return {
    type,
    toolCallId: typedPart.toolCallId,
    state: typedPart.state,
    input: truncateUnknown(typedPart.input, 1_200),
    output_summary: extractImportantScalars(typedPart.output),
    output_truncated_for_prompt: true,
  };
}

function truncateUnknown(value: unknown, maxLength: number): unknown {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxLength) return value;
  return `${serialized.slice(0, maxLength)}...[truncated]`;
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated]`;
}

function extractImportantScalars(value: unknown): unknown {
  const found: Record<string, unknown[]> = {};
  collectImportantScalars(value, found, 0);
  return found;
}

function collectImportantScalars(
  value: unknown,
  found: Record<string, unknown[]>,
  depth: number,
): void {
  if (depth > 6 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) {
      collectImportantScalars(item, found, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (isImportantScalarKey(key) && isScalar(child)) {
      const bucket = found[key] ?? [];
      const asString = String(child);
      if (!bucket.some((item) => String(item) === asString) && bucket.length < 20) {
        found[key] = [...bucket, child];
      }
    }

    collectImportantScalars(child, found, depth + 1);
  }
}

function isScalar(value: unknown): value is string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isImportantScalarKey(key: string): boolean {
  return /(^id$|_id$|Id$|url$|Url$|status$|state$|ok$|success$|rowCount$|published_at$|scheduled_for$|engagement_rate$|followers$|followers_count$|reach$|impressions$|like_count$|comments_count$|shares_count$|duration_seconds$|recipe_used$|handle$|username$|platform$|media_type$|creativeId$|videoId$|scriptId$|publication_id$|file_url$|previewUrl$)/i.test(key);
}

function collectProtectedReferences(messages: ConversationRecord["messages"]): Record<string, string[]> {
  const references: Record<string, string[]> = {};

  for (const message of messages) {
    collectReferenceScalars(message, references, 0);
  }

  const limited: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(references)) {
    const kept = values.slice(0, 60);
    if (kept.length > 0) limited[key] = kept;
  }
  return limited;
}

function collectReferenceScalars(
  value: unknown,
  references: Record<string, string[]>,
  depth: number,
): void {
  if (depth > 8 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) collectReferenceScalars(item, references, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (isScalar(child) && (isProtectedReferenceKey(key) || isIdLikeReference(child))) {
      const bucket = references[key] ?? [];
      const serialized = String(child);
      if (!bucket.includes(serialized)) {
        references[key] = [...bucket, serialized];
      }
    }

    collectReferenceScalars(child, references, depth + 1);
  }
}

function isProtectedReferenceKey(key: string): boolean {
  return /^(sessionId|assetId|creativeId|videoId|scriptId|publication_id|creative_id|video_id|canvas_id|workspaceId|workspace_id|brand_id|previewUrl|file_url)$/i.test(key);
}

function isIdLikeReference(value: string | number | boolean): boolean {
  if (typeof value !== "string") return false;
  return /^(uuid|ws|brd|cnv|wgt)_[a-z0-9_]+$/i.test(value);
}

function appendProtectedReferences(
  summary: string,
  protectedReferences: Record<string, string[]>,
): string {
  const missingEntries = Object.entries(protectedReferences)
    .map(([key, values]) => ({
      key,
      values: values.filter((value) => !summary.includes(value)),
    }))
    .filter(({ values }) => values.length > 0);

  if (missingEntries.length === 0) return summary;

  const lines = missingEntries.map(({ key, values }) => `- ${key}: ${values.join(", ")}`);
  return `${summary.trim()}\n\n## Protected References\n${lines.join("\n")}`;
}

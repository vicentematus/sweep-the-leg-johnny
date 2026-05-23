import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { buildCompactionPrompt } from "./prompt";
import type { CompactionOptions, CompactionResult, ConversationRecord } from "./types/index";

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
  const preservedMessageIndexes = choosePreservedMessageIndexes(
    conversation.messages.length,
    resolved.preservedTailMessages,
  );
  const preservedMessages = preservedMessageIndexes.map((index) => conversation.messages[index]!);

  const prompt = buildCompactionPrompt({
    conversationId: conversation.id,
    profile: conversation.profile,
    systemPrompt: resolved.includeSystemPrompt ? conversation.system_prompt : "[system prompt omitted by option]",
    messages: conversation.messages,
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

  const summary = result.output.summary;

  return {
    summary,
    preserved_messages: preservedMessages,
    metadata: {
      conversation_id: conversation.id,
      profile: conversation.profile,
      model: resolved.model,
      preserved_message_indexes: preservedMessageIndexes,
      usage: result.usage,
    },
  };
}

function choosePreservedMessageIndexes(messageCount: number, tailCount: number): number[] {
  const start = Math.max(0, messageCount - tailCount);
  return Array.from({ length: messageCount - start }, (_, offset) => start + offset);
}

import type { ConversationRecord } from "./types";

export async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await Bun.file(path).text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function readConversations(path: string): Promise<ConversationRecord[]> {
  return readJsonl<ConversationRecord>(path);
}

export function findConversation(
  conversations: ConversationRecord[],
  idOrIndex?: string,
): ConversationRecord {
  if (!idOrIndex) {
    const first = conversations[0];
    if (!first) throw new Error("No conversations found.");
    return first;
  }

  const maybeIndex = Number(idOrIndex);
  if (Number.isInteger(maybeIndex) && maybeIndex >= 0) {
    const byIndex = conversations[maybeIndex];
    if (byIndex) return byIndex;
  }

  const byId = conversations.find((conversation) => conversation.id === idOrIndex);
  if (!byId) {
    throw new Error(`Conversation not found: ${idOrIndex}`);
  }
  return byId;
}

import type { ModelMessage } from "ai";

export type ConversationProfile =
  | "short-direct"
  | "onboarding"
  | "video-heavy"
  | "carousel-iteration"
  | "analytics-deep"
  | "mixed-tools"
  | "long-tail";

export interface ConversationRecord {
  id: string;
  profile: ConversationProfile;
  system_prompt: string;
  messages: ModelMessage[];
  anchors?: {
    critical_facts: string[];
    asset_ids: string[];
  };
  context_summary?: string;
}

export interface CompactionOptions {
  model: string;
  preservedTailMessages: number;
  includeSystemPrompt: boolean;
}

export type PreservationReason =
  | "recent_tail"
  | "latest_user_request"
  | "constraint_or_decision"
  | "important_reference"
  | "important_tool_result";

export interface CompactionResult {
  summary: string;
  preserved_messages: ModelMessage[];
  metadata: {
    conversation_id: string;
    profile: string;
    model: string;
    preserved_message_indexes: number[];
    preservation_reasons: Record<number, PreservationReason[]>;
    usage?: unknown;
  };
}

export interface EvalResult {
  missing_asset_ids: string[];
  warnings: string[];
}

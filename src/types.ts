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

export interface CompactionResult {
  summary: string;
  preserved_messages: ModelMessage[];
  metadata: {
    conversation_id: string;
    profile: string;
    model: string;
    preserved_message_indexes: number[];
    validation: ValidationResult;
    usage?: unknown;
  };
}

export interface ValidationResult {
  missing_asset_ids: string[];
  possibly_missing_critical_facts: string[];
  warnings: string[];
}

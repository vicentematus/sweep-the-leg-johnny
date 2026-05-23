import type { ModelMessage } from "ai";

export function buildCompactionPrompt(input: {
  conversationId: string;
  profile: string;
  systemPrompt: string;
  messages: ModelMessage[];
  preservedMessageIndexes: number[];
}) {
  return `You are performing CONTEXT CHECKPOINT COMPACTION for Mark, HeyMark's marketing agent.

This is not a user-facing reply. Produce handoff state for the next Mark instance so it can continue correctly.

Core rule:
A fact is important only if losing it would make Mark likely to forget the user/business, lose an asset ID, repeat completed work, contradict a decision, use the wrong brand voice/product/audience/format, miss a pending task, or hallucinate because tool state disappeared.

Preserve:
- client/business identity, workspace, connected account, platform handles
- exact asset IDs: creativeId, videoId, scriptId, canvas_id, publication_id, workspace/brand IDs when useful
- active/final asset state: approved, discarded, processing, failed, selected
- explicit decisions and rejected directions
- brand voice, audience, product/service, channel, format, CTA constraints
- metrics and numbers that drove decisions
- tool failures, final tool outcomes, and pending next actions

Tool interpretation policy:
- web_search: preserve query intent and findings only if they influenced a decision.
- query_posts / execute_sql: preserve query purpose, row count, important post/account IDs, metrics, errors, and conclusions.
- analyze_post: preserve post ID, visual/content tags, transcript/OCR facts only when relevant.
- search_memory: preserve facts that changed or influenced the session.
- present_creatives: preserve creativeId, slide count/state, preview state, active vs discarded status, style/template.
- generate_video: preserve videoId, model/recipe, status, duration, sequence role, and URL if needed.
- get_performance_comparison: preserve KPI values, deltas, comparison periods, and final interpretation.
- analyze_competitor / discover_accounts / analyze_accounts: preserve handle, follower count, engagement rate, content pattern, strategic takeaway.
- schedule_publication: preserve publication_id, scheduled date/time, channel, and success/failure.
- update_creative: preserve creative_id, changed fields, and success/failure.

Do not:
- answer the user
- ask follow-up questions
- say there is not enough context when the facts are present
- invent IDs, dates, metrics, models, or decisions
- smooth over exact values into vague text
- omit failed tool attempts if the failure affects current state

Use neutral third-person session-record language.
Never write in first person as Mark. Never write in second person to the user.

Conversation id: ${input.conversationId}
Profile: ${input.profile}
Preserved message indexes already kept verbatim outside the summary: ${JSON.stringify(input.preservedMessageIndexes)}

System prompt that counts as compaction input:
${input.systemPrompt}

Full conversation:
${JSON.stringify(input.messages, null, 2)}

Return a concise but complete handoff summary as a single string using exactly these Markdown headings:

## Client / Business
Who the user/client/business is, account/handle/workspace, location/market, and the user's goal.

## Brand / Strategy
Brand voice, audience, product/service, channel, format, CTA constraints, pillars, and strategic direction.

## Assets
Generated or edited assets with exact IDs, current status, active vs discarded distinction, model/recipe if relevant, and URLs only when needed to continue.

## Decisions
Explicit decisions, approvals, rejected directions, chosen option, selected cadence, dates, or numbers.

## Tool Results
Important tool outcomes, metrics, errors, search/competitor/post conclusions, and any state that prevents Mark from repeating completed work.

## Pending State
The latest unresolved user request, pending action, waiting state, or what Mark should do next from the preserved tail messages.

If a section has no known facts, write "None found in the compacted conversation." Do not invent filler.`;
}

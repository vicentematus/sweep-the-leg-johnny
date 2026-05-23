# Compaction Heuristics

These heuristics define what "important" means for this challenge.

They are not universal summarization rules. They are specific to Mark, HeyMark's marketing agent, and they are derived from the local dataset:

- `dataset/schema.md`
- `dataset/conversations.jsonl`
- `dataset/bad_summaries.jsonl`

## Core Definition

A message or fact is important if losing it would make Mark less able to continue the session correctly.

In this dataset, "correctly" means Mark can resume the marketing workflow without:

- forgetting who the user or business is
- losing generated asset IDs
- repeating work already done
- contradicting a decision already made
- using the wrong brand voice, product, audience, format, or channel
- missing a pending task
- hallucinating because a tool result or prior decision disappeared

So importance is not based on length, recency, or how polished the text sounds. Importance is based on future task impact.

## Dataset Evidence

`dataset/schema.md` defines the goal as compacting conversations without losing critical context so Mark can continue the session without hallucinating.

The dataset exposes this critical context through:

- `anchors.critical_facts`: 6-8 non-negotiable facts an acceptable summary must preserve
- `anchors.asset_ids`: generated asset IDs that must appear literally in the summary or preserved messages when Mark needs them to resume work
- `context_summary`: a human reference for what matters to retain

The bad-summary suite reinforces the same definition. Failures are often caused by dropping IDs, client facts, decisions, metrics, next steps, or generated-asset state.

## High Importance: Preserve Exactly Or With Exact Values

These items should survive compaction with literal values whenever possible.

- Client identity: user name, business name, workspace/account, market, location
- Social accounts and handles: Instagram/TikTok handles, competitor handles, connected accounts
- Generated asset IDs: `creativeId`, `videoId`, `scriptId`, `canvas_id`, `publication_id`, file/asset IDs
- Active or final asset state: which creative/video/script is active, approved, discarded, processing, or failed
- Explicit decisions: selected format, chosen model, approved direction, rejected options
- Brand constraints: tone, colors, style, audience, industry positioning, CTA rules
- Concrete numbers: engagement rates, followers, post counts, reach, likes, comments, posting cadence, dates
- Tool outcomes that affect next steps: failed queries, generation errors, processing status, scheduling confirmation
- Pending tasks: next action Mark should take, user request still unresolved, waiting state

## Medium Importance: Summarize Faithfully

These items usually matter, but do not need full raw detail.

- Tool results after extracting the useful conclusion
- Competitor analysis
- Web search results
- Post-performance analysis
- Brainstorming options that informed the final decision
- Draft iterations when the final choice is clear
- Rationale behind strategy recommendations
- Repeated status checks, if the final status is preserved

Example:

Instead of preserving 8,000 tokens of raw `web_search` output, keep:

> Mark searched current dental content trends and found that educational Reels with specialists outperform generic carousel posts in the Chilean dental niche.

## Low Importance: Drop Or Heavily Compress

These items rarely affect Mark's ability to continue.

- Greetings and small talk
- "Ok", "thanks", and similar acknowledgments
- Repeated assistant confirmations
- Intermediate ideas that were clearly rejected
- Raw database rows after the relevant metric or conclusion has been extracted
- Long tool payloads whose conclusions were already stated later
- OAuth or scrubbed connection boilerplate unless connection state matters

## Tool Output Rules

Tool outputs are often the largest source of token waste, so they should be cleaned before asking an LLM to summarize the conversation.

Use tool-specific handling:

- `web_search`: preserve query intent, key findings, notable sources only if used for a decision
- `query_posts` / `execute_sql`: preserve query purpose, row count, important IDs, metrics, and conclusions
- `analyze_post`: preserve post ID, visual/content tags, transcript/OCR only if relevant
- `search_memory`: preserve facts that changed or influenced the session
- `present_creatives`: preserve `creativeId`, slide count, template/style, preview status, active/discarded state
- `generate_video`: preserve `videoId`, model/recipe, status, duration, sequence role, URL if needed
- `get_performance_comparison`: preserve KPI values, deltas, comparison periods, final interpretation
- `analyze_competitor`: preserve handle, follower count, engagement rate, content pattern, strategic takeaway
- `schedule_publication`: preserve `publication_id`, scheduled date/time, channel, success/failure
- `update_creative`: preserve `creative_id`, changed fields, success/failure

## Recent Tail Rule

The last few messages should usually be preserved verbatim.

Reason: recent messages often contain the live task state, unresolved request, or latest tool status. Summarizing them too aggressively can make Mark resume from the wrong point.

The exact number can be tuned, but a reasonable baseline is:

- preserve the last 6-12 messages verbatim
- summarize older history
- always preserve any recent message containing unresolved tool state or user instructions

## Summary Style Rules

The compacted summary must be a neutral session record, not a reply to the user.

Good:

> Mark generated a first carousel slide for Clinica VivaSalud. The active creative ID is `2b4b5ad9`, and the user selected the white minimal healthtech style.

Bad:

> Listo, ya te genere el carrusel. Dime si quieres cambiar algo.

The summary should not:

- refuse to summarize
- ask questions
- speak as Mark to the user
- invent missing facts
- say there is not enough information when the conversation contains the facts
- replace exact IDs or numbers with vague wording

## Validation Checks

A compacted output should be checked against the dataset anchors during evaluation.

Minimum checks:

- every `anchors.asset_ids` value appears literally in either `summary` or `preserved_messages`
- each `anchors.critical_facts` item is represented literally or semantically
- no invented asset IDs, dates, metrics, models, or decisions appear
- the output is third-person or neutral, not a user-facing assistant reply

## Practical Rule

When in doubt, ask:

> If Mark does not see this fact later, could it take the wrong next action?

If yes, preserve it. If no, summarize or drop it.

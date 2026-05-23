# HeyMark Compactor

Bun + TypeScript implementation for the HeyMark conversation compaction challenge.

The compactor follows the strategy from `../HEURISTICS.md`:

1. Select messages that must survive verbatim.
2. Ask Claude to summarize the older/lower-risk messages with explicit HeyMark importance heuristics.
3. Run lightweight checklist-style eval checks against dataset anchors after compaction.

This is intentionally not a production memory system. The implementation keeps the challenge scope narrow:

- no embeddings or retrieval index
- no background jobs
- no provider eval platform as a dependency
- no Cassandra/LSM-style storage compaction

The core abstraction is:

```txt
Selector + Summarizer + Verifier
```

The selector preserves recent messages, latest user request, explicit constraints/decisions, important IDs/URLs/metrics, and high-impact tool results. The summarizer compresses the rest into a handoff summary. The verifier is a small deterministic checklist, not a full semantic eval suite.

## Protected References

LLM summaries can drop exact IDs even when they preserve the surrounding story. That is risky for Mark because asset IDs, script IDs, creative session IDs, workspace IDs, and generated-media URLs are often the handle needed to resume work.

After Claude writes the handoff summary, the compactor appends a deterministic `## Protected References` section with exact references extracted from the original conversation. This keeps the prose summary readable while making ID preservation independent from model recall.

The protected section is deliberately narrow: it keeps IDs and generated asset references, not every URL or raw tool payload. Generic web-search links remain summarized by the model unless they are already part of the handoff.

## Setup

```bash
bun install
```

For LLM compaction, create `src/.env` or export:

```bash
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-haiku-4-5
```

Bun loads `.env` automatically.

## Run

```bash
bun run compact -- --conversation analytics-deep-01 --output out/analytics-deep-01.json
```

Options:

```bash
bun run index.ts --help
```

## Output

`compactConversation()` returns the challenge shape plus generation metadata:

```ts
{
  summary: string;
  preserved_messages: ModelMessage[];
  metadata: {
    conversation_id: string;
    profile: string;
    model: string;
    preserved_message_indexes: number[];
    preservation_reasons: Record<number, PreservationReason[]>;
  };
}
```

The CLI adds post-generation evals:

```ts
{
  ...compactionResult,
  evals: {
    passes: boolean;
    risk_level: "low" | "medium" | "high";
    missing_asset_ids: string[];
    missing_critical_fact_markers: string[];
    unsupported_claims: string[];
    warnings: string[];
  };
}
```

`anchors` are only used by evals when present in the dataset; they are not used to generate the summary.

## Why not OpenAI Evals or Anthropic eval tooling?

Provider eval tools are useful for offline prompt testing or grading model outputs, but they do not perform compaction. This project needs a runtime compactor:

```txt
full conversation -> { summary, preserved_messages }
```

So the compactor stays local and explicit. Provider models are used for the summarization step, while the verification step remains a small checklist that catches obvious failures like lost asset IDs, missing critical markers, user-facing reply leakage, and unsupported lifecycle claims.

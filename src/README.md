# HeyMark Compactor

Bun + TypeScript implementation for the HeyMark conversation compaction challenge.

The compactor follows the strategy from `../HEURISTICS.md`:

1. Send the system prompt and full conversation to Claude with explicit HeyMark importance heuristics.
2. Preserve the recent tail messages verbatim.
3. Run lightweight eval checks against dataset anchors after compaction.

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
  };
}
```

The CLI adds post-generation evals:

```ts
{
  ...compactionResult,
  evals: {
    missing_asset_ids: string[];
    warnings: string[];
  };
}
```

`anchors` are only used by evals when present in the dataset; they are not used to generate the summary.

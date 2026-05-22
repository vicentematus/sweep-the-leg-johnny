# Compaction Strategies: Claude Code, Codex, And HeyMark

This note summarizes what we can borrow from Claude Code and Codex for the HeyMark compaction challenge.

It is based on:

- Claude Code public docs
- OpenAI Codex public source code
- The local HeyMark dataset schema and heuristics

## Claude Code

Claude Code treats context as more than chat messages. Its context window includes conversation history, file contents, command outputs, project instructions, auto memory, loaded skills, and system instructions.

Public docs say that when context fills, Claude Code:

- clears older tool outputs first
- summarizes the conversation if needed
- preserves user requests and key code snippets
- may lose detailed early instructions unless they live in persistent project context
- lets users steer compaction with `/compact Focus on ...` or with compaction instructions in `CLAUDE.md`

Important design details:

- `/compact` replaces the conversation history with a structured summary.
- Root `CLAUDE.md`, unscoped rules, and auto memory are re-injected after compaction.
- Path-scoped rules and nested `CLAUDE.md` files can be lost until their matching files are read again.
- Skills are re-injected with explicit token caps.
- A `PreCompact` hook can run before compaction, for example to archive the full transcript.
- Subagents reduce context pressure because their full transcript does not return to the main context; only their final summary does.

Sources:

- https://code.claude.com/docs/en/how-claude-code-works
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/agent-sdk/agent-loop
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/costs

## Codex

Codex has both local and remote compaction paths.

### Local Compaction

The local path is a prompt-based checkpoint summary.

The template says:

> You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

It asks the model to include:

- current progress and key decisions
- important context, constraints, or user preferences
- remaining work
- critical data, examples, or references

Codex then installs the result back into history with a fixed prefix:

> Another language model started to solve this problem and produced a summary of its thinking process...

Implementation observations from `compact.rs`:

- Manual and automatic compaction share the same internal path.
- Pre- and post-compaction hooks can interrupt the operation.
- If compaction itself exceeds the context window, Codex removes the oldest history item and retries.
- After summary generation, Codex collects real user messages and keeps recent/user content under a token budget.
- The replacement history contains selected user messages plus the compaction summary.
- Codex warns that long threads and multiple compactions can reduce model accuracy.

Source:

- https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs
- https://github.com/openai/codex/blob/main/codex-rs/core/templates/compact/prompt.md
- https://github.com/openai/codex/blob/main/codex-rs/core/templates/compact/summary_prefix.md

### Remote Compaction

Codex also has remote compaction paths using provider-supported compaction.

Implementation observations from `compact_remote.rs` and `compact_remote_v2.rs`:

- Codex asks the provider whether remote compaction is supported.
- Remote compaction sends the current prompt/history/tools to a compact endpoint or compact-trigger request.
- Before remote compaction, Codex trims generated function-call history if the request itself is too large.
- Remote output is post-processed before installation.
- Stale or duplicated developer messages are dropped.
- Non-real user wrapper messages are dropped.
- Function calls, tool outputs, web search calls, image generation calls, and reasoning items are dropped from the replacement history.
- User messages, hook prompts, assistant messages, and compaction items can survive.
- The v2 path retains user/developer/system messages first, then filters them, truncating retained message text against a 64K token budget from newest to oldest.
- The resulting replacement history is installed as the live thread state.

Sources:

- https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote.rs
- https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote_v2.rs

## What This Means For HeyMark

Claude Code and Codex both support our proposed direction, but HeyMark needs a domain-specific version.

Shared ideas we should borrow:

- Treat compaction as a handoff summary for the next model turn, not as a human recap.
- Preserve recent user context verbatim.
- Use deterministic cleanup before LLM summarization.
- Drop or compress old tool outputs aggressively.
- Keep persistent/system context separate from compacted conversation state when possible.
- Allow explicit compaction instructions that define what must survive.
- Validate the compacted result before trusting it.

Where HeyMark differs:

- Codex can drop most tool calls because coding tool outputs are often recoverable by re-reading files or rerunning commands.
- Mark cannot blindly drop generated asset IDs, publication IDs, creative IDs, video IDs, script IDs, or campaign state.
- HeyMark tool outputs often contain business state, metrics, generated content, and asset references that must be extracted before dropping raw payloads.

So for HeyMark, the compactor should not just say "drop tool outputs." It should:

1. Parse tool calls.
2. Extract domain anchors from each tool output.
3. Preserve exact IDs and final statuses.
4. Summarize useful conclusions.
5. Drop the raw payload only after the extracted state is represented elsewhere.

## Proposed HeyMark Adaptation

Use a three-layer compaction strategy:

1. Deterministic tool cleaning
   - Replace verbose tool outputs with compact tool summaries.
   - Preserve exact IDs, statuses, metrics, handles, dates, URLs when needed.

2. LLM handoff summary
   - Summarize cleaned older history.
   - Use the dataset-specific heuristics from `HEURISTICS.md`.
   - Write as a neutral session record, not as Mark talking to the user.

3. Validation
   - Check all `anchors.asset_ids` appear literally in the summary or preserved messages.
   - Check `anchors.critical_facts` are represented literally or semantically.
   - Reject obvious bad-summary patterns from `bad_summaries.jsonl`.

## Practical Takeaway

Codex and Claude Code both use compaction as a state replacement mechanism:

> old full context -> structured handoff summary + selected retained context

For HeyMark, the key addition is a domain-aware extraction step before summarization:

> raw marketing/tool history -> extracted business/session state -> compact handoff summary

That extraction layer is where our heuristics matter most.

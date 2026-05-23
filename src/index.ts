import { compactConversation, defaultOptions } from "./compactor";
import { findConversation, readConversations } from "./utils/conversations-loader";
import { evaluateCompaction } from "./evals";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

interface CliArgs {
  datasetPath: string;
  conversation?: string;
  output?: string;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const conversations = await readConversations(args.datasetPath);
  const conversation = findConversation(conversations, args.conversation);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for LLM compaction.");
  }

  const result = await compactConversation(conversation);
  const evals = evaluateCompaction({ conversation, result });
  const output = {
    ...result,
    evals,
  };

  const json = `${JSON.stringify(output, null, 2)}\n`;
  if (args.output) {
    await mkdir(dirname(args.output), { recursive: true });
    await Bun.write(args.output, json);
    console.log(`Wrote compaction for ${conversation.id} to ${args.output}`);
  } else {
    process.stdout.write(json);
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    datasetPath: "../dataset/conversations.jsonl",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--dataset" && next) {
      args.datasetPath = next;
      index += 1;
    } else if (arg === "--conversation" && next) {
      args.conversation = next;
      index += 1;
    } else if (arg === "--output" && next) {
      args.output = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`HeyMark conversation compactor

Usage:
  bun run index.ts [options]

Options:
  --dataset <path>          JSONL dataset path (default: ../dataset/conversations.jsonl)
  --conversation <id|idx>   Conversation id or zero-based index (default: first)
  --output <path>           Write JSON result to a file
  --help                    Show this help

Environment:
  ANTHROPIC_API_KEY         Required for LLM compaction
  ANTHROPIC_MODEL           Default: claude-haiku-4-5
  PRESERVED_TAIL_MESSAGES   Default: ${defaultOptions.preservedTailMessages}
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

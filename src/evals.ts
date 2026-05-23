import type { CompactionResult, ConversationRecord, EvalResult } from "./types/index";

export function evaluateCompaction(input: {
  conversation: ConversationRecord;
  result: CompactionResult;
}): EvalResult {
  const visibleText = `${input.result.summary}\n${JSON.stringify(input.result.preserved_messages)}`;

  const anchorAssetIds = input.conversation.anchors?.asset_ids ?? [];
  const missingAssetIds = anchorAssetIds.filter((id) => !visibleText.includes(id));

  const warnings: string[] = [];
  if (/\b(no tengo|no hay suficiente|no queda claro|cannot|can't|unable to summarize|no puedo|insufficient context|not enough (?:info|information))\b/i.test(input.result.summary)) {
    warnings.push("summary may contain self-refusal or gap acknowledgment language");
  }
  if (/\b(te|tu|tus|dime|quieres|quieres que|listo|perfecto|te dejo|te aviso|puedo ayudarte)\b/i.test(input.result.summary.slice(0, 600))) {
    warnings.push("summary may sound like a user-facing assistant reply");
  }
  if (/[?¿]\s*$/.test(input.result.summary.trim())) {
    warnings.push("summary ends with a question, which suggests agent-reply leakage");
  }
  if (/\b(I generated|I created|I will|we generated|we created|my recommendation|our next step)\b/i.test(input.result.summary.slice(0, 600)) ||
    /\b(yo genere|yo generé|voy a|te voy|mi recomendacion|mi recomendación|nuestro siguiente paso)\b/i.test(input.result.summary.slice(0, 600))) {
    warnings.push("summary may use first-person language instead of neutral handoff language");
  }

  const requiredSections = [
    "## Client / Business",
    "## Brand / Strategy",
    "## Assets",
    "## Decisions",
    "## Tool Results",
    "## Pending State",
  ];
  const missingSections = requiredSections.filter((section) => !input.result.summary.includes(section));
  if (missingSections.length > 0) {
    warnings.push(`summary is missing expected sections: ${missingSections.join(", ")}`);
  }

  return {
    missing_asset_ids: missingAssetIds,
    warnings,
  };
}

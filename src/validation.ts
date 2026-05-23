import type { ConversationRecord, ValidationResult } from "./types";

export function validateCompaction(input: {
  conversation: ConversationRecord;
  summary: string;
  preservedMessages: unknown[];
}): ValidationResult {
  const preservedText = JSON.stringify(input.preservedMessages);
  const visibleText = `${input.summary}\n${preservedText}`;

  const anchorAssetIds = input.conversation.anchors?.asset_ids ?? [];
  const missingAssetIds = anchorAssetIds.filter((id) => !visibleText.includes(id));
  const criticalFacts = input.conversation.anchors?.critical_facts ?? [];
  const possiblyMissingCriticalFacts = criticalFacts.filter((fact) => !criticalFactLooksCovered(fact, visibleText));

  const warnings: string[] = [];
  if (/\b(no tengo|no hay suficiente|no queda claro|cannot|can't|unable to summarize|no puedo|insufficient context|not enough (?:info|information))\b/i.test(input.summary)) {
    warnings.push("summary may contain self-refusal or gap acknowledgment language");
  }
  if (/\b(te|tu|tus|dime|quieres|quieres que|listo|perfecto|te dejo|te aviso|puedo ayudarte)\b/i.test(input.summary.slice(0, 600))) {
    warnings.push("summary may sound like a user-facing assistant reply");
  }
  if (/[?¿]\s*$/.test(input.summary.trim())) {
    warnings.push("summary ends with a question, which suggests agent-reply leakage");
  }
  if (/\b(I generated|I created|I will|we generated|we created|my recommendation|our next step)\b/i.test(input.summary.slice(0, 600)) ||
    /\b(yo genere|yo generé|voy a|te voy|mi recomendacion|mi recomendación|nuestro siguiente paso)\b/i.test(input.summary.slice(0, 600))) {
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
  const missingSections = requiredSections.filter((section) => !input.summary.includes(section));
  if (missingSections.length > 0) {
    warnings.push(`summary is missing expected sections: ${missingSections.join(", ")}`);
  }

  return {
    missing_asset_ids: missingAssetIds,
    possibly_missing_critical_facts: possiblyMissingCriticalFacts,
    warnings,
  };
}

function criticalFactLooksCovered(fact: string, visibleText: string): boolean {
  if (visibleText.includes(fact)) return true;

  const normalizedVisible = normalizeForCoverage(visibleText);
  const tokens = normalizeForCoverage(fact)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  const distinctiveTokens = tokens.filter((token) =>
    /\d/.test(token) ||
    token.startsWith("@") ||
    token.length >= 7 ||
    /^[a-z]+_[a-z0-9]+$/.test(token)
  );

  const requiredTokens = distinctiveTokens.length > 0 ? distinctiveTokens : tokens.slice(0, 4);
  if (requiredTokens.length === 0) return true;

  const covered = requiredTokens.filter((token) => normalizedVisible.includes(token));
  return covered.length / requiredTokens.length >= 0.5;
}

function normalizeForCoverage(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}@_./:-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "para",
  "with",
  "from",
  "that",
  "this",
  "mark",
  "cliente",
  "client",
  "usuario",
  "user",
  "final",
  "debe",
  "should",
  "sobre",
  "after",
  "before",
  "como",
  "esta",
  "este",
  "the",
  "and",
  "los",
  "las",
  "una",
  "uno",
]);

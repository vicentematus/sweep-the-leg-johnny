import type { CompactionResult, ConversationRecord, EvalResult } from "./types/index";

export function evaluateCompaction(input: {
  conversation: ConversationRecord;
  result: CompactionResult;
}): EvalResult {
  const visibleText = `${input.result.summary}\n${JSON.stringify(input.result.preserved_messages)}`;

  const anchorAssetIds = input.conversation.anchors?.asset_ids ?? [];
  const missingAssetIds = anchorAssetIds.filter((id) => !visibleText.includes(id));
  const criticalFacts = input.conversation.anchors?.critical_facts ?? [];
  const missingCriticalFactMarkers = criticalFacts.filter((fact) => {
    const markers = extractFactMarkers(fact);
    return markers.length > 0 && markers.every((marker) => !visibleText.includes(marker));
  });

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

  const unsupportedClaims = findUnsupportedClaims(input.result.summary);
  const riskLevel = getRiskLevel({
    missingAssetIds,
    missingCriticalFactMarkers,
    unsupportedClaims,
    warnings,
  });

  return {
    passes: riskLevel === "low",
    risk_level: riskLevel,
    missing_asset_ids: missingAssetIds,
    missing_critical_fact_markers: missingCriticalFactMarkers,
    unsupported_claims: unsupportedClaims,
    warnings,
  };
}

function extractFactMarkers(fact: string): string[] {
  const markerPatterns = [
    /@[a-z0-9_.]+/gi,
    /\b(?:uuid|ws|brd|cnv|wgt)_[a-z0-9_]+\b/gi,
    /\b[a-f0-9]{8}\b/gi,
    /\b\d+(?:\.\d+)?%\b/g,
    /#[0-9a-f]{6}\b/gi,
  ];

  return Array.from(
    new Set(markerPatterns.flatMap((pattern) => fact.match(pattern) ?? [])),
  );
}

function findUnsupportedClaims(summary: string): string[] {
  const claims: string[] = [];

  if (/\b(scheduled|programad[oa])\b/i.test(summary) &&
    !/\bpublication_id|schedule_publication|scheduled_for\b/i.test(summary)) {
    claims.push("summary claims scheduling without an explicit publication marker");
  }

  const lifecycleConflict = summary
    .split(/(?<=[.!?。])\s+|\n+/)
    .find((sentence) =>
      /\b(approved|aprobado|aprobada|ready|list[oa])\b/i.test(sentence) &&
      /\b(processing|queued|draft|procesando|en cola|borrador|generating)\b/i.test(sentence)
    );
  if (lifecycleConflict) {
    claims.push("summary mixes completed and pending asset lifecycle language in one statement");
  }

  return claims;
}

function getRiskLevel(input: {
  missingAssetIds: string[];
  missingCriticalFactMarkers: string[];
  unsupportedClaims: string[];
  warnings: string[];
}): EvalResult["risk_level"] {
  if (input.missingAssetIds.length > 0 || input.unsupportedClaims.length > 0) {
    return "high";
  }

  if (input.missingCriticalFactMarkers.length > 0 || input.warnings.length > 0) {
    return "medium";
  }

  return "low";
}

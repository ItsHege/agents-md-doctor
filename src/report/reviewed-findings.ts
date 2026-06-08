import { createHash } from "node:crypto";
import type { Finding } from "../types/index.js";

export type ReviewedFindingStatus = "intentional" | "false_positive" | "accepted_risk";

export interface ReviewedFindingConfig {
  fingerprint: string;
  status: ReviewedFindingStatus;
  note?: string;
  ruleId?: string;
  file?: string;
  message?: string;
  createdAt?: string;
}

const FINGERPRINT_PREFIX = "adf_v1_";

export function buildFindingFingerprint(finding: Finding): string {
  const stablePayload = {
    ruleId: finding.ruleId,
    file: finding.file ?? "",
    key: buildStableFindingKey(finding),
    message: buildFingerprintMessage(finding)
  };
  const hash = createHash("sha256").update(stableStringify(stablePayload)).digest("hex").slice(0, 24);
  return `${FINGERPRINT_PREFIX}${hash}`;
}

export function attachFindingFingerprints(findings: Finding[]): Finding[] {
  return findings.map((finding) => attachFindingFingerprint(finding));
}

export function applyReviewedFindings(findings: Finding[], reviewedFindings: ReviewedFindingConfig[]): Finding[] {
  if (reviewedFindings.length === 0) {
    return attachFindingFingerprints(findings);
  }

  const reviewedByFingerprint = new Map(reviewedFindings.map((entry) => [entry.fingerprint, entry]));

  return findings.map((finding) => {
    const withFingerprint = attachFindingFingerprint(finding);
    const fingerprint = getFindingFingerprint(withFingerprint);
    if (!fingerprint) {
      return withFingerprint;
    }
    const reviewed = reviewedByFingerprint.get(fingerprint);

    if (!reviewed) {
      return withFingerprint;
    }

    return {
      ...withFingerprint,
      severity: "info",
      details: {
        ...(withFingerprint.details ?? {}),
        reviewedFinding: {
          fingerprint,
          status: reviewed.status,
          ...(reviewed.note ? { note: reviewed.note } : {})
        }
      }
    };
  });
}

function attachFindingFingerprint(finding: Finding): Finding {
  const fingerprint = getFindingFingerprint(finding) ?? buildFindingFingerprint(finding);
  return {
    ...finding,
    details: {
      ...(finding.details ?? {}),
      fingerprint
    }
  };
}

function getFindingFingerprint(finding: Finding): string | undefined {
  return typeof finding.details?.fingerprint === "string" ? finding.details.fingerprint : undefined;
}

function buildStableFindingKey(finding: Finding): Record<string, unknown> {
  const details = finding.details ?? {};
  const key: Record<string, unknown> = {};

  for (const property of [
    "reference",
    "reason",
    "scriptName",
    "targetName",
    "source",
    "contextKind",
    "activeFileCount",
    "latestCandidate",
    "signalId",
    "riskKind",
    "patternVersion"
  ]) {
    if (typeof details[property] === "string" || typeof details[property] === "number") {
      key[property] = details[property];
    }
  }

  for (const property of ["missingHeadings", "requiredHeadings", "matchedTokens", "matchedTokenKinds", "relatedFiles"]) {
    if (Array.isArray(details[property])) {
      key[property] = details[property]
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalizeText)
        .sort();
    }
  }

  if (Object.keys(key).length > 0) {
    return key;
  }

  return {
    line: finding.line ?? 1
  };
}

function buildFingerprintMessage(finding: Finding): string {
  if (finding.ruleId === "context.stale_plan_file") {
    return "";
  }

  if (finding.ruleId === "context.overlapping_plan_files") {
    return "planning files overlap";
  }

  return normalizeText(finding.message);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

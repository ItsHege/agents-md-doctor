import fs from "node:fs";
import path from "node:path";
import { extractMarkdownElements } from "../../core/markdown.js";
import { isPathInsideRoot } from "../../path-utils.js";
import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const pathReferenceMissingRuleDefinition: RuleDefinition = {
  id: "paths.reference_missing",
  category: "paths",
  defaultSeverity: "warning",
  title: "Missing reference path",
  description: "Reports path references in AGENTS.md that do not exist in the repository."
};

export interface CheckPathReferencesOptions {
  root: string;
  fileAbsolutePath: string;
  fileRelativePath: string;
  content: string;
  severity?: Severity;
}

export function checkPathReferences(options: CheckPathReferencesOptions): Finding[] {
  const elements = extractMarkdownElements(options.content);
  const candidates = [
    ...elements.filter((element) => element.type === "link").map((element) => ({
      path: sanitizeLinkPath(element.url),
      line: element.location.line
    })),
    ...elements
      .filter((element) => element.type === "inlineCode")
      .map((element) => ({
        path: sanitizeInlinePath(element.value),
        line: element.location.line
      }))
  ]
    .filter((candidate): candidate is { line: number; path: string } => candidate.path !== null)
    .filter((candidate) => !isPlaceholderPathReference(candidate.path));

  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const dedupeKey = `${candidate.path}:${candidate.line}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    const resolvedPath = resolveCandidatePath(options.root, options.fileAbsolutePath, candidate.path);

    if (!isPathInsideRoot(options.root, resolvedPath)) {
      findings.push({
        ruleId: pathReferenceMissingRuleDefinition.id,
        severity: options.severity ?? pathReferenceMissingRuleDefinition.defaultSeverity,
        message: `${options.fileRelativePath} references a path outside the repo: ${candidate.path}.`,
        file: options.fileRelativePath,
        line: candidate.line,
        details: {
          reference: candidate.path,
          reason: "outside_repo"
        }
      });
      continue;
    }

    if (!fs.existsSync(resolvedPath)) {
      findings.push({
        ruleId: pathReferenceMissingRuleDefinition.id,
        severity: options.severity ?? pathReferenceMissingRuleDefinition.defaultSeverity,
        message: `${options.fileRelativePath} references a missing path: ${candidate.path}.`,
        file: options.fileRelativePath,
        line: candidate.line,
        details: {
          reference: candidate.path,
          reason: "not_found"
        }
      });
    }
  }

  return findings;
}

function sanitizeLinkPath(rawUrl: string): string | null {
  if (
    rawUrl.startsWith("#") ||
    rawUrl.startsWith("http://") ||
    rawUrl.startsWith("https://") ||
    rawUrl.startsWith("mailto:")
  ) {
    return null;
  }

  const withoutFragment = rawUrl.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  const trimmed = withoutQuery.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function sanitizeInlinePath(value: string): string | null {
  const trimmed = value.trim();

  if (!looksLikePath(trimmed)) {
    return null;
  }

  return trimmed;
}

function looksLikePath(value: string): boolean {
  if (value.includes(" ")) {
    return false;
  }

  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return true;
  }

  if (value.includes("/") || value.includes("\\")) {
    return true;
  }

  return /\.(md|txt|json|yaml|yml|toml|ts|tsx|js|mjs|cjs|sh|ps1|py)$/i.test(value);
}

function resolveCandidatePath(root: string, fileAbsolutePath: string, referencePath: string): string {
  if (referencePath.startsWith("/")) {
    return path.resolve(root, `.${referencePath}`);
  }

  return path.resolve(path.dirname(fileAbsolutePath), referencePath);
}

function isPlaceholderPathReference(referencePath: string): boolean {
  const normalized = referencePath.replace(/\\/g, "/").trim();
  const lowered = normalized.toLowerCase();

  if (
    normalized.length === 0 ||
    normalized === "*" ||
    normalized.includes("*") ||
    normalized.includes("...") ||
    lowered.includes("your_path")
  ) {
    return true;
  }

  if (lowered.startsWith("path/to/") || lowered.startsWith("/path/to/")) {
    return true;
  }

  if (/<[^>]+>/.test(normalized)) {
    return true;
  }

  if (/\{[^}]+\}/.test(normalized)) {
    return true;
  }

  if (/\[[^\]]+\]/.test(normalized)) {
    return true;
  }

  return false;
}

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

const OPTIONALITY_MARKERS = ["if present", "if available", "if it exists", "when available", "optional"];

export function checkPathReferences(options: CheckPathReferencesOptions): Finding[] {
  const root = fs.existsSync(options.root)
    ? fs.realpathSync.native(path.resolve(options.root))
    : path.resolve(options.root);
  const elements = extractMarkdownElements(options.content);
  const contentLines = options.content.split(/\r?\n/);
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
    const resolvedPath = resolveCandidatePath(root, options.fileAbsolutePath, candidate.path);

    if (!isPathInsideRoot(root, resolvedPath)) {
      if (lineHasOptionalityMarker(contentLines, candidate.line)) {
        continue;
      }

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
      if (lineHasOptionalityMarker(contentLines, candidate.line)) {
        continue;
      }

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
      continue;
    }

    let realPath: string;
    try {
      realPath = fs.realpathSync.native(resolvedPath);
    } catch {
      if (lineHasOptionalityMarker(contentLines, candidate.line)) {
        continue;
      }

      findings.push({
        ruleId: pathReferenceMissingRuleDefinition.id,
        severity: options.severity ?? pathReferenceMissingRuleDefinition.defaultSeverity,
        message: `${options.fileRelativePath} references an unreadable path: ${candidate.path}.`,
        file: options.fileRelativePath,
        line: candidate.line,
        details: {
          reference: candidate.path,
          reason: "unreadable"
        }
      });
      continue;
    }

    if (!isPathInsideRoot(root, realPath)) {
      if (lineHasOptionalityMarker(contentLines, candidate.line)) {
        continue;
      }

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
    }
  }

  return findings;
}

function sanitizeLinkPath(rawUrl: string): string | null {
  const trimmedRaw = rawUrl.trim();

  if (
    trimmedRaw.startsWith("#") ||
    trimmedRaw.startsWith("http://") ||
    trimmedRaw.startsWith("https://") ||
    trimmedRaw.startsWith("mailto:") ||
    trimmedRaw.startsWith("//") ||
    isDomainLikeReference(trimmedRaw)
  ) {
    return null;
  }

  const withoutFragment = trimmedRaw.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  const trimmed = withoutQuery.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

function sanitizeInlinePath(value: string): string | null {
  const trimmed = value.trim();

  if (isLikelySystemAbsolutePath(trimmed)) {
    return null;
  }

  if (isLikelyModuleSpecifier(trimmed)) {
    return null;
  }

  if (!looksLikePath(trimmed)) {
    return null;
  }

  return trimmed;
}

function looksLikePath(value: string): boolean {
  if (value.includes(" ")) {
    return false;
  }

  if (/^\.[A-Za-z0-9]+$/.test(value)) {
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

const COMMON_FILESYSTEM_ROOT_SEGMENTS = new Set([
  "app",
  "apps",
  "asset",
  "assets",
  "bin",
  "config",
  "configs",
  "content",
  "doc",
  "docs",
  "example",
  "examples",
  "lib",
  "package",
  "packages",
  "public",
  "script",
  "scripts",
  "src",
  "test",
  "tests",
  "tool",
  "tools"
]);

function isLikelyModuleSpecifier(value: string): boolean {
  if (value.includes(" ") || value.includes("\\")) {
    return false;
  }

  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return false;
  }

  const normalized = value.trim();

  if (/^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(normalized)) {
    return true;
  }

  if (!normalized.includes("/")) {
    return false;
  }

  const segments = normalized.split("/");

  if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
    return false;
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  if (segments.some((segment) => segment.includes("."))) {
    return false;
  }

  if (COMMON_FILESYSTEM_ROOT_SEGMENTS.has(segments[0]?.toLowerCase() ?? "")) {
    return false;
  }

  return segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment));
}

function isLikelySystemAbsolutePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").trim().toLowerCase();

  if (normalized.startsWith("%") && normalized.includes("%")) {
    return true;
  }

  if (/^\$[a-z_][a-z0-9_]*\//.test(normalized)) {
    return true;
  }

  const linuxSystemPrefixes = [
    "/etc/",
    "/usr/",
    "/var/",
    "/tmp/",
    "/proc/",
    "/sys/",
    "/dev/",
    "/home/",
    "/root/",
    "/opt/",
    "/mnt/",
    "/sbin/",
    "/bin/"
  ];

  if (linuxSystemPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  if (/^[a-z]:\//.test(normalized)) {
    return true;
  }

  return false;
}

function isDomainLikeReference(value: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(value);
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

function lineHasOptionalityMarker(lines: string[], line: number): boolean {
  const rawLine = lines[line - 1];

  if (typeof rawLine !== "string") {
    return false;
  }

  const normalized = rawLine.toLowerCase();
  return OPTIONALITY_MARKERS.some((marker) => normalized.includes(marker));
}

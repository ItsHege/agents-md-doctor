import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import type { ResolvedPromptInjectionConfig } from "../../config/index.js";
import { extractMarkdownElements } from "../../core/markdown.js";
import { isAppError } from "../../errors.js";
import { readTextFileWithinRoot } from "../../io/index.js";
import { normalizeRelativePath } from "../../path-utils.js";
import type { Finding, RuleDefinition } from "../../types/index.js";

interface PromptInjectionOptions {
  root: string;
  config: ResolvedPromptInjectionConfig;
  ignore?: string[];
  scanCodeBlocks?: boolean;
  maxDirectoryEntries?: number;
  maxDepth?: number;
}

interface PromptInjectionCandidate {
  absolutePath: string;
  relativePath: string;
}

interface ScanLine {
  line: number;
  text: string;
  textKind: "prose" | "code";
}

interface PromptInjectionSignal {
  rule: RuleDefinition;
  patternId: string;
  riskKind: "instruction_override" | "secret_request" | "external_transfer" | "untrusted_execution";
  pattern: RegExp;
  confidence: "high" | "medium";
  suggestedAction: "remove_or_rewrite" | "review";
}

interface ScanState {
  visitedEntries: number;
  maxDirectoryEntries: number;
  maxDepth: number;
  truncated: boolean;
  skippedFiles: Array<{ file: string; reason: string }>;
}

const DEFAULT_MAX_DIRECTORY_ENTRIES = 500_000;
const MAX_SKIPPED_FILES_REPORTED = 25;
const MAX_FINDINGS_PER_FILE = 10;
const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);

export const promptInjectionOverrideRuleDefinition: RuleDefinition = {
  id: "security.prompt_injection_override",
  category: "security",
  defaultSeverity: "warning",
  title: "Prompt injection instruction override",
  description: "High-confidence text asks an agent to ignore or override higher-priority instructions."
};

export const promptInjectionSecretRequestRuleDefinition: RuleDefinition = {
  id: "security.prompt_injection_secret_request",
  category: "security",
  defaultSeverity: "warning",
  title: "Prompt injection secret request",
  description: "High-confidence text asks an agent to reveal prompts, secrets, credentials, or private context."
};

export const promptInjectionExternalTransferRuleDefinition: RuleDefinition = {
  id: "security.prompt_injection_external_transfer",
  category: "security",
  defaultSeverity: "warning",
  title: "Prompt injection external transfer",
  description: "High-confidence text asks an agent to send sensitive context to an external endpoint."
};

export const promptInjectionUntrustedExecutionRuleDefinition: RuleDefinition = {
  id: "security.prompt_injection_untrusted_execution",
  category: "security",
  defaultSeverity: "warning",
  title: "Prompt injection untrusted execution",
  description: "Text asks an agent to execute commands supplied by untrusted prompt or remote content."
};

export const promptInjectionSummaryRuleDefinition: RuleDefinition = {
  id: "security.prompt_injection_summary",
  category: "security",
  defaultSeverity: "info",
  title: "Prompt injection audit summary",
  description: "Summarizes files scanned by the opt-in prompt injection audit."
};

export const promptInjectionRuleDefinitions: RuleDefinition[] = [
  promptInjectionOverrideRuleDefinition,
  promptInjectionSecretRequestRuleDefinition,
  promptInjectionExternalTransferRuleDefinition,
  promptInjectionUntrustedExecutionRuleDefinition,
  promptInjectionSummaryRuleDefinition
];

const signals: PromptInjectionSignal[] = [
  {
    rule: promptInjectionOverrideRuleDefinition,
    patternId: "ignore_higher_priority_instructions",
    riskKind: "instruction_override",
    pattern:
      /\b(?:ignore|disregard|override|bypass)\s+(?:all\s+)?(?:(?:previous|prior|above)(?:\s+(?:system|developer|higher[-\s]?priority))?|system|developer|higher[-\s]?priority)\s+(?:instructions?|rules?|messages?|prompts?)\b/iu,
    confidence: "high",
    suggestedAction: "remove_or_rewrite"
  },
  {
    rule: promptInjectionOverrideRuleDefinition,
    patternId: "role_reassignment",
    riskKind: "instruction_override",
    pattern: /\byou\s+are\s+now\s+(?:the\s+)?(?:system|developer|admin|root|owner)\b/iu,
    confidence: "medium",
    suggestedAction: "review"
  },
  {
    rule: promptInjectionSecretRequestRuleDefinition,
    patternId: "reveal_hidden_prompt",
    riskKind: "secret_request",
    pattern:
      /\b(?:reveal|print|show|dump|expose|return)\s+(?:your\s+|the\s+)?(?:system|developer|hidden)\s+(?:prompt|instructions?|messages?|policy)\b/iu,
    confidence: "high",
    suggestedAction: "remove_or_rewrite"
  },
  {
    rule: promptInjectionSecretRequestRuleDefinition,
    patternId: "dump_credentials",
    riskKind: "secret_request",
    pattern:
      /\b(?:read|print|dump|exfiltrate|leak|show)\s+(?:the\s+)?(?:\.env|env(?:ironment)?\s+variables?|secrets?|tokens?|api[-\s]?keys?|credentials?)\b/iu,
    confidence: "high",
    suggestedAction: "remove_or_rewrite"
  },
  {
    rule: promptInjectionExternalTransferRuleDefinition,
    patternId: "send_sensitive_context_external",
    riskKind: "external_transfer",
    pattern:
      /\b(?:send|upload|post|exfiltrate|leak)\b.{0,80}\b(?:secrets?|tokens?|credentials?|system\s+prompt|developer\s+instructions?|repo\s+context|private\s+context)\b.{0,80}\b(?:https?:\/\/|webhook|external|remote|server|endpoint)\b/iu,
    confidence: "high",
    suggestedAction: "remove_or_rewrite"
  },
  {
    rule: promptInjectionExternalTransferRuleDefinition,
    patternId: "network_exfiltration_command",
    riskKind: "external_transfer",
    pattern:
      /\b(?:curl|wget|invoke-webrequest|iwr)\b.{0,120}\b(?:secrets?|tokens?|credentials?|\.env|system\s+prompt|developer\s+instructions?)\b/iu,
    confidence: "medium",
    suggestedAction: "review"
  },
  {
    rule: promptInjectionUntrustedExecutionRuleDefinition,
    patternId: "execute_untrusted_prompt_commands",
    riskKind: "untrusted_execution",
    pattern:
      /\b(?:run|execute)\s+(?:any|all|the)\s+commands?\s+(?:that\s+)?(?:i|the\s+prompt|remote\s+content|the\s+remote\s+content|the\s+webpage)\s+(?:provide|provides|gives?|tells?|requests?)\b/iu,
    confidence: "high",
    suggestedAction: "remove_or_rewrite"
  },
  {
    rule: promptInjectionUntrustedExecutionRuleDefinition,
    patternId: "fetch_and_execute",
    riskKind: "untrusted_execution",
    pattern: /\b(?:download|fetch|retrieve)\b.{0,80}\b(?:and\s+)?(?:execute|run)\b/iu,
    confidence: "medium",
    suggestedAction: "review"
  }
];

export function checkPromptInjection(options: PromptInjectionOptions): Finding[] {
  const scanCodeBlocks = options.scanCodeBlocks ?? options.config.scanCodeBlocks;
  const scanState: ScanState = {
    visitedEntries: 0,
    maxDirectoryEntries: options.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
    maxDepth: options.maxDepth ?? options.config.maxDepth,
    truncated: false,
    skippedFiles: []
  };
  const candidates = findPromptInjectionCandidates(options.root, {
    include: options.config.include,
    ignore: [...options.config.ignore, ...(options.ignore ?? [])],
    maxFilesScanned: options.config.maxFilesScanned,
    state: scanState
  });
  const findings: Finding[] = [];
  let scannedFileCount = 0;

  for (const candidate of candidates) {
    const fileFindings = scanPromptInjectionCandidate(options.root, candidate, options.config, scanState, scanCodeBlocks);
    if (fileFindings !== null) {
      scannedFileCount += 1;
      findings.push(...fileFindings);
    }
  }

  return [
    {
      ruleId: promptInjectionSummaryRuleDefinition.id,
      severity: "info",
      message: `Prompt injection audit scanned ${scannedFileCount} instruction surface${scannedFileCount === 1 ? "" : "s"}.`,
      file: candidates[0]?.relativePath,
      line: 1,
      details: {
        markdownFileCount: candidates.length,
        scannedFileCount,
        findingCount: findings.length,
        scanCodeBlocks,
        truncated: scanState.truncated,
        skippedFiles: scanState.skippedFiles
      }
    },
    ...findings
  ];
}

function findPromptInjectionCandidates(
  root: string,
  options: { include: string[]; ignore: string[]; maxFilesScanned: number; state: ScanState }
): PromptInjectionCandidate[] {
  const candidates: PromptInjectionCandidate[] = [];
  const includeMatchers = options.include.flatMap(createGlobMatchers);
  const ignoreMatchers = options.ignore.map((pattern) => picomatch(pattern.replace(/\\/g, "/"), { dot: true }));

  walkDirectory(
    path.resolve(root),
    path.resolve(root),
    candidates,
    includeMatchers,
    ignoreMatchers,
    options.maxFilesScanned,
    options.state,
    0
  );

  return candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walkDirectory(
  root: string,
  directory: string,
  candidates: PromptInjectionCandidate[],
  includeMatchers: Array<(relativePath: string) => boolean>,
  ignoreMatchers: Array<(relativePath: string) => boolean>,
  maxFilesScanned: number,
  state: ScanState,
  depth: number
): void {
  if (state.truncated || depth > state.maxDepth) {
    state.truncated = true;
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    state.visitedEntries += 1;
    if (state.visitedEntries > state.maxDirectoryEntries) {
      state.truncated = true;
      return;
    }

    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (matchesAny(ignoreMatchers, relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        walkDirectory(root, absolutePath, candidates, includeMatchers, ignoreMatchers, maxFilesScanned, state, depth + 1);
      }
      continue;
    }

    if (!entry.isFile() || !matchesAny(includeMatchers, relativePath)) {
      continue;
    }

    if (candidates.length >= maxFilesScanned) {
      state.truncated = true;
      return;
    }

    candidates.push({
      absolutePath,
      relativePath
    });
  }
}

function scanPromptInjectionCandidate(
  root: string,
  candidate: PromptInjectionCandidate,
  config: ResolvedPromptInjectionConfig,
  state: ScanState,
  scanCodeBlocks: boolean
): Finding[] | null {
  let content: string;

  try {
    content = readTextFileWithinRoot({
      root,
      filePath: candidate.absolutePath,
      maxBytes: config.maxFileSizeKb * 1024
    });
  } catch (error) {
    recordSkippedFile(state, candidate.relativePath, isAppError(error) ? error.code : "unreadable_file");
    return null;
  }

  const findings: Finding[] = [];
  const scanLines = buildScanLines(content, scanCodeBlocks);
  const seenSignals = new Set<string>();

  for (const line of scanLines) {
    for (const signal of signals) {
      const match = signal.pattern.exec(line.text);
      if (!match || isNegatedMatch(line.text, match.index)) {
        continue;
      }

      const seenKey = `${signal.patternId}:${line.line}`;
      if (seenSignals.has(seenKey)) {
        continue;
      }

      findings.push(buildPromptInjectionFinding(candidate.relativePath, line, signal, match[0], scanCodeBlocks));
      seenSignals.add(seenKey);

      if (findings.length >= MAX_FINDINGS_PER_FILE) {
        return findings;
      }
    }
  }

  return findings;
}

function buildPromptInjectionFinding(
  relativePath: string,
  line: ScanLine,
  signal: PromptInjectionSignal,
  matchedText: string,
  scanCodeBlocks: boolean
): Finding {
  return {
    ruleId: signal.rule.id,
    severity: signal.rule.defaultSeverity,
    message: `${relativePath} contains a high-risk prompt-injection pattern: ${signal.patternId}.`,
    file: relativePath,
    line: line.line,
    details: {
      signalId: signal.patternId,
      patternId: signal.patternId,
      riskKind: signal.riskKind,
      matchedText: matchedText.trim(),
      matchedTextKind: line.textKind,
      instructionSurface: classifyInstructionSurface(relativePath),
      confidence: signal.confidence,
      scanCodeBlocks,
      patternVersion: "prompt-injection-v1",
      suggestedAction: signal.suggestedAction,
      cleanupRequest:
        signal.suggestedAction === "remove_or_rewrite"
          ? `Review ${relativePath}:${line.line}. Remove or rewrite this prompt-injection style instruction so it cannot ask an agent to ignore higher-priority instructions, reveal private context, or send sensitive data elsewhere.`
          : `Review ${relativePath}:${line.line}. Confirm whether this is a safe example or accidental prompt-injection style instruction; mark reviewed only when intentional.`
    }
  };
}

function buildScanLines(content: string, scanCodeBlocks: boolean): ScanLine[] {
  const lines = content.split(/\r?\n/u);
  const codeLines = findFencedCodeLines(content);
  const scanLines: ScanLine[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const inCode = codeLines.has(lineNumber);
    if (inCode && !scanCodeBlocks) {
      continue;
    }

    const text = scanCodeBlocks ? rawLine : stripInlineCode(rawLine);
    if (text.trim().length === 0) {
      continue;
    }

    scanLines.push({
      line: lineNumber,
      text,
      textKind: inCode ? "code" : "prose"
    });
  }

  return scanLines;
}

function findFencedCodeLines(content: string): Set<number> {
  const codeLines = new Set<number>();

  try {
    for (const element of extractMarkdownElements(content)) {
      if (element.type !== "code") {
        continue;
      }

      for (let line = element.location.line; line <= element.location.endLine; line += 1) {
        codeLines.add(line);
      }
    }
  } catch {
    return codeLines;
  }

  return codeLines;
}

function stripInlineCode(line: string): string {
  return line.replace(/`[^`\r\n]+`/gu, "");
}

function isNegatedMatch(line: string, index: number): boolean {
  const before = line.slice(Math.max(0, index - 40), index).toLowerCase();
  return /\b(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't)\s*$/u.test(before);
}

function classifyInstructionSurface(relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (normalizedPath.endsWith("/AGENTS.md") || normalizedPath === "AGENTS.md") {
    return "AGENTS.md";
  }

  if (normalizedPath.endsWith("/CLAUDE.md") || normalizedPath === "CLAUDE.md") {
    return "CLAUDE.md";
  }

  if (normalizedPath.endsWith("/GEMINI.md") || normalizedPath === "GEMINI.md") {
    return "GEMINI.md";
  }

  if (normalizedPath.startsWith(".cursor/") || normalizedPath.includes("/.cursor/")) {
    return "Cursor rules";
  }

  if (normalizedPath.startsWith(".github/") || normalizedPath.includes("/.github/")) {
    return "GitHub instruction surface";
  }

  return "configured prompt-injection include";
}

function recordSkippedFile(state: ScanState, file: string, reason: string): void {
  if (state.skippedFiles.length >= MAX_SKIPPED_FILES_REPORTED) {
    return;
  }

  state.skippedFiles.push({
    file,
    reason
  });
}

function matchesAny(matchers: Array<(relativePath: string) => boolean>, relativePath: string): boolean {
  return matchers.some((matches) => matches(relativePath));
}

function createGlobMatchers(pattern: string): Array<(relativePath: string) => boolean> {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const matchers = [picomatch(normalizedPattern, { dot: true })];

  if (normalizedPattern.startsWith("**/")) {
    matchers.push(picomatch(normalizedPattern.slice(3), { dot: true }));
  }

  return matchers;
}

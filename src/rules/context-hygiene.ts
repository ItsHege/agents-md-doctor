import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import type { ResolvedContextHygieneConfig } from "../config/index.js";
import { extractMarkdownElements } from "../core/markdown.js";
import { isAppError } from "../errors.js";
import { readTextFileWithinRoot } from "../io/index.js";
import { normalizeRelativePath } from "../path-utils.js";
import type { Finding, RuleDefinition } from "../types/index.js";

interface ContextHygieneOptions {
  root: string;
  config: ResolvedContextHygieneConfig;
  ignore?: string[];
  staleAfterDays?: number;
  now?: Date;
  maxDirectoryEntries?: number;
  maxDepth?: number;
}

interface MarkdownCandidate {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
}

interface PlanningFile {
  absolutePath: string;
  relativePath: string;
  content: string;
  mtimeMs: number;
  matchedSignals: string[];
  line: number;
  strongTokens: string[];
  strongTokenKinds: Record<string, StrongTokenKind>;
  isPublicScope: boolean;
  contextKind: PlanningContextKind;
}

type StrongTokenKind = "version" | "slug" | "heading";
type PlanningContextKind = "active" | "archive" | "evidence" | "skill_mirror" | "snapshot";

interface ScanState {
  visitedEntries: number;
  maxDirectoryEntries: number;
  maxDepth: number;
  truncated: boolean;
  skippedFiles: Array<{ file: string; reason: string }>;
}

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const DEFAULT_MAX_DIRECTORY_ENTRIES = 500_000;
const DEFAULT_MAX_DEPTH = 40;
const MAX_SKIPPED_FILES_REPORTED = 25;
const MAX_OVERLAP_FINDINGS = 20;
const MAX_RELATED_FILES_PER_OVERLAP = 8;

const pathSignals = [
  { label: "plan", pattern: /\bplan(?:ning)?\b/iu },
  { label: "roadmap", pattern: /\broadmap\b/iu },
  { label: "todo", pattern: /\btodo\b/iu },
  { label: "next", pattern: /\bnext\b/iu },
  { label: "backlog", pattern: /\bbacklog\b/iu },
  { label: "phase", pattern: /\bphase\b/iu },
  { label: "notes", pattern: /\bnotes?\b/iu }
];

const contentSignals = [
  { label: "WIP", pattern: /\bWIP\b/iu },
  { label: "TODO", pattern: /\bTODO\b/iu },
  { label: "Draft", pattern: /\bDraft\b/iu },
  { label: "Blocked", pattern: /\bBlocked\b/iu },
  { label: "In progress", pattern: /\bIn progress\b/iu },
  { label: "Next steps", pattern: /\bNext steps\b/iu }
];

const genericHeadings = new Set([
  "summary",
  "overview",
  "notes",
  "next steps",
  "todo",
  "todos",
  "wip",
  "draft",
  "blocked",
  "in progress",
  "testing",
  "safety",
  "scope",
  "configuration",
  "artifacts",
  "decisions",
  "device",
  "apk under test"
]);

const overlapStopWords = new Set([
  "feature",
  "features",
  "fix",
  "fixes",
  "update",
  "updates",
  "plan",
  "planning",
  "roadmap",
  "notes",
  "note",
  "todo",
  "draft",
  "phase",
  "backlog"
]);

const commandLikeTokenPrefixes = [
  "adb",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "git",
  "gh",
  "node",
  "python",
  "gradle",
  "java",
  "powershell",
  "pwsh"
];

const statusVocabularyTokens = new Set(["expected-vs-observed"]);

export const stalePlanFileRuleDefinition: RuleDefinition = {
  id: "context.stale_plan_file",
  category: "context",
  defaultSeverity: "warning",
  title: "Stale planning file",
  description: "Active-looking planning notes are older than the configured stale threshold."
};

export const overlappingPlanFilesRuleDefinition: RuleDefinition = {
  id: "context.overlapping_plan_files",
  category: "context",
  defaultSeverity: "warning",
  title: "Overlapping planning files",
  description: "Multiple active-looking planning files share exact strong planning tokens."
};

export const privatePlanInPublicScopeRuleDefinition: RuleDefinition = {
  id: "context.private_plan_in_public_scope",
  category: "context",
  defaultSeverity: "warning",
  title: "Private planning in public scope",
  description: "Planning notes were found in public documentation or instruction surfaces."
};

export const planningSummaryRuleDefinition: RuleDefinition = {
  id: "context.planning_summary",
  category: "context",
  defaultSeverity: "info",
  title: "Context hygiene summary",
  description: "Summarizes Markdown files scanned by the opt-in context hygiene audit."
};

export const contextHygieneRuleDefinitions: RuleDefinition[] = [
  stalePlanFileRuleDefinition,
  overlappingPlanFilesRuleDefinition,
  privatePlanInPublicScopeRuleDefinition,
  planningSummaryRuleDefinition
];

export function checkContextHygiene(options: ContextHygieneOptions): Finding[] {
  const staleAfterDays = options.staleAfterDays ?? options.config.staleAfterDays;
  const now = options.now ?? new Date();
  const scanState: ScanState = {
    visitedEntries: 0,
    maxDirectoryEntries: options.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
    maxDepth: options.maxDepth ?? options.config.maxDepth ?? DEFAULT_MAX_DEPTH,
    truncated: false,
    skippedFiles: []
  };
  const candidates = findMarkdownCandidates(options.root, {
    include: options.config.include,
    ignore: [...options.config.ignore, ...(options.ignore ?? [])],
    maxFilesScanned: options.config.maxFilesScanned,
    state: scanState
  });
  const planningFiles = candidates
    .map((candidate) => loadPlanningFile(options.root, candidate, options.config, scanState))
    .filter((file): file is PlanningFile => file !== null);
  const findings: Finding[] = [];

  findings.push(buildPlanningSummaryFinding(candidates, planningFiles, scanState));

  for (const file of planningFiles) {
    const ageDays = Math.max(0, Math.floor((now.getTime() - file.mtimeMs) / 86_400_000));

    if (file.contextKind === "active" && ageDays >= staleAfterDays) {
      findings.push({
        ruleId: stalePlanFileRuleDefinition.id,
        severity: "warning",
        message: `${file.relativePath} looks like active planning context but is ${ageDays} days old.`,
        file: file.relativePath,
        line: file.line,
        details: {
          matchedSignals: file.matchedSignals,
          contextKind: file.contextKind,
          ageDays,
          staleAfterDays,
          relatedFiles: [],
          suggestedAction: "archive",
          cleanupRequest: `Review ${file.relativePath} and archive or delete it if the plan was completed or superseded. Keep only the current source of truth in active agent context.`
        }
      });
    }

    if (file.isPublicScope) {
      const publicScopeSeverity = file.contextKind === "active" ? "warning" : "info";
      findings.push({
        ruleId: privatePlanInPublicScopeRuleDefinition.id,
        severity: publicScopeSeverity,
        message: `${file.relativePath} contains planning signals in a public instruction or documentation scope.`,
        file: file.relativePath,
        line: file.line,
        details: {
          matchedSignals: file.matchedSignals,
          contextKind: file.contextKind,
          ageDays,
          staleAfterDays,
          relatedFiles: [],
          suggestedAction: file.contextKind === "active" ? "review" : "mark_snapshot",
          cleanupRequest:
            file.contextKind === "active"
              ? `Review ${file.relativePath}. Move private WIP planning to a private notes area, or rewrite it as durable public documentation if it should stay public.`
              : `Review ${file.relativePath}. If this is intentional archive, evidence, or snapshot context, mark or configure it as such rather than deleting historical evidence.`
        }
      });
    }
  }

  findings.push(...buildOverlapFindings(planningFiles, staleAfterDays));

  return findings;
}

function findMarkdownCandidates(
  root: string,
  options: { include: string[]; ignore: string[]; maxFilesScanned: number; state: ScanState }
): MarkdownCandidate[] {
  const candidates: MarkdownCandidate[] = [];
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
  candidates: MarkdownCandidate[],
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

    if (!entry.isFile()) {
      continue;
    }

    if (!matchesAny(includeMatchers, relativePath)) {
      continue;
    }

    if (candidates.length >= maxFilesScanned) {
      state.truncated = true;
      return;
    }

    const stats = fs.statSync(absolutePath);
    candidates.push({
      absolutePath,
      relativePath,
      mtimeMs: stats.mtimeMs
    });
  }
}

function loadPlanningFile(
  root: string,
  candidate: MarkdownCandidate,
  config: ResolvedContextHygieneConfig,
  state: ScanState
): PlanningFile | null {
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

  const { signals, line, isPlanningLike } = collectPlanningSignals(candidate.relativePath, content);

  if (!isPlanningLike) {
    return null;
  }

  return {
    ...candidate,
    content,
    matchedSignals: signals,
    line,
    ...collectStrongTokens(content, config.overlapTokenMinLength),
    isPublicScope: isPublicScope(candidate.relativePath, config.publicPaths, config.publicScopeInstructionPaths),
    contextKind: classifyPlanningContext(candidate.relativePath)
  };
}

function collectPlanningSignals(
  relativePath: string,
  content: string
): { signals: string[]; line: number; isPlanningLike: boolean } {
  const signals: string[] = [];
  const contentSignalOccurrences: string[] = [];
  let firstLine = 1;
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const fileName = path.posix.basename(normalizedPath).toLowerCase();
  const isCommonPublicDoc = fileName === "readme.md" || fileName === "contributing.md" || fileName === "changelog.md";
  const isDurableReleaseDoc = /^(?:release[-_]?notes|releases|changelog)(?:\.[a-z0-9]+)?\.mdx?$/iu.test(fileName);
  let pathMatched = false;
  const signalContent = stripInlineCode(stripFencedCodeBlocks(content));

  if (isDurableReleaseDoc) {
    return {
      signals: [],
      line: 1,
      isPlanningLike: false
    };
  }

  for (const signal of pathSignals) {
    if (signal.pattern.test(normalizedPath)) {
      signals.push(signal.label);
      pathMatched = true;
    }
  }

  const lines = signalContent.split(/\r?\n/u);
  for (const signal of contentSignals) {
    for (const [index, line] of lines.entries()) {
      if (isWeakStatusSignalLine(line, signal.label)) {
        continue;
      }

      if (signal.pattern.test(line)) {
        signals.push(signal.label);
        contentSignalOccurrences.push(signal.label);
        firstLine = Math.min(firstLine === 1 ? index + 1 : firstLine, index + 1);
      }
    }
  }

  return {
    signals: Array.from(new Set(signals)),
    line: firstLine,
    isPlanningLike: pathMatched || (!isCommonPublicDoc && contentSignalOccurrences.length >= 5)
  };
}

function collectStrongTokens(content: string, tokenMinLength: number): Pick<PlanningFile, "strongTokens" | "strongTokenKinds"> {
  const tokens = new Set<string>();
  const tokenKinds: Record<string, StrongTokenKind> = {};
  const searchableContent = stripInlineCode(stripFencedCodeBlocks(content));
  const versionMatches = searchableContent.matchAll(/\bv?\d+\.\d+(?:\.\d+)?\b/giu);
  for (const match of versionMatches) {
    addStrongToken(tokens, tokenKinds, match[0].toLowerCase(), "version", tokenMinLength, { allowShortVersion: true });
  }

  const featureMatches = searchableContent.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+){1,}\b/giu);
  for (const match of featureMatches) {
    addStrongToken(tokens, tokenKinds, match[0].toLowerCase(), "slug", tokenMinLength);
  }

  try {
    for (const element of extractMarkdownElements(content)) {
      if (element.type !== "heading") {
        continue;
      }

      const normalizedHeading = normalizeHeadingToken(element.text);
      if (normalizedHeading) {
        addStrongToken(tokens, tokenKinds, normalizedHeading, "heading", tokenMinLength);
      }
    }
  } catch {
    return {
      strongTokens: Array.from(tokens).sort(),
      strongTokenKinds: tokenKinds
    };
  }

  return {
    strongTokens: Array.from(tokens).sort(),
    strongTokenKinds: tokenKinds
  };
}

function stripFencedCodeBlocks(content: string): string {
  const lines = content.split(/\r?\n/u);

  try {
    for (const element of extractMarkdownElements(content)) {
      if (element.type !== "code") {
        continue;
      }

      for (let lineIndex = element.location.line - 1; lineIndex < element.location.endLine; lineIndex += 1) {
        if (lineIndex >= 0 && lineIndex < lines.length) {
          lines[lineIndex] = "";
        }
      }
    }
  } catch {
    return content;
  }

  return lines.join("\n");
}

function stripInlineCode(content: string): string {
  return content.replace(/`[^`\r\n]+`/gu, "");
}

function isWeakStatusSignalLine(line: string, signalLabel: string): boolean {
  if (signalLabel !== "Draft" && signalLabel !== "Blocked") {
    return false;
  }

  const trimmed = line.trim();
  const normalized = trimmed.toLowerCase();

  return (
    trimmed.includes("|") ||
    /^\s*[-*]?\s*(?:draft|blocked)\s*[:=]/iu.test(trimmed) ||
    /\bstatus(?:es)?\b/iu.test(trimmed) ||
    /\b(?:draft|blocked)\s*=\s*/iu.test(normalized)
  );
}

function normalizeHeadingToken(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/[`*_~[\]()#.:,!?/\\]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (genericHeadings.has(normalized) || !normalized.includes(" ")) {
    return null;
  }

  return normalized;
}

function addStrongToken(
  tokens: Set<string>,
  tokenKinds: Record<string, StrongTokenKind>,
  token: string,
  kind: StrongTokenKind,
  tokenMinLength: number,
  options: { allowShortVersion?: boolean } = {}
): void {
  if (isWeakOverlapToken(token, kind)) {
    return;
  }

  if (overlapStopWords.has(token)) {
    return;
  }

  if (token.length < tokenMinLength && options.allowShortVersion !== true) {
    return;
  }

  if (token.length < tokenMinLength && !/^v\d+\.\d+(?:\.\d+)?$/iu.test(token)) {
    return;
  }

  tokens.add(token);
  tokenKinds[token] = kind;
}

function isPublicScope(relativePath: string, publicPaths: string[], publicInstructionPaths: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (isInstructionSurface(normalizedPath, publicInstructionPaths)) {
    return true;
  }

  return publicPaths.some((publicPath) => {
    const normalizedPublicPath = publicPath.replace(/\\/g, "/").replace(/\/+$/u, "");
    if (normalizedPublicPath === ".") {
      return !normalizedPath.includes("/");
    }
    return normalizedPath === normalizedPublicPath || normalizedPath.startsWith(`${normalizedPublicPath}/`);
  });
}

function isInstructionSurface(normalizedPath: string, publicInstructionPaths: string[]): boolean {
  const matchers = publicInstructionPaths.flatMap(createGlobMatchers);
  return matchesAny(matchers, normalizedPath);
}

function buildPlanningSummaryFinding(
  candidates: MarkdownCandidate[],
  planningFiles: PlanningFile[],
  state: ScanState
): Finding {
  const firstFile = planningFiles.find((file) => !isLowSignalSummaryAnchor(file.relativePath))?.relativePath;

  return {
    ruleId: planningSummaryRuleDefinition.id,
    severity: "info",
    message: `Context hygiene scanned ${candidates.length} Markdown file${candidates.length === 1 ? "" : "s"} and found ${planningFiles.length} planning-like file${planningFiles.length === 1 ? "" : "s"}.`,
    ...(firstFile ? { file: firstFile } : {}),
    line: 1,
    details: {
      markdownFileCount: candidates.length,
      planningFileCount: planningFiles.length,
      truncated: state.truncated,
      skippedFiles: state.skippedFiles
    }
  };
}

function buildOverlapFindings(planningFiles: PlanningFile[], staleAfterDays: number): Finding[] {
  const tokenToFiles = new Map<string, PlanningFile[]>();
  const tokenKinds = new Map<string, StrongTokenKind>();

  for (const file of planningFiles) {
    for (const token of file.strongTokens) {
      const files = tokenToFiles.get(token) ?? [];
      files.push(file);
      tokenToFiles.set(token, files);
      tokenKinds.set(token, file.strongTokenKinds[token] ?? "slug");
    }
  }

  const findings: Finding[] = [];
  const overlapping = Array.from(tokenToFiles.entries())
    .filter(([, files]) => files.length > 1)
    .sort(([leftToken], [rightToken]) => leftToken.localeCompare(rightToken));

  const groupedOverlaps = new Map<
    string,
    {
      files: PlanningFile[];
      tokens: string[];
      tokenKinds: StrongTokenKind[];
    }
  >();

  for (const [token, files] of overlapping) {
    const key = files
      .map((file) => file.relativePath)
      .sort()
      .join("\0");
    const group = groupedOverlaps.get(key) ?? { files, tokens: [], tokenKinds: [] };
    group.tokens.push(token);
    group.tokenKinds.push(tokenKinds.get(token) ?? "slug");
    groupedOverlaps.set(key, group);
  }

  const groups = Array.from(groupedOverlaps.values()).sort((left, right) => {
    const leftPrimary = selectPrimaryOverlapFile(left.files);
    const rightPrimary = selectPrimaryOverlapFile(right.files);
    return leftPrimary.relativePath.localeCompare(rightPrimary.relativePath);
  });

  for (const group of groups.slice(0, MAX_OVERLAP_FINDINGS)) {
    const files = group.files;
    const matchedTokens = group.tokens.slice(0, MAX_RELATED_FILES_PER_OVERLAP);
    const matchedTokenKinds = group.tokenKinds.slice(0, matchedTokens.length);
    const primary = selectPrimaryOverlapFile(files);
    const allRelatedFiles = files.filter((file) => file !== primary).map((file) => file.relativePath);
    const relatedFiles = allRelatedFiles.slice(0, MAX_RELATED_FILES_PER_OVERLAP);
    const relatedFileCount = allRelatedFiles.length;
    const relatedFilesTruncated = allRelatedFiles.length > relatedFiles.length;
    const activeFiles = files.filter((file) => file.contextKind === "active");
    const activeFileCount = activeFiles.length;
    const contextKinds = Array.from(new Set(files.map((file) => file.contextKind))).sort();
    const severity = activeFileCount >= 2 ? "warning" : "info";
    const suggestedAction = severity === "warning" ? "confirm_source_of_truth" : "mark_snapshot";
    const latestCandidate = selectLatestOverlapCandidate(activeFiles.length > 0 ? activeFiles : files).relativePath;

    findings.push({
      ruleId: overlappingPlanFilesRuleDefinition.id,
      severity,
      message:
        matchedTokens.length === 1
          ? `Planning files overlap on exact context token "${matchedTokens[0]}".`
          : `Planning files overlap on ${group.tokens.length} exact context tokens.`,
      file: primary.relativePath,
      line: primary.line,
      details: {
        matchedSignals: primary.matchedSignals,
        matchedTokens,
        matchedTokenKinds,
        matchedTokenCount: group.tokens.length,
        matchedTokensTruncated: group.tokens.length > matchedTokens.length,
        contextKinds,
        activeFileCount,
        latestCandidate,
        relatedFiles,
        relatedFileCount,
        relatedFilesTruncated,
        staleAfterDays,
        suggestedAction,
        cleanupRequest:
          severity === "warning"
            ? `Confirm the current source of truth for ${formatOverlapTokenLabel(group.tokens)}: ${[
                primary.relativePath,
                ...relatedFiles
              ].join(", ")}${
                relatedFilesTruncated ? `, plus ${relatedFileCount - relatedFiles.length} more related files` : ""
              }. Keep one active plan and mark older active notes as archived or superseded after review. Latest candidate: ${latestCandidate}.`
            : `These overlaps look like archive, evidence, snapshot, or mirrored skill context for ${formatOverlapTokenLabel(
                group.tokens
              )}. Confirm the current source of truth and mark expected historical copies in config if they are intentional. Do not delete evidence snapshots solely because of this finding. Latest candidate: ${latestCandidate}.`
      }
    });
  }

  return findings;
}

function classifyPlanningContext(relativePath: string): PlanningContextKind {
  const normalizedPath = relativePath.replace(/\\/g, "/").toLowerCase();
  const fileName = path.posix.basename(normalizedPath);

  if (normalizedPath.includes("/.codex/skills/") || normalizedPath.startsWith(".codex/skills/")) {
    return "skill_mirror";
  }

  if (
    normalizedPath.includes("/archive/") ||
    normalizedPath.includes("/archives/") ||
    normalizedPath.includes("/archived/") ||
    normalizedPath.includes("/legacy/") ||
    /(?:^|[_-])legacy(?:[_-]|$)/iu.test(fileName)
  ) {
    return "archive";
  }

  if (
    normalizedPath.includes("/snapshot/") ||
    normalizedPath.includes("/snapshots/") ||
    /snapshot[_-]?\d{8}/iu.test(fileName) ||
    /\d{8}t\d{6}z/iu.test(fileName)
  ) {
    return "snapshot";
  }

  if (
    normalizedPath.includes("/evidence/") ||
    normalizedPath.includes("/evidences/") ||
    normalizedPath.includes("/reports/") ||
    /(?:^|[_-])(?:report|evidence|checklist|smoke|metric|profile|status)(?:[_-]|\.|$)/iu.test(fileName) ||
    /(?:survival_gate_status|android_survival_profile|survival_metric_profile)/iu.test(normalizedPath) ||
    normalizedPath.includes("/tests/")
  ) {
    return "evidence";
  }

  return "active";
}

function selectPrimaryOverlapFile(files: PlanningFile[]): PlanningFile {
  const activeFiles = files.filter((file) => file.contextKind === "active");
  return selectLatestOverlapCandidate(activeFiles.length > 0 ? activeFiles : files);
}

function selectLatestOverlapCandidate(files: PlanningFile[]): PlanningFile {
  return [...files].sort((left, right) => {
    const rightDate = extractSortableDate(right.relativePath);
    const leftDate = extractSortableDate(left.relativePath);
    if (rightDate !== null || leftDate !== null) {
      const dateDifference = (rightDate ?? 0) - (leftDate ?? 0);
      if (dateDifference !== 0) {
        return dateDifference;
      }
    }

    if (right.mtimeMs !== left.mtimeMs) {
      return right.mtimeMs - left.mtimeMs;
    }
    return left.relativePath.localeCompare(right.relativePath);
  })[0] as PlanningFile;
}

function extractSortableDate(relativePath: string): number | null {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const timestampMatch = /(?<year>20\d{2})(?<month>\d{2})(?<day>\d{2})[T_-]?(?<hour>\d{2})?(?<minute>\d{2})?(?<second>\d{2})?/u.exec(
    normalizedPath
  );
  if (timestampMatch?.groups) {
    const { year, month, day, hour = "00", minute = "00", second = "00" } = timestampMatch.groups;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }

  const dateMatch = /(?<year>20\d{2})-(?<month>\d{2})-(?<day>\d{2})/u.exec(normalizedPath);
  if (dateMatch?.groups) {
    const { year, month, day } = dateMatch.groups;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function formatOverlapTokenLabel(tokens: string[]): string {
  if (tokens.length === 1) {
    return `"${tokens[0]}"`;
  }

  const visibleTokens = tokens.slice(0, 3).map((token) => `"${token}"`).join(", ");
  return tokens.length > 3 ? `${visibleTokens}, plus ${tokens.length - 3} more tokens` : visibleTokens;
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

function isWeakOverlapToken(token: string, kind: StrongTokenKind): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token)) {
    return true;
  }

  if (/^\d{1,2}-\d{1,2}$/u.test(token)) {
    return true;
  }

  if (/^\d{4}-\d{2}-\d{2}$/u.test(token)) {
    return true;
  }

  if (/^\d+\.\d+(?:\.\d+)?$/u.test(token) && !token.startsWith("v")) {
    return true;
  }

  if (/^\d+-\d+$/u.test(token)) {
    return true;
  }

  if (kind === "slug" && /^\d/u.test(token) && !/^v\d/u.test(token)) {
    return true;
  }

  if (kind === "slug" && token.split("-").length < 3) {
    return true;
  }

  if (kind === "slug" && token.split("-").some((segment) => /^\d{10,}$/u.test(segment))) {
    return true;
  }

  if (kind === "slug" && (token.startsWith("blocked-") || token.startsWith("com-"))) {
    return true;
  }

  if (kind === "slug" && commandLikeTokenPrefixes.some((prefix) => token.startsWith(`${prefix}-`))) {
    return true;
  }

  if (kind === "slug" && statusVocabularyTokens.has(token)) {
    return true;
  }

  if (kind === "slug" && /(?:^|-)(?:green|created)$/u.test(token)) {
    return true;
  }

  if (kind === "heading" && commandLikeTokenPrefixes.some((prefix) => token === prefix || token.startsWith(`${prefix} `))) {
    return true;
  }

  return false;
}

function isLowSignalSummaryAnchor(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  return (
    normalizedPath.startsWith(".codex/") ||
    normalizedPath.includes("/.codex/") ||
    normalizedPath.includes("/skills/") ||
    normalizedPath.includes("/references/")
  );
}

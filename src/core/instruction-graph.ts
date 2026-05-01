import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { extractMarkdownElements, type MarkdownSourceLocation } from "./markdown.js";
import { isPathInsideRoot, normalizeRelativePath } from "../path-utils.js";

export type InstructionGraphNodeStatus = "loaded" | "missing" | "outside_repo" | "symlink" | "unreadable";

export type InstructionGraphReferenceKind = "link" | "inlineCode" | "entry";

export type InstructionGraphNodeKind = "agents" | "referencedInstruction";

export type InstructionGraphNodeDiscovery = "entry" | "reference";

export type InstructionGraphDiagnosticReason =
  | "cycle"
  | "max_depth"
  | "missing"
  | "outside_repo"
  | "symlink"
  | "unreadable";

export type InstructionGraphDiagnosticCode =
  | "instruction_graph_cycle"
  | "instruction_graph_depth_exceeded"
  | "instruction_reference_missing"
  | "instruction_reference_outside_repo"
  | "instruction_reference_symlink"
  | "instruction_reference_unreadable";

export interface InstructionGraphSourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface InstructionGraphNode {
  id: string;
  absolutePath: string;
  relativePath: string;
  depth: number;
  entry: boolean;
  status: InstructionGraphNodeStatus;
  discoveredBy: InstructionGraphNodeDiscovery;
  kind: InstructionGraphNodeKind;
  referencedBy?: string;
  content?: string;
}

export interface InstructionGraphEdge {
  from: string;
  to: string;
  reference: string;
  kind: InstructionGraphReferenceKind;
  sourceType: InstructionGraphReferenceKind;
  line: number;
  location: InstructionGraphSourceLocation;
}

export interface InstructionGraphDiagnostic {
  code: InstructionGraphDiagnosticCode;
  reason: InstructionGraphDiagnosticReason;
  file: string;
  reference: string;
  message: string;
  line?: number;
  column?: number;
  target?: string;
  details?: Record<string, unknown>;
}

export interface InstructionGraph {
  root: string;
  entryFiles: string[];
  maxDepth: number;
  nodes: InstructionGraphNode[];
  edges: InstructionGraphEdge[];
  diagnostics: InstructionGraphDiagnostic[];
}

export interface InstructionGraphEntryFile {
  absolutePath: string;
  relativePath: string;
  content?: string;
}

export interface BuildInstructionGraphOptions {
  root: string;
  entryFiles: Array<string | InstructionGraphEntryFile>;
  maxDepth?: number;
  include?: string[];
  ignore?: string[];
}

interface ReferenceCandidate {
  reference: string;
  kind: "link" | "inlineCode";
  location: MarkdownSourceLocation;
  text: string;
}

interface ResolvedReference {
  reference: string;
  absolutePath: string;
  relativePath: string;
  location: MarkdownSourceLocation;
  kind: "link" | "inlineCode";
}

const DEFAULT_MAX_DEPTH = 8;
const MARKDOWN_EXTENSION = ".md";
const INSTRUCTION_BASENAME_PATTERN = /(?:^|[-_.])(agents?|instructions?|guidance|policy|rules)(?:[-_.]|$)/i;

export function buildInstructionGraph(options: BuildInstructionGraphOptions): InstructionGraph {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const includeMatcher = createMatcher(options.include ?? []);
  const ignoreMatcher = createMatcher(options.ignore ?? []);
  const nodes = new Map<string, InstructionGraphNode>();
  const edges: InstructionGraphEdge[] = [];
  const diagnostics: InstructionGraphDiagnostic[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const entryFile of options.entryFiles) {
    const resolved = resolveEntryFile(root, entryFile);

    traverse({
      root,
      fileAbsolutePath: resolved.absolutePath,
      requestedPath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      depth: 0,
      entry: true,
      discoveredBy: "entry",
      kind: "agents",
      entryContent: typeof entryFile === "string" ? undefined : entryFile.content,
      referencedBy: undefined,
      incomingReference: resolved.relativePath,
      incomingLine: undefined,
      incomingColumn: undefined,
      maxDepth,
      includeMatcher,
      ignoreMatcher,
      nodes,
      edges,
      diagnostics,
      visiting,
      visited
    });
  }

  return {
    root,
    entryFiles: options.entryFiles.map((entryFile) => resolveEntryFile(root, entryFile).relativePath),
    maxDepth,
    nodes: [...nodes.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    edges: edges.sort(compareEdges),
    diagnostics: diagnostics.sort(compareDiagnostics)
  };
}

interface TraverseOptions {
  root: string;
  fileAbsolutePath: string;
  requestedPath: string;
  relativePath: string;
  depth: number;
  entry: boolean;
  discoveredBy: InstructionGraphNodeDiscovery;
  kind: InstructionGraphNodeKind;
  entryContent?: string;
  referencedBy?: string;
  incomingReference: string;
  incomingLine?: number;
  incomingColumn?: number;
  maxDepth: number;
  includeMatcher: (relativePath: string) => boolean;
  ignoreMatcher: (relativePath: string) => boolean;
  nodes: Map<string, InstructionGraphNode>;
  edges: InstructionGraphEdge[];
  diagnostics: InstructionGraphDiagnostic[];
  visiting: Set<string>;
  visited: Set<string>;
}

function traverse(options: TraverseOptions): void {
  const existingNode = options.nodes.get(options.relativePath);

  if (existingNode && existingNode.depth <= options.depth && options.visited.has(options.relativePath)) {
    return;
  }

  const readResult = readInstructionFile(options.root, options.requestedPath, options.relativePath, options.entryContent);
  upsertNode(options.nodes, {
    id: readResult.relativePath,
    absolutePath: readResult.absolutePath,
    relativePath: readResult.relativePath,
    depth: Math.min(existingNode?.depth ?? options.depth, options.depth),
    entry: Boolean(existingNode?.entry || options.entry),
    status: readResult.status,
    discoveredBy: existingNode?.discoveredBy ?? options.discoveredBy,
    kind: options.kind,
    ...(options.referencedBy ? { referencedBy: options.referencedBy } : {}),
    ...(readResult.content ? { content: readResult.content } : {})
  });

  if (readResult.status !== "loaded") {
    options.diagnostics.push(
      createReadDiagnostic(readResult.status, {
        file: options.referencedBy ?? options.relativePath,
        reference: options.incomingReference,
        target: options.relativePath,
        ...(options.incomingLine ? { line: options.incomingLine } : {}),
        ...(options.incomingColumn ? { column: options.incomingColumn } : {})
      })
    );
    return;
  }

  if (options.visiting.has(readResult.relativePath)) {
    options.diagnostics.push({
      code: "instruction_graph_cycle",
      reason: "cycle",
      file: readResult.relativePath,
      reference: readResult.relativePath,
      target: readResult.relativePath,
      message: `Cycle detected at ${readResult.relativePath}.`
    });
    return;
  }

  if (options.visited.has(readResult.relativePath)) {
    return;
  }

  options.visiting.add(readResult.relativePath);
  const references = extractInstructionReferences(readResult.content);

  for (const reference of references) {
    const resolved = resolveReference(options.root, readResult.absolutePath, reference);

    if (!resolved) {
      continue;
    }

    if (resolved.relativePath === readResult.relativePath) {
      continue;
    }

    if (options.ignoreMatcher(resolved.relativePath)) {
      continue;
    }

    if (!isPathInsideRoot(options.root, resolved.absolutePath)) {
      options.diagnostics.push({
        code: "instruction_reference_outside_repo",
        reason: "outside_repo",
        file: readResult.relativePath,
        reference: resolved.reference,
        target: normalizeRelativePath(path.relative(options.root, resolved.absolutePath)),
        line: resolved.location.line,
        column: resolved.location.column,
        message: `${readResult.relativePath} references an instruction file outside the repo: ${resolved.reference}.`
      });
      continue;
    }

    if (!options.includeMatcher(resolved.relativePath)) {
      continue;
    }

    options.edges.push({
      from: readResult.relativePath,
      to: resolved.relativePath,
      reference: resolved.reference,
      kind: resolved.kind,
      sourceType: resolved.kind,
      line: resolved.location.line,
      location: {
        file: readResult.relativePath,
        line: resolved.location.line,
        column: resolved.location.column
      }
    });

    if (options.visiting.has(resolved.relativePath)) {
      options.diagnostics.push({
        code: "instruction_graph_cycle",
        reason: "cycle",
        file: readResult.relativePath,
        reference: resolved.reference,
        target: resolved.relativePath,
        line: resolved.location.line,
        column: resolved.location.column,
        message: `${readResult.relativePath} creates an instruction reference cycle through ${resolved.reference}.`
      });
      continue;
    }

    if (options.depth >= options.maxDepth) {
      options.diagnostics.push({
        code: "instruction_graph_depth_exceeded",
        reason: "max_depth",
        file: readResult.relativePath,
        reference: resolved.reference,
        target: resolved.relativePath,
        line: resolved.location.line,
        column: resolved.location.column,
        message: `${readResult.relativePath} references ${resolved.reference} beyond maxDepth ${options.maxDepth}.`
      });
      continue;
    }

    traverse({
      ...options,
      fileAbsolutePath: resolved.absolutePath,
      requestedPath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      depth: options.depth + 1,
      entry: false,
      discoveredBy: "reference",
      kind: getNodeKind(resolved.relativePath),
      entryContent: undefined,
      referencedBy: readResult.relativePath,
      incomingReference: resolved.reference,
      incomingLine: resolved.location.line,
      incomingColumn: resolved.location.column
    });
  }

  options.visiting.delete(readResult.relativePath);
  options.visited.add(readResult.relativePath);
}

interface ReadInstructionFileResult {
  absolutePath: string;
  relativePath: string;
  status: InstructionGraphNodeStatus;
  content: string;
}

function readInstructionFile(
  root: string,
  requestedPath: string,
  fallbackRelativePath: string,
  providedContent?: string
): ReadInstructionFileResult {
  const absolutePath = path.resolve(requestedPath);
  const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

  if (!isPathInsideRoot(root, absolutePath)) {
    return {
      absolutePath,
      relativePath: fallbackRelativePath,
      status: "outside_repo",
      content: ""
    };
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      absolutePath,
      relativePath,
      status: "missing",
      content: ""
    };
  }

  try {
    const linkStats = fs.lstatSync(absolutePath);

    if (linkStats.isSymbolicLink()) {
      return {
        absolutePath,
        relativePath,
        status: "symlink",
        content: ""
      };
    }

    const realPath = fs.realpathSync.native(absolutePath);

    if (!isPathInsideRoot(root, realPath)) {
      return {
        absolutePath: realPath,
        relativePath,
        status: "outside_repo",
        content: ""
      };
    }

    const stats = fs.statSync(realPath);

    if (!stats.isFile()) {
      return {
        absolutePath: realPath,
        relativePath,
        status: "unreadable",
        content: ""
      };
    }

    return {
      absolutePath: realPath,
      relativePath,
      status: "loaded",
      content: providedContent ?? fs.readFileSync(realPath, "utf8")
    };
  } catch {
    return {
      absolutePath,
      relativePath,
      status: "unreadable",
      content: ""
    };
  }
}

function extractInstructionReferences(content: string): ReferenceCandidate[] {
  const candidates: ReferenceCandidate[] = [];

  for (const element of extractMarkdownElements(content)) {
    if (element.type === "link") {
      const reference = sanitizeReference(element.url);

      if (reference) {
        candidates.push({
          reference,
          kind: "link",
          location: element.location,
          text: element.text
        });
      }
    }

    if (element.type === "inlineCode") {
      const reference = sanitizeReference(element.value);

      if (reference) {
        candidates.push({
          reference,
          kind: "inlineCode",
          location: element.location,
          text: element.value
        });
      }
    }
  }

  return dedupeReferences(candidates).filter((candidate) =>
    isInstructionLikeReference(candidate.reference, candidate.text)
  );
}

function sanitizeReference(rawReference: string): string | null {
  const trimmedRaw = rawReference.trim();

  if (
    trimmedRaw.length === 0 ||
    trimmedRaw.startsWith("#") ||
    trimmedRaw.startsWith("http://") ||
    trimmedRaw.startsWith("https://") ||
    trimmedRaw.startsWith("mailto:") ||
    trimmedRaw.startsWith("//") ||
    isDomainLikeReference(trimmedRaw) ||
    isLikelySystemAbsolutePath(trimmedRaw)
  ) {
    return null;
  }

  const withoutFragment = trimmedRaw.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  const trimmed = withoutQuery.trim();

  if (trimmed.length === 0 || isPlaceholderPathReference(trimmed)) {
    return null;
  }

  return trimmed;
}

function isInstructionLikeMarkdownPath(reference: string): boolean {
  const normalized = reference.replace(/\\/g, "/");
  const basename = path.posix.basename(normalized);

  if (!basename.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
    return false;
  }

  return basename.toLowerCase() === "agents.md" || INSTRUCTION_BASENAME_PATTERN.test(basename);
}

function isInstructionLikeReference(reference: string, text: string): boolean {
  const normalizedText = text.toLowerCase();

  return (
    isInstructionLikeMarkdownPath(reference) ||
    /\b(?:agent|agents|instruction|instructions|coding agent|codex|cursor|claude|copilot)\b/i.test(normalizedText)
  );
}

function getNodeKind(relativePath: string): InstructionGraphNodeKind {
  return path.posix.basename(relativePath.toLowerCase()) === "agents.md" ? "agents" : "referencedInstruction";
}

function resolveReference(root: string, sourceFileAbsolutePath: string, candidate: ReferenceCandidate): ResolvedReference | null {
  const absolutePath = candidate.reference.startsWith("/")
    ? path.resolve(root, `.${candidate.reference}`)
    : path.resolve(path.dirname(sourceFileAbsolutePath), candidate.reference);
  const relativePath = normalizeRelativePath(path.relative(root, absolutePath));

  return {
    reference: candidate.reference,
    absolutePath,
    relativePath,
    location: candidate.location,
    kind: candidate.kind
  };
}

function resolveEntryFile(root: string, entryFile: string | InstructionGraphEntryFile): { absolutePath: string; relativePath: string } {
  if (typeof entryFile !== "string") {
    return {
      absolutePath: path.resolve(entryFile.absolutePath),
      relativePath: normalizeRelativePath(entryFile.relativePath)
    };
  }

  const absolutePath = path.isAbsolute(entryFile) ? path.resolve(entryFile) : path.resolve(root, entryFile);

  return {
    absolutePath,
    relativePath: normalizeRelativePath(path.relative(root, absolutePath))
  };
}

function upsertNode(nodes: Map<string, InstructionGraphNode>, node: InstructionGraphNode): void {
  const existing = nodes.get(node.relativePath);

  if (!existing) {
    nodes.set(node.relativePath, node);
    return;
  }

  nodes.set(node.relativePath, {
    ...existing,
    depth: Math.min(existing.depth, node.depth),
    entry: existing.entry || node.entry,
    status: existing.status === "loaded" ? existing.status : node.status,
    absolutePath: existing.status === "loaded" ? existing.absolutePath : node.absolutePath,
    content: existing.content ?? node.content,
    referencedBy: existing.referencedBy ?? node.referencedBy
  });
}

function createReadDiagnostic(
  status: Exclude<InstructionGraphNodeStatus, "loaded">,
  options: {
    file: string;
    reference: string;
    target: string;
    line?: number;
    column?: number;
  }
): InstructionGraphDiagnostic {
  return {
    code: getReadDiagnosticCode(status),
    reason: status,
    file: options.file,
    reference: options.reference,
    target: options.target,
    ...(options.line ? { line: options.line } : {}),
    ...(options.column ? { column: options.column } : {}),
    message: `Instruction file ${options.target} could not be read: ${status}.`
  };
}

function getReadDiagnosticCode(status: Exclude<InstructionGraphNodeStatus, "loaded">): InstructionGraphDiagnosticCode {
  if (status === "outside_repo") {
    return "instruction_reference_outside_repo";
  }

  if (status === "symlink") {
    return "instruction_reference_symlink";
  }

  if (status === "unreadable") {
    return "instruction_reference_unreadable";
  }

  return "instruction_reference_missing";
}

function dedupeReferences(candidates: ReferenceCandidate[]): ReferenceCandidate[] {
  const seen = new Set<string>();
  const deduped: ReferenceCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.reference}:${candidate.location.line}:${candidate.location.column}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function isLikelySystemAbsolutePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/").trim().toLowerCase();

  if (normalized.startsWith("%") && normalized.includes("%")) {
    return true;
  }

  if (/^\$[a-z_][a-z0-9_]*\//.test(normalized)) {
    return true;
  }

  if (/^[a-z]:\//.test(normalized)) {
    return true;
  }

  return [
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
  ].some((prefix) => normalized.startsWith(prefix));
}

function isDomainLikeReference(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");

  if (!normalized.includes("/")) {
    return !normalized.toLowerCase().endsWith(MARKDOWN_EXTENSION) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized);
  }

  const firstSegment = normalized.split("/")[0] ?? "";
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(firstSegment);
}

function isPlaceholderPathReference(referencePath: string): boolean {
  const normalized = referencePath.replace(/\\/g, "/").trim();
  const lowered = normalized.toLowerCase();

  return (
    normalized === "*" ||
    normalized.includes("*") ||
    normalized.includes("...") ||
    lowered.includes("your_path") ||
    lowered.startsWith("path/to/") ||
    lowered.startsWith("/path/to/") ||
    /<[^>]+>/.test(normalized) ||
    /\{[^}]+\}/.test(normalized) ||
    /\[[^\]]+\]/.test(normalized)
  );
}

function compareEdges(left: InstructionGraphEdge, right: InstructionGraphEdge): number {
  return (
    left.from.localeCompare(right.from) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column ||
    left.to.localeCompare(right.to)
  );
}

function compareDiagnostics(left: InstructionGraphDiagnostic, right: InstructionGraphDiagnostic): number {
  return (
    left.file.localeCompare(right.file) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    left.reason.localeCompare(right.reason) ||
    left.reference.localeCompare(right.reference)
  );
}

function createMatcher(patterns: string[]): (relativePath: string) => boolean {
  if (patterns.length === 0) {
    return () => false;
  }

  const matchers = patterns.map((pattern) => picomatch(pattern.replace(/\\/g, "/"), { dot: true }));

  return (relativePath) => {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    return matchers.some((matches) => matches(normalizedPath));
  };
}

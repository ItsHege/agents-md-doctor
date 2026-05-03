import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/index.js";
import { buildInstructionGraphFindings } from "../core/instruction-graph-findings.js";
import { buildInstructionGraph, type InstructionGraph } from "../core/instruction-graph.js";
import { AppError, isAppError } from "../errors.js";
import { readTextFileWithinRoot } from "../io/index.js";
import { normalizeRelativePath, isPathInsideRoot } from "../path-utils.js";
import { buildReport } from "../report/index.js";
import { renderJsonReport } from "../render/index.js";
import type { CommandResult } from "./lint.js";
import type { Finding } from "../types/index.js";

export interface ExplainCommandOptions {
  targetPath: string;
  root?: string;
  json: boolean;
}

type ToolManager = "npm" | "pnpm" | "yarn" | "bun";

interface ExplainConflict {
  conflictId:
    | "tool_manager.disagreement"
    | "commands.test_hint_conflict"
    | "generated_files.edit_policy_mismatch";
  message: string;
  files: string[];
  details: Record<string, unknown>;
}

interface ExplainGraphDetails {
  referencedInstructionFiles: string[];
  instructionEdges: Array<{
    from: string;
    to: string;
    reference: string;
    line: number;
    sourceType: string;
  }>;
  graphDiagnostics: Array<{
    code: string;
    file: string;
    line?: number;
    reference?: string;
    target?: string;
  }>;
}

export function runExplainCommand(options: ExplainCommandOptions): CommandResult {
  try {
    const root = resolveRoot(options.root ?? process.cwd());
    const config = loadConfig({ root });
    const resolvedTargetPath = resolveTargetPath(root, options.targetPath);
    const targetRelativePath = normalizeRelativePath(path.relative(root, resolvedTargetPath));
    const appliedFiles = findApplicableAgentsFiles(root, resolvedTargetPath);
    const conflicts = detectExplainConflicts(root, appliedFiles);
    const instructionGraph = config.instructionGraph.enabled
      ? buildInstructionGraph({
          root,
          entryFiles: loadAppliedFiles(root, appliedFiles),
          maxDepth: config.instructionGraph.maxDepth,
          include: config.instructionGraph.include,
          ignore: config.ignore
        })
      : undefined;
    const graphDetails = instructionGraph ? buildExplainGraphDetails(instructionGraph) : undefined;
    const findings: Finding[] = [
      {
        ruleId: "inheritance.applied_chain" as const,
        severity: "info" as const,
        message:
          appliedFiles.length > 0
            ? `${appliedFiles.length} AGENTS.md files apply to ${targetRelativePath}.`
            : `No AGENTS.md files apply to ${targetRelativePath}.`,
        file: appliedFiles.at(-1),
        line: 1,
        details: {
          targetPath: targetRelativePath,
          appliedFiles,
          conflicts,
          ...(graphDetails ? { instructionGraph: graphDetails } : {})
        }
      }
    ];
    if (instructionGraph) {
      findings.push(...buildInstructionGraphFindings(instructionGraph, config));
    }
    const report = buildReport({
      command: "explain",
      root,
      findings
    });

    return {
      exitCode: report.exitCode,
      stdout: options.json
        ? renderJsonReport(report)
        : renderHumanExplainOutput(targetRelativePath, appliedFiles, conflicts, graphDetails),
      stderr: ""
    };
  } catch (error) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `agents-doctor: error: ${formatErrorMessage(error)}\n`
    };
  }
}

function resolveRoot(root: string): string {
  const resolvedRoot = path.resolve(root);

  if (!fs.existsSync(resolvedRoot)) {
    throw new AppError("E_REPO_NOT_FOUND", `repo path does not exist: ${resolvedRoot}`);
  }

  const realRoot = fs.realpathSync.native(resolvedRoot);
  const stats = fs.statSync(realRoot);

  if (!stats.isDirectory()) {
    throw new AppError("E_REPO_NOT_DIRECTORY", `repo path is not a directory: ${resolvedRoot}`);
  }

  return realRoot;
}

function resolveTargetPath(root: string, targetPath: string): string {
  const resolvedTarget = path.resolve(root, targetPath);

  if (!fs.existsSync(resolvedTarget)) {
    throw new AppError("E_FILE_NOT_FOUND", `target path does not exist: ${resolvedTarget}`);
  }

  const realTarget = fs.realpathSync.native(resolvedTarget);

  if (!isPathInsideRoot(root, realTarget)) {
    throw new AppError("E_PATH_OUTSIDE_ROOT", `target path is outside root: ${resolvedTarget}`);
  }

  return realTarget;
}

function findApplicableAgentsFiles(root: string, targetPath: string): string[] {
  const targetDirectory = fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
  const directories: string[] = [];
  let currentDirectory = targetDirectory;

  while (true) {
    directories.push(currentDirectory);

    const relative = normalizeRelativePath(path.relative(root, currentDirectory));
    if (relative === "" || relative === ".") {
      break;
    }

    const parent = path.dirname(currentDirectory);
    if (parent === currentDirectory) {
      break;
    }

    currentDirectory = parent;
  }

  return directories
    .reverse()
    .map((directory) => path.join(directory, "AGENTS.md"))
    .filter((agentsPath) => fs.existsSync(agentsPath))
    .map((agentsPath) => normalizeRelativePath(path.relative(root, agentsPath)));
}

function renderHumanExplainOutput(
  targetPath: string,
  appliedFiles: string[],
  conflicts: ExplainConflict[],
  graphDetails?: ExplainGraphDetails
): string {
  if (appliedFiles.length === 0) {
    return `agents-doctor explain: 0 files apply\ntarget: ${targetPath}\nNo AGENTS.md files found in target ancestry.\n`;
  }

  const lines = [
    `agents-doctor explain: ${appliedFiles.length} ${appliedFiles.length === 1 ? "file" : "files"} apply`,
    `target: ${targetPath}`,
    "Applied AGENTS.md chain (root -> nearest):"
  ];

  for (const [index, file] of appliedFiles.entries()) {
    const marker = index === appliedFiles.length - 1 ? " (nearest)" : "";
    lines.push(`${index + 1}. ${file}${marker}`);
  }

  if (conflicts.length > 0) {
    lines.push("Conflict notes:");

    for (const [index, conflict] of conflicts.entries()) {
      lines.push(`${index + 1}. [${conflict.conflictId}] ${conflict.message}`);
      lines.push(`   files: ${conflict.files.join(", ")}`);
    }
  }

  if (graphDetails && graphDetails.referencedInstructionFiles.length > 0) {
    lines.push("Referenced instruction files:");

    for (const file of graphDetails.referencedInstructionFiles) {
      lines.push(`- ${file}`);
    }
  }

  if (graphDetails && graphDetails.graphDiagnostics.length > 0) {
    lines.push("Graph notes:");

    for (const [index, diagnostic] of graphDetails.graphDiagnostics.entries()) {
      lines.push(`${index + 1}. [${diagnostic.code}] ${diagnostic.file}${diagnostic.reference ? ` -> ${diagnostic.reference}` : ""}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function loadAppliedFiles(root: string, appliedFiles: string[]): Array<{ absolutePath: string; relativePath: string; content: string }> {
  return appliedFiles.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    return {
      absolutePath,
      relativePath,
      content: readTextFileWithinRoot({
        root,
        filePath: absolutePath
      })
    };
  });
}

function buildExplainGraphDetails(graph: InstructionGraph): ExplainGraphDetails {
  return {
    referencedInstructionFiles: graph.nodes
      .filter((node) => node.discoveredBy === "reference" && node.status === "loaded")
      .map((node) => node.id),
    instructionEdges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      reference: edge.reference,
      line: edge.line,
      sourceType: edge.sourceType
    })),
    graphDiagnostics: graph.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      file: diagnostic.file,
      line: diagnostic.line,
      reference: diagnostic.reference,
      target: diagnostic.target
    }))
  };
}

function formatErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown runtime failure";
}

function detectExplainConflicts(root: string, appliedFiles: string[]): ExplainConflict[] {
  const fileContents = appliedFiles.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    return {
      file: relativePath,
      content: readTextFileWithinRoot({
        root,
        filePath: absolutePath
      })
    };
  });

  const conflicts: ExplainConflict[] = [];

  const toolManagerConflict = detectToolManagerConflict(fileContents);
  if (toolManagerConflict) {
    conflicts.push(toolManagerConflict);
  }

  const testHintConflict = detectTestHintConflict(fileContents);
  if (testHintConflict) {
    conflicts.push(testHintConflict);
  }

  const generatedFilePolicyConflict = detectGeneratedFilePolicyConflict(fileContents);
  if (generatedFilePolicyConflict) {
    conflicts.push(generatedFilePolicyConflict);
  }

  return conflicts;
}

function detectToolManagerConflict(fileContents: Array<{ file: string; content: string }>): ExplainConflict | undefined {
  const managersByFile = fileContents
    .map(({ file, content }) => ({
      file,
      managers: detectToolManagers(content)
    }))
    .filter((entry) => entry.managers.length > 0);

  if (managersByFile.length < 2) {
    return undefined;
  }

  const allManagers = orderedUnique(managersByFile.flatMap((entry) => entry.managers));
  const commonManagers = managersByFile
    .map((entry) => new Set(entry.managers))
    .reduce<Set<ToolManager>>(
      (common, current) => new Set([...common].filter((manager) => current.has(manager))),
      new Set(managersByFile[0]?.managers ?? [])
    );

  if (allManagers.length < 2 || commonManagers.size > 0) {
    return undefined;
  }

  return {
    conflictId: "tool_manager.disagreement",
    message: `Conflicting package manager instructions detected: ${allManagers.join(", ")}.`,
    files: managersByFile.map((entry) => entry.file),
    details: {
      managers: allManagers,
      managersByFile
    }
  };
}

function detectToolManagers(content: string): ToolManager[] {
  const managerPatterns: Array<{ manager: ToolManager; patterns: RegExp[] }> = [
    {
      manager: "npm",
      patterns: [/\bnpm\s+(?:run|test|ci|install|i|exec)\b/i, /\buse\s+npm\b/i]
    },
    {
      manager: "pnpm",
      patterns: [/\bpnpm\s+(?:run|test|install|i|add|remove|exec|dlx)\b/i, /\buse\s+pnpm\b/i]
    },
    {
      manager: "yarn",
      patterns: [/\byarn\s+(?:run\s+)?(?:test|install|add|remove|build|lint|start)\b/i, /\buse\s+yarn\b/i]
    },
    {
      manager: "bun",
      patterns: [/\bbun\s+(?:run|test|install|add|remove|x|pm)\b/i, /\buse\s+bun\b/i]
    }
  ];

  return managerPatterns.filter(({ patterns }) => patterns.some((pattern) => pattern.test(content))).map(({ manager }) => manager);
}

function detectTestHintConflict(fileContents: Array<{ file: string; content: string }>): ExplainConflict | undefined {
  const hintsByFile = fileContents
    .map(({ file, content }) => ({
      file,
      hints: extractTestHints(content)
    }))
    .filter((entry) => entry.hints.length > 0);

  if (hintsByFile.length < 2) {
    return undefined;
  }

  const allHints = orderedUnique(hintsByFile.flatMap((entry) => entry.hints));
  const commonHints = hintsByFile
    .map((entry) => new Set(entry.hints))
    .reduce<Set<string>>(
      (common, current) => new Set([...common].filter((hint) => current.has(hint))),
      new Set(hintsByFile[0]?.hints ?? [])
    );

  if (allHints.length < 2 || commonHints.size > 0) {
    return undefined;
  }

  return {
    conflictId: "commands.test_hint_conflict",
    message: `Conflicting test command hints detected: ${allHints.join(" | ")}.`,
    files: hintsByFile.map((entry) => entry.file),
    details: {
      testHints: allHints,
      testHintsByFile: hintsByFile
    }
  };
}

function extractTestHints(content: string): string[] {
  const hints: string[] = [];
  const runScriptPattern = /\b(npm|pnpm|bun)\s+(?:run\s+)?(test(?::[A-Za-z0-9:_-]+)?)\b/gi;
  const yarnPattern = /\byarn\s+(?:run\s+)?(test(?::[A-Za-z0-9:_-]+)?)\b/gi;

  let runScriptMatch: RegExpExecArray | null;
  while ((runScriptMatch = runScriptPattern.exec(content)) !== null) {
    const manager = runScriptMatch[1]?.toLowerCase();
    const script = runScriptMatch[2]?.toLowerCase();
    if (!manager || !script) {
      continue;
    }

    hints.push(`${manager} ${script}`);
  }

  let yarnMatch: RegExpExecArray | null;
  while ((yarnMatch = yarnPattern.exec(content)) !== null) {
    const script = yarnMatch[1]?.toLowerCase();
    if (!script) {
      continue;
    }

    hints.push(`yarn ${script}`);
  }

  return orderedUnique(hints);
}

function detectGeneratedFilePolicyConflict(
  fileContents: Array<{ file: string; content: string }>
): ExplainConflict | undefined {
  const forbidPatterns = [
    /\b(?:never|do not|don't)\s+(?:edit|modify|change|touch)\s+(?:any\s+)?generated files?\b/i,
    /\bgenerated files?\s+(?:must not|should not|are not to|cannot|can not)\s+be\s+(?:edited|modified|changed)\b/i
  ];
  const allowPatterns = [
    /\b(?:you may|can|allowed to|safe to|ok to|okay to|feel free to)\s+(?:edit|modify|change)\s+(?:any\s+)?generated files?\b/i,
    /\bgenerated files?\s+(?:may|can)\s+be\s+(?:edited|modified|changed)\b/i
  ];

  const forbidFiles: Array<{ file: string; marker: string }> = [];
  const allowFiles: Array<{ file: string; marker: string }> = [];

  for (const { file, content } of fileContents) {
    const forbidMatch = matchFirst(content, forbidPatterns);
    if (forbidMatch) {
      forbidFiles.push({ file, marker: forbidMatch });
    }

    const allowMatch = matchFirst(content, allowPatterns);
    if (allowMatch) {
      allowFiles.push({ file, marker: allowMatch });
    }
  }

  if (forbidFiles.length === 0 || allowFiles.length === 0) {
    return undefined;
  }

  const files = orderedUnique([...forbidFiles.map((entry) => entry.file), ...allowFiles.map((entry) => entry.file)]);

  return {
    conflictId: "generated_files.edit_policy_mismatch",
    message: "Generated-file edit policy mismatch detected: both forbid and allow instructions are present.",
    files,
    details: {
      forbidFiles,
      allowFiles
    }
  };
}

function matchFirst(content: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[0]) {
      return match[0];
    }
  }

  return undefined;
}

function orderedUnique<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const unique: T[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    unique.push(value);
  }

  return unique;
}

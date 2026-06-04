import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { isPathInsideRoot, normalizeRelativePath } from "../path-utils.js";

export const ToolEvidenceStatusSchema = z.enum([
  "native",
  "compatible",
  "partial",
  "detected_not_modeled",
  "not_found"
]);

export const ToolEvidenceSchema = z.object({
  toolId: z.enum(["codex", "cursor", "claude-code", "github-copilot", "gemini-cli", "windsurf", "cline"]),
  label: z.string().min(1),
  discoveryStatus: ToolEvidenceStatusSchema,
  surface: z.string().min(1),
  checkedSurfaces: z.array(z.string().min(1)),
  matchedFiles: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
  details: z.record(z.string(), z.unknown()).optional()
});

export const ToolEvidenceListSchema = z.array(ToolEvidenceSchema);

export type ToolEvidenceStatus = z.infer<typeof ToolEvidenceStatusSchema>;
export type ToolEvidence = z.infer<typeof ToolEvidenceSchema>;

export interface BuildToolEvidenceOptions {
  root: string;
  targetPath: string;
  appliedAgentsFiles: string[];
  maxSurfaceDirectoryEntries?: number;
  maxSurfaceDepth?: number;
}

interface SurfaceScan {
  files: string[];
  truncated: boolean;
}

const MAX_SURFACE_FILES = 100;
const MAX_SURFACE_DIRECTORY_ENTRIES = 10_000;
const MAX_SURFACE_DEPTH = 25;
const MAX_CLAUDE_REFERENCE_RECORDS = 100;
const MAX_CLAUDE_REFERENCE_SCAN_BYTES = 256 * 1024;

export function buildToolEvidence(options: BuildToolEvidenceOptions): ToolEvidence[] {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const targetPath = path.resolve(options.targetPath);
  const appliedAgentsFiles = orderedUnique(options.appliedAgentsFiles);
  const scanBudget = {
    maxSurfaceDirectoryEntries: options.maxSurfaceDirectoryEntries ?? MAX_SURFACE_DIRECTORY_ENTRIES,
    maxSurfaceDepth: options.maxSurfaceDepth ?? MAX_SURFACE_DEPTH
  };
  const cursorScan = scanCursorSurfaces(root, scanBudget);
  const claudeScan = scanClaudeSurfaces(root, targetPath, scanBudget);
  const copilotScan = scanCopilotSurfaces(root, scanBudget);
  const geminiScan = scanGeminiSurfaces(root, targetPath);
  const windsurfScan = scanWindsurfSurfaces(root, scanBudget);
  const clineScan = scanClineSurfaces(root, scanBudget);

  return ToolEvidenceListSchema.parse([
    buildCodexEvidence(appliedAgentsFiles),
    buildCursorEvidence(appliedAgentsFiles, cursorScan),
    buildClaudeEvidence(claudeScan),
    buildCopilotEvidence(appliedAgentsFiles, copilotScan),
    buildGeminiEvidence(appliedAgentsFiles, geminiScan),
    buildWindsurfEvidence(appliedAgentsFiles, windsurfScan),
    buildClineEvidence(appliedAgentsFiles, clineScan)
  ]);
}

function buildCodexEvidence(appliedAgentsFiles: string[]): ToolEvidence {
  return {
    toolId: "codex",
    label: "Codex",
    discoveryStatus: appliedAgentsFiles.length > 0 ? "native" : "not_found",
    surface: "AGENTS.md ancestry",
    checkedSurfaces: ["AGENTS.md ancestry"],
    matchedFiles: appliedAgentsFiles,
    limitations: appliedAgentsFiles.length > 0 ? [] : ["no-agents-md-in-target-ancestry"]
  };
}

function buildCursorEvidence(appliedAgentsFiles: string[], cursorScan: SurfaceScan): ToolEvidence {
  const limitations = [...(cursorScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (cursorScan.files.length > 0) {
    return {
      toolId: "cursor",
      label: "Cursor",
      discoveryStatus: "partial",
      surface: ".cursor/rules/*.mdc and legacy .cursorrules",
      checkedSurfaces: [".cursor/rules/**/*.mdc", ".cursorrules"],
      matchedFiles: cursorScan.files,
      limitations: [...limitations, "cursor-rule-glob-semantics-not-modeled"]
    };
  }

  if (appliedAgentsFiles.length > 0) {
    return {
      toolId: "cursor",
      label: "Cursor",
      discoveryStatus: "compatible",
      surface: "AGENTS.md compatibility signal",
      checkedSurfaces: [".cursor/rules/**/*.mdc", ".cursorrules", "AGENTS.md ancestry"],
      matchedFiles: appliedAgentsFiles,
      limitations: [
        ...limitations,
        "cursor-native-rules-not-found",
        "cursor-agents-md-runtime-semantics-not-attested"
      ]
    };
  }

  return {
    toolId: "cursor",
    label: "Cursor",
    discoveryStatus: "not_found",
    surface: ".cursor/rules/*.mdc and legacy .cursorrules",
    checkedSurfaces: [".cursor/rules/**/*.mdc", ".cursorrules"],
    matchedFiles: [],
    limitations: [...limitations, "cursor-native-rules-not-found"]
  };
}

function buildClaudeEvidence(claudeScan: ClaudeSurfaceScan): ToolEvidence {
  const limitations = [...(claudeScan.truncated ? ["surface-file-list-truncated"] : [])];
  const details = buildClaudeDetails(claudeScan);

  if (claudeScan.files.length > 0) {
    return {
      toolId: "claude-code",
      label: "Claude Code",
      discoveryStatus: "partial",
      surface: "CLAUDE.md, .claude/**/*.md, .claude/commands, and local settings",
      checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md", ".claude/commands/**/*.md", ".claude/settings.json"],
      matchedFiles: claudeScan.files,
      limitations: [
        ...limitations,
        "claude-import-semantics-not-modeled",
        "claude-slash-command-runtime-not-attested",
        "claude-settings-values-not-interpreted",
        "claude-memory-scope-not-attested"
      ],
      ...(Object.keys(details).length > 0 ? { details } : {})
    };
  }

  return {
    toolId: "claude-code",
    label: "Claude Code",
    discoveryStatus: "not_found",
    surface: "CLAUDE.md, .claude/**/*.md, .claude/commands, and local settings",
    checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md", ".claude/commands/**/*.md", ".claude/settings.json"],
    matchedFiles: [],
    limitations: ["claude-native-memory-not-found"]
  };
}

function buildCopilotEvidence(appliedAgentsFiles: string[], copilotScan: SurfaceScan): ToolEvidence {
  const limitations = [...(copilotScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (copilotScan.files.length > 0) {
    return {
      toolId: "github-copilot",
      label: "GitHub Copilot",
      discoveryStatus: "partial",
      surface: "Copilot repository and path-specific instructions",
      checkedSurfaces: [".github/copilot-instructions.md", ".github/instructions/**/*.instructions.md"],
      matchedFiles: copilotScan.files,
      limitations: [
        ...limitations,
        "copilot-path-specific-activation-not-modeled",
        "copilot-runtime-context-not-attested"
      ]
    };
  }

  if (appliedAgentsFiles.length > 0) {
    return {
      toolId: "github-copilot",
      label: "GitHub Copilot",
      discoveryStatus: "compatible",
      surface: "AGENTS.md compatibility signal",
      checkedSurfaces: [".github/copilot-instructions.md", ".github/instructions/**/*.instructions.md", "AGENTS.md ancestry"],
      matchedFiles: appliedAgentsFiles,
      limitations: [
        ...limitations,
        "copilot-native-instructions-not-found",
        "copilot-agents-md-runtime-semantics-not-attested"
      ]
    };
  }

  return {
    toolId: "github-copilot",
    label: "GitHub Copilot",
    discoveryStatus: "not_found",
    surface: "Copilot repository and path-specific instructions",
    checkedSurfaces: [".github/copilot-instructions.md", ".github/instructions/**/*.instructions.md"],
    matchedFiles: [],
    limitations: ["copilot-instructions-not-found"]
  };
}

function buildGeminiEvidence(appliedAgentsFiles: string[], geminiScan: SurfaceScan): ToolEvidence {
  const limitations = [...(geminiScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (geminiScan.files.length > 0) {
    return {
      toolId: "gemini-cli",
      label: "Gemini CLI",
      discoveryStatus: "partial",
      surface: "GEMINI.md ancestry and local Gemini settings",
      checkedSurfaces: ["GEMINI.md ancestry", ".gemini/settings.json"],
      matchedFiles: geminiScan.files,
      limitations: [
        ...limitations,
        "gemini-import-semantics-not-modeled",
        "gemini-settings-values-not-interpreted",
        "gemini-runtime-context-not-attested"
      ]
    };
  }

  if (appliedAgentsFiles.length > 0) {
    return {
      toolId: "gemini-cli",
      label: "Gemini CLI",
      discoveryStatus: "compatible",
      surface: "AGENTS.md configurable context filename signal",
      checkedSurfaces: ["GEMINI.md ancestry", ".gemini/settings.json", "AGENTS.md ancestry"],
      matchedFiles: appliedAgentsFiles,
      limitations: [
        ...limitations,
        "gemini-native-files-not-found",
        "gemini-agents-md-config-not-attested"
      ]
    };
  }

  return {
    toolId: "gemini-cli",
    label: "Gemini CLI",
    discoveryStatus: "not_found",
    surface: "GEMINI.md ancestry and local Gemini settings",
    checkedSurfaces: ["GEMINI.md ancestry", ".gemini/settings.json"],
    matchedFiles: [],
    limitations: ["gemini-native-files-not-found"]
  };
}

function buildWindsurfEvidence(appliedAgentsFiles: string[], windsurfScan: SurfaceScan): ToolEvidence {
  const limitations = [...(windsurfScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (windsurfScan.files.length > 0) {
    return {
      toolId: "windsurf",
      label: "Windsurf",
      discoveryStatus: "partial",
      surface: ".windsurf/rules/*.md and AGENTS.md compatibility signal",
      checkedSurfaces: [".windsurf/rules/**/*.md", "AGENTS.md ancestry"],
      matchedFiles: windsurfScan.files,
      limitations: [
        ...limitations,
        "windsurf-rule-activation-not-modeled",
        "windsurf-runtime-context-not-attested"
      ]
    };
  }

  if (appliedAgentsFiles.length > 0) {
    return {
      toolId: "windsurf",
      label: "Windsurf",
      discoveryStatus: "compatible",
      surface: "AGENTS.md compatibility signal",
      checkedSurfaces: [".windsurf/rules/**/*.md", "AGENTS.md ancestry"],
      matchedFiles: appliedAgentsFiles,
      limitations: [
        ...limitations,
        "windsurf-native-rules-not-found",
        "windsurf-agents-md-runtime-semantics-not-attested"
      ]
    };
  }

  return {
    toolId: "windsurf",
    label: "Windsurf",
    discoveryStatus: "not_found",
    surface: ".windsurf/rules/*.md and AGENTS.md compatibility signal",
    checkedSurfaces: [".windsurf/rules/**/*.md", "AGENTS.md ancestry"],
    matchedFiles: [],
    limitations: ["windsurf-native-rules-not-found"]
  };
}

function buildClineEvidence(appliedAgentsFiles: string[], clineScan: SurfaceScan): ToolEvidence {
  const limitations = [...(clineScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (clineScan.files.length > 0) {
    return {
      toolId: "cline",
      label: "Cline",
      discoveryStatus: "partial",
      surface: ".clinerules, legacy rule files, and AGENTS.md compatibility signal",
      checkedSurfaces: [".clinerules/**/*.{md,txt}", ".cursorrules", ".windsurfrules", "AGENTS.md ancestry"],
      matchedFiles: clineScan.files,
      limitations: [
        ...limitations,
        "cline-rule-activation-not-modeled",
        "cline-runtime-context-not-attested"
      ]
    };
  }

  if (appliedAgentsFiles.length > 0) {
    return {
      toolId: "cline",
      label: "Cline",
      discoveryStatus: "compatible",
      surface: "AGENTS.md compatibility signal",
      checkedSurfaces: [".clinerules/**/*.{md,txt}", ".cursorrules", ".windsurfrules", "AGENTS.md ancestry"],
      matchedFiles: appliedAgentsFiles,
      limitations: [
        ...limitations,
        "cline-native-rules-not-found",
        "cline-agents-md-runtime-semantics-not-attested"
      ]
    };
  }

  return {
    toolId: "cline",
    label: "Cline",
    discoveryStatus: "not_found",
    surface: ".clinerules, legacy rule files, and AGENTS.md compatibility signal",
    checkedSurfaces: [".clinerules/**/*.{md,txt}", ".cursorrules", ".windsurfrules", "AGENTS.md ancestry"],
    matchedFiles: [],
    limitations: ["cline-native-rules-not-found"]
  };
}

function scanCursorSurfaces(root: string, budget: SurfaceScanBudget): SurfaceScan {
  const legacyFile = existingFile(root, ".cursorrules");
  const rules = collectFiles({
    root,
    directory: ".cursor/rules",
    extensions: [".mdc"],
    ...budget
  });
  const combinedFiles = orderedUnique([...legacyFile, ...rules.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: rules.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
}

function scanCopilotSurfaces(root: string, budget: SurfaceScanBudget): SurfaceScan {
  const repoInstructions = existingFile(root, ".github/copilot-instructions.md");
  const pathInstructions = collectFiles({
    root,
    directory: ".github/instructions",
    fileSuffixes: [".instructions.md"],
    ...budget
  });
  const combinedFiles = orderedUnique([...repoInstructions, ...pathInstructions.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: pathInstructions.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
}

function scanGeminiSurfaces(root: string, targetPath: string): SurfaceScan {
  const ancestryFiles = findAncestryFiles(root, targetPath, "GEMINI.md");
  const settingsFile = existingFile(root, ".gemini/settings.json");
  const combinedFiles = orderedUnique([...ancestryFiles, ...settingsFile]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: combinedFiles.length > MAX_SURFACE_FILES
  };
}

function scanWindsurfSurfaces(root: string, budget: SurfaceScanBudget): SurfaceScan {
  return collectFiles({
    root,
    directory: ".windsurf/rules",
    extensions: [".md"],
    ...budget
  });
}

function scanClineSurfaces(root: string, budget: SurfaceScanBudget): SurfaceScan {
  const legacyFiles = [
    ...existingFile(root, ".cursorrules"),
    ...existingFile(root, ".windsurfrules")
  ];
  const rules = collectFiles({
    root,
    directory: ".clinerules",
    extensions: [".md", ".txt"],
    ...budget
  });
  const combinedFiles = orderedUnique([...legacyFiles, ...rules.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: rules.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
}

interface ClaudeReference {
  file: string;
  line: number;
  reference: string;
  status: "found" | "missing" | "outside_root" | "nonlocal" | "symlink_ignored";
  target?: string;
}

interface ClaudeSurfaceScan extends SurfaceScan {
  commandFiles: string[];
  settingsFiles: string[];
  importReferences: ClaudeReference[];
  slashCommandReferences: ClaudeReference[];
  referenceRecordsTruncated: boolean;
}

function scanClaudeSurfaces(root: string, targetPath: string, budget: SurfaceScanBudget): ClaudeSurfaceScan {
  const ancestryFiles = findAncestryFiles(root, targetPath, "CLAUDE.md");
  const claudeMarkdown = collectFiles({
    root,
    directory: ".claude",
    extensions: [".md"],
    ...budget
  });
  const commandFilesScan = collectFiles({
    root,
    directory: ".claude/commands",
    extensions: [".md"],
    ...budget
  });
  const settingsFiles = existingFile(root, ".claude/settings.json");
  const combinedFiles = orderedUnique([...ancestryFiles, ...claudeMarkdown.files, ...settingsFiles]);
  const referenceScan = scanClaudeReferences(root, orderedUnique([...ancestryFiles, ...claudeMarkdown.files]), commandFilesScan.files);

  return {
    files: truncateFiles(combinedFiles),
    commandFiles: truncateFiles(commandFilesScan.files),
    settingsFiles,
    importReferences: referenceScan.importReferences,
    slashCommandReferences: referenceScan.slashCommandReferences,
    referenceRecordsTruncated: referenceScan.truncated,
    truncated:
      claudeMarkdown.truncated ||
      commandFilesScan.truncated ||
      referenceScan.truncated ||
      combinedFiles.length > MAX_SURFACE_FILES ||
      commandFilesScan.files.length > MAX_SURFACE_FILES
  };
}

function buildClaudeDetails(claudeScan: ClaudeSurfaceScan): Record<string, unknown> {
  return {
    ...(claudeScan.settingsFiles.length > 0 ? { settingsFiles: claudeScan.settingsFiles } : {}),
    ...(claudeScan.commandFiles.length > 0 ? { commandFiles: claudeScan.commandFiles } : {}),
    ...(claudeScan.importReferences.length > 0 ? { importReferences: claudeScan.importReferences } : {}),
    ...(claudeScan.slashCommandReferences.length > 0 ? { slashCommandReferences: claudeScan.slashCommandReferences } : {}),
    ...(claudeScan.referenceRecordsTruncated ? { referenceRecordsTruncated: true } : {})
  };
}

function scanClaudeReferences(
  root: string,
  markdownFiles: string[],
  commandFiles: string[]
): { importReferences: ClaudeReference[]; slashCommandReferences: ClaudeReference[]; truncated: boolean } {
  const importReferences: ClaudeReference[] = [];
  const slashCommandReferences: ClaudeReference[] = [];
  const commandTargets = buildClaudeCommandTargetMap(commandFiles);
  let truncated = false;

  for (const file of markdownFiles) {
    const content = readSmallTextFile(root, file);
    if (content === undefined) {
      continue;
    }

    const lines = content.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      collectClaudeImportReferences({
        root,
        file,
        line,
        lineNumber: index + 1,
        references: importReferences
      });
      collectClaudeSlashCommandReferences({
        file,
        line,
        lineNumber: index + 1,
        commandTargets,
        references: slashCommandReferences
      });

      if (importReferences.length + slashCommandReferences.length > MAX_CLAUDE_REFERENCE_RECORDS) {
        truncated = true;
        return {
          importReferences: importReferences.slice(0, MAX_CLAUDE_REFERENCE_RECORDS),
          slashCommandReferences: slashCommandReferences.slice(0, MAX_CLAUDE_REFERENCE_RECORDS),
          truncated
        };
      }
    }
  }

  return { importReferences, slashCommandReferences, truncated };
}

function collectClaudeImportReferences(options: {
  root: string;
  file: string;
  line: string;
  lineNumber: number;
  references: ClaudeReference[];
}): void {
  const importPattern = /(^|[\s([`])@([^\s)`,]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(options.line)) !== null) {
    const reference = normalizeClaudeReference(match[2] ?? "");
    if (reference.length === 0) {
      continue;
    }

    options.references.push(resolveClaudeImportReference(options.root, options.file, options.lineNumber, reference));
  }
}

function collectClaudeSlashCommandReferences(options: {
  file: string;
  line: string;
  lineNumber: number;
  commandTargets: Map<string, string>;
  references: ClaudeReference[];
}): void {
  const commandPattern = /(^|[\s([`])\/project:([A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)*)/gu;
  let match: RegExpExecArray | null;

  while ((match = commandPattern.exec(options.line)) !== null) {
    const commandName = match[2] ?? "";
    const target = options.commandTargets.get(commandName);
    options.references.push({
      file: options.file,
      line: options.lineNumber,
      reference: `/project:${commandName}`,
      status: target ? "found" : "missing",
      ...(target ? { target } : {})
    });
  }
}

function resolveClaudeImportReference(root: string, sourceFile: string, line: number, reference: string): ClaudeReference {
  if (isNonlocalClaudeReference(reference)) {
    return {
      file: sourceFile,
      line,
      reference,
      status: "nonlocal"
    };
  }

  const sourceDirectory = path.dirname(path.join(root, sourceFile));
  const absoluteTarget = path.isAbsolute(reference) ? path.resolve(reference) : path.resolve(sourceDirectory, reference);

  if (!isPathInsideRoot(root, absoluteTarget)) {
    return {
      file: sourceFile,
      line,
      reference,
      status: "outside_root"
    };
  }

  const target = normalizeRelativePath(path.relative(root, absoluteTarget));
  if (!fs.existsSync(absoluteTarget)) {
    return {
      file: sourceFile,
      line,
      reference,
      status: "missing",
      target
    };
  }

  const stats = fs.lstatSync(absoluteTarget);
  if (stats.isSymbolicLink()) {
    return {
      file: sourceFile,
      line,
      reference,
      status: "symlink_ignored",
      target
    };
  }

  return {
    file: sourceFile,
    line,
    reference,
    status: "found",
    target
  };
}

function isNonlocalClaudeReference(reference: string): boolean {
  return (
    reference.startsWith("~") ||
    reference.startsWith("http://") ||
    reference.startsWith("https://") ||
    reference.startsWith("mailto:") ||
    reference.startsWith("#")
  );
}

function normalizeClaudeReference(reference: string): string {
  return reference.replace(/[.;:]+$/u, "");
}

function buildClaudeCommandTargetMap(commandFiles: string[]): Map<string, string> {
  const commandTargets = new Map<string, string>();

  for (const file of commandFiles) {
    const relativeCommand = normalizeRelativePath(path.relative(".claude/commands", file)).replace(/\.md$/u, "");
    commandTargets.set(relativeCommand, file);
  }

  return commandTargets;
}

function readSmallTextFile(root: string, relativePath: string): string | undefined {
  const absolutePath = path.join(root, relativePath);
  if (!isPathInsideRoot(root, absolutePath) || !fs.existsSync(absolutePath)) {
    return undefined;
  }

  const stats = fs.lstatSync(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_CLAUDE_REFERENCE_SCAN_BYTES) {
    return undefined;
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function findAncestryFiles(root: string, targetPath: string, fileName: string): string[] {
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
    .flatMap((directory) => existingPath(path.join(directory, fileName), root));
}

function existingFile(root: string, relativePath: string): string[] {
  return existingPath(path.join(root, relativePath), root);
}

function existingPath(absolutePath: string, root: string): string[] {
  if (!isPathInsideRoot(root, absolutePath) || !fs.existsSync(absolutePath)) {
    return [];
  }

  const stats = fs.lstatSync(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    return [];
  }

  return [normalizeRelativePath(path.relative(root, absolutePath))];
}

interface SurfaceScanBudget {
  maxSurfaceDirectoryEntries: number;
  maxSurfaceDepth: number;
}

function collectFiles(options: {
  root: string;
  directory: string;
  extensions?: string[];
  fileSuffixes?: string[];
  maxSurfaceDirectoryEntries: number;
  maxSurfaceDepth: number;
}): SurfaceScan {
  const absoluteDirectory = path.join(options.root, options.directory);
  const files: string[] = [];
  let truncated = false;
  let visitedEntries = 0;

  if (!isPathInsideRoot(options.root, absoluteDirectory) || !fs.existsSync(absoluteDirectory)) {
    return { files, truncated };
  }

  let rootStats: fs.Stats;
  try {
    rootStats = fs.lstatSync(absoluteDirectory);
  } catch {
    return { files, truncated };
  }

  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    return { files, truncated };
  }

  walkDirectory(absoluteDirectory, 0);

  return {
    files: files.sort((left, right) => left.localeCompare(right)),
    truncated
  };

  function walkDirectory(directory: string, depth: number): void {
    if (files.length >= MAX_SURFACE_FILES) {
      truncated = true;
      return;
    }

    if (depth > options.maxSurfaceDepth) {
      truncated = true;
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > options.maxSurfaceDirectoryEntries) {
        truncated = true;
        return;
      }

      if (files.length >= MAX_SURFACE_FILES) {
        truncated = true;
        return;
      }

      const absolutePath = path.join(directory, entry.name);
      if (!isPathInsideRoot(options.root, absolutePath)) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDirectory(absolutePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const lowerName = entry.name.toLowerCase();
      const extensionMatches = options.extensions?.includes(extension) ?? false;
      const suffixMatches = options.fileSuffixes?.some((suffix) => lowerName.endsWith(suffix.toLowerCase())) ?? false;
      if (!extensionMatches && !suffixMatches) {
        continue;
      }

      files.push(normalizeRelativePath(path.relative(options.root, absolutePath)));
    }
  }
}

function truncateFiles(files: string[]): string[] {
  return files.slice(0, MAX_SURFACE_FILES);
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

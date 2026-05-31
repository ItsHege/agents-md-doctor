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
  limitations: z.array(z.string().min(1))
});

export const ToolEvidenceListSchema = z.array(ToolEvidenceSchema);

export type ToolEvidenceStatus = z.infer<typeof ToolEvidenceStatusSchema>;
export type ToolEvidence = z.infer<typeof ToolEvidenceSchema>;

export interface BuildToolEvidenceOptions {
  root: string;
  targetPath: string;
  appliedAgentsFiles: string[];
}

interface SurfaceScan {
  files: string[];
  truncated: boolean;
}

const MAX_SURFACE_FILES = 100;

export function buildToolEvidence(options: BuildToolEvidenceOptions): ToolEvidence[] {
  const root = fs.realpathSync.native(path.resolve(options.root));
  const targetPath = path.resolve(options.targetPath);
  const appliedAgentsFiles = orderedUnique(options.appliedAgentsFiles);
  const cursorScan = scanCursorSurfaces(root);
  const claudeScan = scanClaudeSurfaces(root, targetPath);
  const copilotScan = scanCopilotSurfaces(root);
  const geminiScan = scanGeminiSurfaces(root, targetPath);
  const windsurfScan = scanWindsurfSurfaces(root);
  const clineScan = scanClineSurfaces(root);

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

function buildClaudeEvidence(claudeScan: SurfaceScan): ToolEvidence {
  const limitations = [...(claudeScan.truncated ? ["surface-file-list-truncated"] : [])];

  if (claudeScan.files.length > 0) {
    return {
      toolId: "claude-code",
      label: "Claude Code",
      discoveryStatus: "partial",
      surface: "CLAUDE.md and .claude/**/*.md",
      checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md"],
      matchedFiles: claudeScan.files,
      limitations: [
        ...limitations,
        "claude-import-semantics-not-modeled",
        "claude-memory-scope-not-attested"
      ]
    };
  }

  return {
    toolId: "claude-code",
    label: "Claude Code",
    discoveryStatus: "not_found",
    surface: "CLAUDE.md and .claude/**/*.md",
    checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md"],
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

function scanCursorSurfaces(root: string): SurfaceScan {
  const legacyFile = existingFile(root, ".cursorrules");
  const rules = collectFiles({
    root,
    directory: ".cursor/rules",
    extensions: [".mdc"]
  });
  const combinedFiles = orderedUnique([...legacyFile, ...rules.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: rules.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
}

function scanCopilotSurfaces(root: string): SurfaceScan {
  const repoInstructions = existingFile(root, ".github/copilot-instructions.md");
  const pathInstructions = collectFiles({
    root,
    directory: ".github/instructions",
    fileSuffixes: [".instructions.md"]
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

function scanWindsurfSurfaces(root: string): SurfaceScan {
  return collectFiles({
    root,
    directory: ".windsurf/rules",
    extensions: [".md"]
  });
}

function scanClineSurfaces(root: string): SurfaceScan {
  const legacyFiles = [
    ...existingFile(root, ".cursorrules"),
    ...existingFile(root, ".windsurfrules")
  ];
  const rules = collectFiles({
    root,
    directory: ".clinerules",
    extensions: [".md", ".txt"]
  });
  const combinedFiles = orderedUnique([...legacyFiles, ...rules.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: rules.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
}

function scanClaudeSurfaces(root: string, targetPath: string): SurfaceScan {
  const ancestryFiles = findAncestryFiles(root, targetPath, "CLAUDE.md");
  const claudeMarkdown = collectFiles({
    root,
    directory: ".claude",
    extensions: [".md"]
  });
  const combinedFiles = orderedUnique([...ancestryFiles, ...claudeMarkdown.files]);

  return {
    files: truncateFiles(combinedFiles),
    truncated: claudeMarkdown.truncated || combinedFiles.length > MAX_SURFACE_FILES
  };
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

function collectFiles(options: { root: string; directory: string; extensions?: string[]; fileSuffixes?: string[] }): SurfaceScan {
  const absoluteDirectory = path.join(options.root, options.directory);
  const files: string[] = [];
  let truncated = false;

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

  walkDirectory(absoluteDirectory);

  return {
    files: files.sort((left, right) => left.localeCompare(right)),
    truncated
  };

  function walkDirectory(directory: string): void {
    if (files.length >= MAX_SURFACE_FILES) {
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
        walkDirectory(absolutePath);
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

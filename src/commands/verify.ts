import fs from "node:fs";
import path from "node:path";
import { applyToolProfileOverride, loadConfig, validateIgnorePatterns } from "../config/index.js";
import { buildInstructionGraphFindings } from "../core/instruction-graph-findings.js";
import { buildInstructionGraph, type InstructionGraph } from "../core/instruction-graph.js";
import type { ToolProfile } from "../core/tool-profile.js";
import { findAgentsFiles } from "../discovery/index.js";
import { AppError, isAppError } from "../errors.js";
import { readTextFileWithinRoot } from "../io/index.js";
import { normalizeRelativePath } from "../path-utils.js";
import { buildReport } from "../report/index.js";
import { renderReport, resolveOutputFormat, type OutputFormat } from "../render/index.js";
import { lintRules, type LoadedAgentsFile } from "../rules/index.js";
import { runRules } from "../runner/index.js";
import type { Finding, ExitCode } from "../types/index.js";

export interface VerifyCommandOptions {
  root?: string;
  json: boolean;
  format?: OutputFormat;
  strict?: boolean;
  failOnWarning?: boolean;
  ignore?: string[];
  maxLines?: number;
  profile?: ToolProfile;
}

export interface CommandResult {
  exitCode: ExitCode;
  stdout: string;
  stderr: string;
}

export function runVerifyCommand(options: VerifyCommandOptions): CommandResult {
  try {
    const root = resolveRoot(options.root ?? process.cwd());
    const config = applyToolProfileOverride(loadConfig({ root }), options.profile);
    const cliIgnore = options.ignore ?? [];
    validateIgnorePatterns(cliIgnore);
    const agentsFiles = findAgentsFiles(root, {
      ignore: [...config.ignore, ...cliIgnore],
      fileNames: config.lintFileNames
    });
    const loadedFiles: LoadedAgentsFile[] = agentsFiles.map((file) => ({
      ...file,
      content: readTextFileWithinRoot({
        root,
        filePath: file.absolutePath
      })
    }));
    const findings = runRules({
      files: loadedFiles,
      rules: lintRules,
      context: {
        root,
        config,
        ...(options.maxLines ? { cliMaxLines: options.maxLines } : {})
      }
    });
    findings.push(...buildCoverageSanityFindings(root, loadedFiles, config.lintFileNames, config.toolProfile));
    if (config.instructionGraph.enabled) {
      const graph = buildInstructionGraph({
        root,
        entryFiles: loadedFiles,
        maxDepth: config.instructionGraph.maxDepth,
        include: config.instructionGraph.include,
        ignore: [...config.ignore, ...cliIgnore]
      });
      const graphFiles = buildLoadedFilesFromGraph(graph);
      const graphRuleFindings = runRules({
        files: graphFiles,
        rules: lintRules,
        context: {
          root,
          config,
          ...(options.maxLines ? { cliMaxLines: options.maxLines } : {})
        }
      }).map((finding) => addGraphProvenance(finding, graph));

      findings.push(...graphRuleFindings, ...buildInstructionGraphFindings(graph, config));
    }
    const failOnWarnings = options.strict === true || options.failOnWarning === true || config.failOnWarning;
    const report = buildReport({
      command: "verify",
      root,
      findings,
      failOnWarnings
    });

    return {
      exitCode: report.exitCode,
      stdout: renderReport(report, {
        command: "verify",
        format: resolveOutputFormat(options),
        strict: failOnWarnings
      }),
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

function buildLoadedFilesFromGraph(graph: InstructionGraph): LoadedAgentsFile[] {
  return graph.nodes
    .filter((node) => node.discoveredBy === "reference" && node.status === "loaded" && typeof node.content === "string")
    .map((node) => ({
      absolutePath: node.absolutePath,
      relativePath: node.id,
      content: node.content ?? "",
      fileClass: node.kind,
      graphDepth: node.depth,
      referencedBy: node.referencedBy
    }));
}

function addGraphProvenance(finding: Finding, graph: InstructionGraph): Finding {
  const node = graph.nodes.find((candidate) => candidate.id === finding.file);

  if (!node) {
    return finding;
  }

  return {
    ...finding,
    details: {
      ...(finding.details ?? {}),
      fileClass: node.kind,
      graphDepth: node.depth,
      referencedBy: node.referencedBy
    }
  };
}

function buildCoverageSanityFindings(
  root: string,
  files: LoadedAgentsFile[],
  lintFileNames: string[],
  toolProfile: ToolProfile
): Finding[] {
  const hasRootAgents = files.some((file) => file.relativePath === "AGENTS.md");
  const fileLabel = lintFileNames.length === 1 && lintFileNames[0] === "AGENTS.md" ? "AGENTS.md file" : "instruction file";
  const findings: Finding[] = [
    {
      ruleId: "coverage.discovery_summary",
      severity: "info",
      message: `Scanned ${files.length} ${fileLabel}${files.length === 1 ? "" : "s"} for lint and inheritance sanity.`,
      file: files[0]?.relativePath,
      line: 1,
      details: {
        agentsFileCount: files.length,
        instructionFileCount: files.length,
        hasRootAgents,
        toolProfile,
        lintFileNames
      }
    }
  ];

  if (files.length === 0) {
    findings.push({
      ruleId: "coverage.no_agents_file",
      severity: "warning",
      message:
        lintFileNames.length === 1 && lintFileNames[0] === "AGENTS.md"
          ? "No AGENTS.md files found in the repository scope."
          : `No configured instruction files found in the repository scope: ${lintFileNames.join(", ")}.`,
      line: 1,
      details: {
        root: normalizeRelativePath(root),
        toolProfile,
        lintFileNames
      }
    });
  }

  if (lintFileNames.includes("AGENTS.md") && !hasRootAgents && files.length > 0) {
    findings.push({
      ruleId: "coverage.root_agents_missing",
      severity: "warning",
      message: "Root AGENTS.md is missing; inheritance may be harder to reason about.",
      line: 1,
      details: {
        nearestAgentsFiles: files.slice(0, 5).map((file) => file.relativePath)
      }
    });
  }

  return findings;
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

function formatErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown runtime failure";
}

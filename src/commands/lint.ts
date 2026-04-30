import fs from "node:fs";
import path from "node:path";
import { findAgentsFiles } from "../discovery/index.js";
import { AppError, isAppError } from "../errors.js";
import { readTextFileWithinRoot } from "../io/index.js";
import { buildReport } from "../report/index.js";
import { renderJsonReport } from "../render/index.js";
import { lintRules, type LoadedAgentsFile } from "../rules/index.js";
import { runRules } from "../runner/index.js";
import type { ExitCode } from "../types/index.js";

export interface LintCommandOptions {
  root?: string;
  json: boolean;
}

export interface CommandResult {
  exitCode: ExitCode;
  stdout: string;
  stderr: string;
}

export function runLintCommand(options: LintCommandOptions): CommandResult {
  try {
    if (!options.root) {
      throw new AppError("E_MISSING_REPO", "repo path is required");
    }

    if (!options.json) {
      throw new AppError("E_JSON_REQUIRED", "pass --json; human output is not implemented yet");
    }

    const root = resolveRoot(options.root);
    const agentsFiles = findAgentsFiles(root);
    const loadedFiles: LoadedAgentsFile[] = agentsFiles.map((file) => ({
      ...file,
      content: readTextFileWithinRoot({
        root,
        filePath: file.absolutePath
      })
    }));
    const findings = runRules({
      files: loadedFiles,
      rules: lintRules
    });
    const report = buildReport({
      command: "lint",
      root,
      findings
    });

    return {
      exitCode: report.exitCode,
      stdout: renderJsonReport(report),
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

function formatErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "unknown runtime failure";
}


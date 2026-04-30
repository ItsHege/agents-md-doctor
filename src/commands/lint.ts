import fs from "node:fs";
import path from "node:path";
import { findAgentsFiles } from "../discovery/index.js";
import { AppError, isAppError } from "../errors.js";
import { readTextFileWithinRoot } from "../io/index.js";
import { buildReport } from "../report/index.js";
import { renderHumanLintReport, renderJsonReport } from "../render/index.js";
import { lintRules, type LoadedAgentsFile } from "../rules/index.js";
import { runRules } from "../runner/index.js";
import type { ExitCode } from "../types/index.js";

export interface LintCommandOptions {
  root?: string;
  json: boolean;
  strict?: boolean;
}

export interface CommandResult {
  exitCode: ExitCode;
  stdout: string;
  stderr: string;
}

export function runLintCommand(options: LintCommandOptions): CommandResult {
  try {
    const root = resolveRoot(options.root ?? process.cwd());
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
      findings,
      failOnWarnings: options.strict === true
    });

    return {
      exitCode: report.exitCode,
      stdout: options.json ? renderJsonReport(report) : renderHumanLintReport(report, { strict: options.strict === true }),
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

import { runExplainCommand, runLintCommand, runVerifyCommand, type CommandResult } from "./commands/index.js";
import { ReportSchema, type ExitCode, type Report } from "./types/index.js";

export type DoctorUiCommand = "lint" | "verify" | "explain";

interface SharedReportOptions {
  root?: string;
}

export interface RunLintReportOptions extends SharedReportOptions {
  command: "lint";
  failOnWarning?: boolean;
  ignore?: string[];
  maxLines?: number;
  strict?: boolean;
}

export interface RunVerifyReportOptions extends SharedReportOptions {
  command: "verify";
  failOnWarning?: boolean;
  ignore?: string[];
  maxLines?: number;
  strict?: boolean;
}

export interface RunExplainReportOptions extends SharedReportOptions {
  command: "explain";
  targetPath: string;
}

export type RunDoctorReportOptions = RunLintReportOptions | RunVerifyReportOptions | RunExplainReportOptions;

export type DoctorReportResult =
  | {
      ok: true;
      exitCode: Extract<ExitCode, 0 | 1>;
      report: Report;
      stderr: "";
    }
  | {
      ok: false;
      exitCode: Extract<ExitCode, 2>;
      error: string;
      stderr: string;
    };

export function runDoctorReport(options: RunDoctorReportOptions): DoctorReportResult {
  if (!isSupportedCommand(options.command)) {
    return buildRunFailure(`unsupported command: ${String(options.command)}`);
  }

  if (options.command === "lint") {
    return parseReportResult(
      runLintCommand({
        root: options.root,
        json: true,
        strict: options.strict,
        failOnWarning: options.failOnWarning,
        ignore: options.ignore,
        maxLines: options.maxLines
      })
    );
  }

  if (options.command === "verify") {
    return parseReportResult(
      runVerifyCommand({
        root: options.root,
        json: true,
        strict: options.strict,
        failOnWarning: options.failOnWarning,
        ignore: options.ignore,
        maxLines: options.maxLines
      })
    );
  }

  if (typeof options.targetPath !== "string" || options.targetPath.trim().length === 0) {
    return buildRunFailure("explain requires a target path");
  }

  return parseReportResult(
    runExplainCommand({
      root: options.root,
      targetPath: options.targetPath,
      json: true
    })
  );
}

export function runLintReport(options: Omit<RunLintReportOptions, "command"> = {}): DoctorReportResult {
  return runDoctorReport({
    command: "lint",
    ...options
  });
}

export function runVerifyReport(options: Omit<RunVerifyReportOptions, "command"> = {}): DoctorReportResult {
  return runDoctorReport({
    command: "verify",
    ...options
  });
}

export function runExplainReport(options: Omit<RunExplainReportOptions, "command">): DoctorReportResult {
  return runDoctorReport({
    command: "explain",
    ...options
  });
}

function parseReportResult(result: CommandResult): DoctorReportResult {
  if (result.exitCode === 2) {
    return buildRunFailure(cleanErrorMessage(result.stderr), result.stderr);
  }

  try {
    const report = ReportSchema.parse(JSON.parse(result.stdout)) as Report;

    if (report.exitCode === 2) {
      return buildRunFailure("agents-doctor returned a runtime failure report");
    }

    return {
      ok: true,
      exitCode: report.exitCode,
      report,
      stderr: ""
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown report parse failure";
    return buildRunFailure(`invalid agents-doctor report: ${message}`);
  }
}

function buildRunFailure(error: string, stderr = ""): DoctorReportResult {
  return {
    ok: false,
    exitCode: 2,
    error,
    stderr
  };
}

function cleanErrorMessage(stderr: string): string {
  const trimmed = stderr.trim();
  return trimmed.length > 0 ? trimmed : "agents-doctor run failed";
}

function isSupportedCommand(command: unknown): command is DoctorUiCommand {
  return command === "lint" || command === "verify" || command === "explain";
}

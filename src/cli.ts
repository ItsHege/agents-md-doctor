#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runExplainCommand, runInitCommand, runLintCommand, runVerifyCommand, type CommandResult } from "./commands/index.js";
import { ToolProfileSchema, type ToolProfile } from "./core/tool-profile.js";
import type { OutputFormat } from "./render/index.js";
import { SeveritySchema, type Severity } from "./types/index.js";

export function runCli(argv = process.argv): CommandResult {
  const program = new Command();
  let result: CommandResult | undefined;
  let stdout = "";
  let stderr = "";

  program
    .name("agents-doctor")
    .description("Repo-aware CLI and CI tool for validating AGENTS.md instructions.")
    .version(readPackageVersion(), "--version", "print agents-doctor version")
    .exitOverride()
    .configureOutput({
      writeOut: (message) => {
        stdout += message;
      },
      writeErr: (message) => {
        stderr += message;
      }
    });

  program
    .command("init")
    .description("Create a starter .agents-doctor.json config.")
    .argument("[repo]", "repository root")
    .option("--force", "overwrite an existing .agents-doctor.json")
    .action((repo: string | undefined, options: { force?: boolean }) => {
      result = runInitCommand({
        root: repo,
        force: options.force === true
      });
    });

  program
    .command("lint")
    .description("Lint AGENTS.md instruction files.")
    .argument("[repo]", "repository root")
    .option("--format <format>", "emit output as human, json, github, or sarif")
    .option("--json", "emit JSON report")
    .option("--strict", "exit 1 when warnings are present")
    .option("--fail-on-warning", "exit 1 when warnings are present")
    .option("--ignore <glob>", "ignore repo-relative paths matching a glob", collectOption, [])
    .option("--max-lines <number>", "override the AGENTS.md line-count warning threshold")
    .option("--annotations-min-severity <severity>", "minimum severity for --format github annotations: info, warning, or error")
    .option("--profile <profile>", "focus checks on auto, codex, claude-code, cursor, gemini-cli, github-copilot, windsurf, or cline")
    .action(
      (
        repo: string | undefined,
        options: {
          failOnWarning?: boolean;
          format?: string;
          ignore?: string[];
          annotationsMinSeverity?: string;
          json?: boolean;
          maxLines?: string;
          profile?: string;
          strict?: boolean;
        }
      ) => {
      result = runLintCommand({
        root: repo,
        format: options.format ? parseOutputFormat(options.format) : undefined,
        json: options.json === true,
        strict: options.strict === true,
        failOnWarning: options.failOnWarning === true,
        ignore: options.ignore ?? [],
        maxLines: options.maxLines ? parsePositiveIntegerOption("--max-lines", options.maxLines) : undefined,
        annotationMinSeverity: options.annotationsMinSeverity
          ? parseSeverityOption("--annotations-min-severity", options.annotationsMinSeverity)
          : undefined,
        profile: options.profile ? parseToolProfileOption(options.profile) : undefined
      });
    }
    );

  program
    .command("verify")
    .description("Run lint plus inheritance/coverage sanity checks for AGENTS.md.")
    .argument("[repo]", "repository root")
    .option("--format <format>", "emit output as human, json, github, or sarif")
    .option("--json", "emit JSON report")
    .option("--strict", "exit 1 when warnings are present")
    .option("--fail-on-warning", "exit 1 when warnings are present")
    .option("--ignore <glob>", "ignore repo-relative paths matching a glob", collectOption, [])
    .option("--max-lines <number>", "override the AGENTS.md line-count warning threshold")
    .option("--context-hygiene", "run opt-in context hygiene scan for stale and overlapping planning files")
    .option("--context-stale-days <days>", "override context hygiene stale planning threshold in days")
    .option("--annotations-min-severity <severity>", "minimum severity for --format github annotations: info, warning, or error")
    .option("--profile <profile>", "focus checks on auto, codex, claude-code, cursor, gemini-cli, github-copilot, windsurf, or cline")
    .action(
      (
        repo: string | undefined,
        options: {
          failOnWarning?: boolean;
          format?: string;
          ignore?: string[];
          annotationsMinSeverity?: string;
          json?: boolean;
          maxLines?: string;
          contextHygiene?: boolean;
          contextStaleDays?: string;
          profile?: string;
          strict?: boolean;
        }
      ) => {
        result = runVerifyCommand({
          root: repo,
          format: options.format ? parseOutputFormat(options.format) : undefined,
          json: options.json === true,
          strict: options.strict === true,
          failOnWarning: options.failOnWarning === true,
          ignore: options.ignore ?? [],
          maxLines: options.maxLines ? parsePositiveIntegerOption("--max-lines", options.maxLines) : undefined,
          contextHygiene: options.contextHygiene === true,
          contextStaleDays: options.contextStaleDays
            ? parsePositiveIntegerOption("--context-stale-days", options.contextStaleDays)
            : undefined,
          annotationMinSeverity: options.annotationsMinSeverity
            ? parseSeverityOption("--annotations-min-severity", options.annotationsMinSeverity)
            : undefined,
          profile: options.profile ? parseToolProfileOption(options.profile) : undefined
        });
      }
    );

  program
    .command("explain")
    .description("Show which AGENTS.md files apply to a target path.")
    .argument("<target>", "target file or directory path")
    .argument("[repo]", "repository root")
    .option("--json", "emit JSON report")
    .option("--profile <profile>", "focus tool evidence on auto, codex, claude-code, cursor, gemini-cli, github-copilot, windsurf, or cline")
    .action((target: string, repo: string | undefined, options: { json?: boolean; profile?: string }) => {
      result = runExplainCommand({
        targetPath: target,
        root: repo,
        json: options.json === true,
        profile: options.profile ? parseToolProfileOption(options.profile) : undefined
      });
    });

  if (argv.length <= 2) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: 'agents-doctor: error: command is required\nRun "agents-doctor --help" for usage.\n'
    };
  }

  try {
    program.parse(argv);
  } catch (error) {
    if (isCommanderSuccessExit(error)) {
      return {
        exitCode: 0,
        stdout,
        stderr: ""
      };
    }

    const message = error instanceof Error ? error.message : "unknown command error";
    return {
      exitCode: 2,
      stdout: "",
      stderr: formatCommanderError(message, stderr)
    };
  }

  return (
    result ?? {
      exitCode: 2,
      stdout: "",
      stderr: 'agents-doctor: error: command is required\nRun "agents-doctor --help" for usage.\n'
    }
  );
}

export function main(argv = process.argv): void {
  const result = runCli(argv);

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

function isCommanderSuccessExit(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: unknown }).code === "commander.helpDisplayed" ||
      (error as { code?: unknown }).code === "commander.version")
  );
}

function readPackageVersion(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(currentFilePath), "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json version must be a non-empty string");
  }

  return packageJson.version;
}

function formatCommanderError(message: string, capturedStderr: string): string {
  const cleanMessage = message.replace(/^error: /, "");
  const cleanCapturedStderr = capturedStderr.replace(/^error: /, "").trim();
  const detail = cleanCapturedStderr.length > 0 ? cleanCapturedStderr : cleanMessage;

  return `agents-doctor: error: ${detail}\nRun "agents-doctor --help" for usage.\n`;
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parsePositiveIntegerOption(optionName: string, value: string): number {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }

  return parsedValue;
}

function parseOutputFormat(value: string): OutputFormat {
  if (value === "human" || value === "json" || value === "github" || value === "sarif") {
    return value;
  }

  throw new Error("--format must be one of: human, json, github, sarif");
}

function parseToolProfileOption(value: string): ToolProfile {
  const parsed = ToolProfileSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error("--profile must be one of: auto, codex, claude-code, cursor, gemini-cli, github-copilot, windsurf, cline");
  }

  return parsed.data;
}

function parseSeverityOption(optionName: string, value: string): Severity {
  const parsed = SeveritySchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`${optionName} must be one of: error, warning, info`);
  }

  return parsed.data;
}

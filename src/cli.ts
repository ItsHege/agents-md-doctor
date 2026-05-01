#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runExplainCommand, runLintCommand, runVerifyCommand, type CommandResult } from "./commands/index.js";

export function runCli(argv = process.argv): CommandResult {
  const program = new Command();
  let result: CommandResult | undefined;
  let stdout = "";
  let stderr = "";

  program
    .name("agents-doctor")
    .description("Repo-aware CLI and CI tool for validating AGENTS.md instructions.")
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
    .command("lint")
    .description("Lint AGENTS.md instruction files.")
    .argument("[repo]", "repository root")
    .option("--json", "emit JSON report")
    .option("--strict", "exit 1 when warnings are present")
    .option("--fail-on-warning", "exit 1 when warnings are present")
    .option("--ignore <glob>", "ignore repo-relative paths matching a glob", collectOption, [])
    .option("--max-lines <number>", "override the AGENTS.md line-count warning threshold")
    .action(
      (
        repo: string | undefined,
        options: {
          failOnWarning?: boolean;
          ignore?: string[];
          json?: boolean;
          maxLines?: string;
          strict?: boolean;
        }
      ) => {
      result = runLintCommand({
        root: repo,
        json: options.json === true,
        strict: options.strict === true,
        failOnWarning: options.failOnWarning === true,
        ignore: options.ignore ?? [],
        maxLines: options.maxLines ? parsePositiveIntegerOption("--max-lines", options.maxLines) : undefined
      });
    }
    );

  program
    .command("verify")
    .description("Run lint plus inheritance/coverage sanity checks for AGENTS.md.")
    .argument("[repo]", "repository root")
    .option("--json", "emit JSON report")
    .option("--strict", "exit 1 when warnings are present")
    .option("--fail-on-warning", "exit 1 when warnings are present")
    .option("--ignore <glob>", "ignore repo-relative paths matching a glob", collectOption, [])
    .option("--max-lines <number>", "override the AGENTS.md line-count warning threshold")
    .action(
      (
        repo: string | undefined,
        options: {
          failOnWarning?: boolean;
          ignore?: string[];
          json?: boolean;
          maxLines?: string;
          strict?: boolean;
        }
      ) => {
        result = runVerifyCommand({
          root: repo,
          json: options.json === true,
          strict: options.strict === true,
          failOnWarning: options.failOnWarning === true,
          ignore: options.ignore ?? [],
          maxLines: options.maxLines ? parsePositiveIntegerOption("--max-lines", options.maxLines) : undefined
        });
      }
    );

  program
    .command("explain")
    .description("Show which AGENTS.md files apply to a target path.")
    .argument("<target>", "target file or directory path")
    .argument("[repo]", "repository root")
    .option("--json", "emit JSON report")
    .action((target: string, repo: string | undefined, options: { json?: boolean }) => {
      result = runExplainCommand({
        targetPath: target,
        root: repo,
        json: options.json === true
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
    if (isCommanderHelp(error)) {
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

function isCommanderHelp(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "commander.helpDisplayed"
  );
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

#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { runLintCommand, type CommandResult } from "./commands/index.js";

export function runCli(argv = process.argv): CommandResult {
  const program = new Command();
  let result: CommandResult | undefined;

  program
    .name("agents-doctor")
    .description("Repo-aware CLI and CI tool for validating AGENTS.md instructions.")
    .exitOverride()
    .configureOutput({
      writeErr: (message) => {
        process.stderr.write(message);
      }
    });

  program
    .command("lint")
    .description("Lint AGENTS.md instruction files.")
    .argument("[repo]", "repository root")
    .option("--json", "emit JSON report")
    .action((repo: string | undefined, options: { json?: boolean }) => {
      result = runLintCommand({
        root: repo,
        json: options.json === true
      });
    });

  try {
    program.parse(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown command error";
    return {
      exitCode: 2,
      stdout: "",
      stderr: `agents-doctor: error: ${message}\n`
    };
  }

  return (
    result ?? {
      exitCode: 2,
      stdout: "",
      stderr: "agents-doctor: error: command is required\n"
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

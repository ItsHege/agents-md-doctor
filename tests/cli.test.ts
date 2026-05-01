import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { ReportSchema } from "../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");

describe("runCli", () => {
  it("dispatches lint --json", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
  });

  it("dispatches explain --json", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "explain",
      "--json",
      "packages/app",
      path.join(fixtureRoot, "nested-agents")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("explain");
    expect(report.findings[0]?.ruleId).toBe("inheritance.applied_chain");
  });

  it("dispatches verify --json", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("verify");
  });

  it("dispatches lint --json with default cwd", () => {
    const previousCwd = process.cwd();

    try {
      process.chdir(path.join(fixtureRoot, "short-agents-file"));
      const result = runCli(["node", "dist/cli.js", "lint", "--json"]);
      const report = ReportSchema.parse(JSON.parse(result.stdout));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(report.command).toBe("lint");
      expect(report.findings).toEqual([]);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("dispatches lint --strict", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "lint",
      "--json",
      "--strict",
      path.join(fixtureRoot, "long-agents-file")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("dispatches lint --fail-on-warning", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "lint",
      "--json",
      "--fail-on-warning",
      path.join(fixtureRoot, "long-agents-file")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("returns top-level help as success", () => {
    const result = runCli(["node", "dist/cli.js", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor");
    expect(result.stdout).toContain("lint");
  });

  it("returns lint help as success", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor lint");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--strict");
    expect(result.stdout).toContain("--fail-on-warning");
    expect(result.stdout).toContain("--ignore");
    expect(result.stdout).toContain("--max-lines");
  });

  it("returns explain help as success", () => {
    const result = runCli(["node", "dist/cli.js", "explain", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor explain");
    expect(result.stdout).toContain("<target>");
    expect(result.stdout).toContain("[repo]");
  });

  it("returns verify help as success", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor verify");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--strict");
    expect(result.stdout).toContain("--fail-on-warning");
    expect(result.stdout).toContain("--ignore");
    expect(result.stdout).toContain("--max-lines");
  });

  it("returns exit 2 for unknown commands", () => {
    const result = runCli(["node", "dist/cli.js", "nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command");
  });

  it("returns exit 2 for unknown options", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--wat"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown option");
  });

  it("returns exit 2 for invalid max-lines values", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--max-lines", "nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--max-lines must be a positive integer");
  });

  it("returns exit 2 when no command is provided", () => {
    const result = runCli(["node", "dist/cli.js"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("command is required");
  });
});

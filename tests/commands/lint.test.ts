import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runLintCommand } from "../../src/commands/index.js";
import { ReportSchema } from "../../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");

describe("runLintCommand", () => {
  it("returns an empty report for repos without AGENTS.md", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "empty-repo"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
    expect(report.findings).toEqual([]);
  });

  it("returns no findings for short AGENTS.md files", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it("returns human output by default for a clean repo", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("agents-doctor lint: OK");
    expect(result.stdout).toContain("No findings.");
    expect(() => JSON.parse(result.stdout)).toThrow();
  });

  it("prints actionable human warnings without failing by default", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("agents-doctor lint: 1 warning");
    expect(result.stdout).toContain("warning size.file_too_long AGENTS.md:1");
    expect(result.stdout).toContain("Recommended maximum: 500 lines.");
  });

  it("returns size.file_too_long for long AGENTS.md files", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.summary).toMatchObject({
      errorCount: 0,
      warningCount: 1,
      infoCount: 0
    });
    expect(report.findings[0]).toMatchObject({
      ruleId: "size.file_too_long",
      severity: "warning",
      file: "AGENTS.md",
      line: 1
    });
  });

  it("defaults repo root to process.cwd when root is omitted", () => {
    const previousCwd = process.cwd();
    const repoRoot = path.join(fixtureRoot, "short-agents-file");

    try {
      process.chdir(repoRoot);
      const result = runLintCommand({
        json: true
      });
      const report = ReportSchema.parse(JSON.parse(result.stdout));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(report.root).toBe(fs.realpathSync.native(process.cwd()));
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("strict mode fails warning-only lint reports without changing finding severity", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true,
      strict: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
    expect(report.summary.warningCount).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("strict mode does not fail clean reports", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: true,
      strict: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(0);
  });
});

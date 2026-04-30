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

  it("requires JSON mode for this slice", () => {
    const result = runLintCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: false
    });

    expect(result).toMatchObject({
      exitCode: 2,
      stdout: ""
    });
    expect(result.stderr).toContain("pass --json");
  });

  it("returns usage failure for missing roots", () => {
    const result = runLintCommand({
      json: true
    });

    expect(result).toMatchObject({
      exitCode: 2,
      stdout: ""
    });
    expect(result.stderr).toContain("repo path is required");
  });
});

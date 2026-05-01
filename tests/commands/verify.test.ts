import path from "node:path";
import { describe, expect, it } from "vitest";
import { runVerifyCommand } from "../../src/commands/index.js";
import { ReportSchema } from "../../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");

describe("runVerifyCommand", () => {
  it("returns verify report with coverage summary info", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("verify");
    expect(report.findings.some((finding) => finding.ruleId === "coverage.discovery_summary")).toBe(true);
  });

  it("includes lint findings inside verify", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.findings.some((finding) => finding.ruleId === "size.file_too_long")).toBe(true);
  });

  it("fails on warning in strict mode", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true,
      strict: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
  });

  it("returns human output by default", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("agents-doctor verify:");
  });
});

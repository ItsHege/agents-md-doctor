import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import { ReportSchema } from "../../src/types/index.js";

describe("buildReport", () => {
  it("derives summary counts and keeps warning-only reports at exit 0", () => {
    const report = buildReport({
      command: "lint",
      root: "C:/repo",
      generatedAt: new Date("2026-04-30T19:30:00.000Z"),
      findings: [
        {
          ruleId: "size.file_too_long",
          severity: "warning",
          message: "AGENTS.md has 501 lines. Recommended maximum: 500 lines.",
          file: "AGENTS.md",
          line: 1
        }
      ]
    });

    expect(report.summary).toEqual({
      errorCount: 0,
      warningCount: 1,
      infoCount: 0
    });
    expect(report.exitCode).toBe(0);
    expect(() => ReportSchema.parse(report)).not.toThrow();
  });

  it("sets exit 1 when an error finding exists", () => {
    const report = buildReport({
      command: "lint",
      root: "C:/repo",
      findings: [
        {
          ruleId: "security.dangerous_instruction",
          severity: "error",
          message: "Dangerous instruction.",
          file: "AGENTS.md",
          line: 1
        }
      ]
    });

    expect(report.summary.errorCount).toBe(1);
    expect(report.exitCode).toBe(1);
  });
});


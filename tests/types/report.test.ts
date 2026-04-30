import { describe, expect, it } from "vitest";
import { ReportSchema } from "../../src/types/report.js";

describe("ReportSchema", () => {
  it("accepts a CI report with findings and run metadata", () => {
    const report = ReportSchema.parse({
      schemaVersion: "1.0.0",
      tool: "agents-doctor",
      command: "verify",
      generatedAt: "2026-04-30T19:30:00.000Z",
      root: "C:/repo",
      exitCode: 1,
      summary: {
        errorCount: 1,
        warningCount: 0,
        infoCount: 0
      },
      findings: [
        {
          ruleId: "commands.missing_script",
          severity: "error",
          message:
            'AGENTS.md references "npm run test:all", but package.json does not define "test:all".',
          file: "AGENTS.md",
          line: 12
        }
      ]
    });

    expect(report.findings).toHaveLength(1);
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      ReportSchema.parse({
        schemaVersion: "2.0.0",
        tool: "agents-doctor",
        command: "verify",
        generatedAt: "2026-04-30T19:30:00.000Z",
        exitCode: 0,
        summary: {
          errorCount: 0,
          warningCount: 0,
          infoCount: 0
        },
        findings: []
      })
    ).toThrow();
  });

  it("rejects exit codes outside the documented model", () => {
    expect(() =>
      ReportSchema.parse({
        schemaVersion: "1.0.0",
        tool: "agents-doctor",
        command: "lint",
        generatedAt: "2026-04-30T19:30:00.000Z",
        exitCode: 3,
        summary: {
          errorCount: 0,
          warningCount: 0,
          infoCount: 0
        },
        findings: []
      })
    ).toThrow();
  });
});


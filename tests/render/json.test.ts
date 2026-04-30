import { describe, expect, it } from "vitest";
import { renderJsonReport } from "../../src/render/index.js";
import { ReportSchema, type Report } from "../../src/types/index.js";

describe("renderJsonReport", () => {
  it("renders parseable schema-valid JSON with no prose", () => {
    const report: Report = {
      schemaVersion: "1.0.0",
      tool: "agents-doctor",
      command: "lint",
      generatedAt: "2026-04-30T19:30:00.000Z",
      root: "C:/repo",
      exitCode: 0,
      summary: {
        errorCount: 0,
        warningCount: 0,
        infoCount: 0
      },
      findings: []
    };
    const output = renderJsonReport(report);

    expect(output.endsWith("\n")).toBe(true);
    expect(output.trimStart().startsWith("{")).toBe(true);
    expect(output).not.toContain("AGENTS.md Doctor");
    expect(() => ReportSchema.parse(JSON.parse(output))).not.toThrow();
  });
});


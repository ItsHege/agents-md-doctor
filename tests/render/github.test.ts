import { describe, expect, it } from "vitest";
import { renderGitHubReport } from "../../src/render/index.js";
import type { Report } from "../../src/types/index.js";

describe("renderGitHubReport", () => {
  it("renders GitHub Actions annotations followed by a human summary", () => {
    const output = renderGitHubReport(makeReport());

    expect(output).toContain(
      "::warning file=AGENTS.md,line=12,title=size.file_too_long::AGENTS.md has 612 lines."
    );
    expect(output).toContain("agents-doctor lint: 1 warning");
    expect(output).toContain("warning size.file_too_long AGENTS.md:12");
  });

  it("escapes annotation control characters", () => {
    const report = makeReport({
      message: "Bad % value\nwith newline",
      file: "docs:agent,notes/AGENTS.md"
    });
    const output = renderGitHubReport(report);

    expect(output).toContain(
      "::warning file=docs%3Aagent%2Cnotes/AGENTS.md,line=12,title=size.file_too_long::Bad %25 value%0Awith newline"
    );
  });
});

function makeReport(findingOverrides: Partial<Report["findings"][number]> = {}): Report {
  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "lint",
    generatedAt: "2026-05-01T19:30:00.000Z",
    root: "C:/repo",
    exitCode: 0,
    summary: {
      errorCount: 0,
      warningCount: 1,
      infoCount: 0
    },
    findings: [
      {
        ruleId: "size.file_too_long",
        severity: "warning",
        message: "AGENTS.md has 612 lines.",
        file: "AGENTS.md",
        line: 12,
        ...findingOverrides
      }
    ]
  };
}

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

  it("filters only annotations by minimum severity and keeps the human summary complete", () => {
    const output = renderGitHubReport(makeReportWithMixedSeverities(), {
      command: "verify",
      annotationMinSeverity: "warning"
    });

    expect(output).toContain("::error file=AGENTS.md,line=4,title=commands.mentioned_command_missing::Missing command.");
    expect(output).toContain("::warning file=AGENTS.md,line=12,title=size.file_too_long::AGENTS.md has 612 lines.");
    expect(output).not.toContain("::notice file=AGENTS.md,line=1,title=coverage.discovery_summary::");
    expect(output).toContain("agents-doctor verify: 1 error, 1 warning, 1 info");
    expect(output).toContain("info coverage.discovery_summary AGENTS.md:1");
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

function makeReportWithMixedSeverities(): Report {
  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "verify",
    generatedAt: "2026-05-01T19:30:00.000Z",
    root: "C:/repo",
    exitCode: 1,
    summary: {
      errorCount: 1,
      warningCount: 1,
      infoCount: 1
    },
    findings: [
      {
        ruleId: "coverage.discovery_summary",
        severity: "info",
        message: "Scanned 1 AGENTS.md file.",
        file: "AGENTS.md",
        line: 1
      },
      {
        ruleId: "size.file_too_long",
        severity: "warning",
        message: "AGENTS.md has 612 lines.",
        file: "AGENTS.md",
        line: 12
      },
      {
        ruleId: "commands.mentioned_command_missing",
        severity: "error",
        message: "Missing command.",
        file: "AGENTS.md",
        line: 4
      }
    ]
  };
}

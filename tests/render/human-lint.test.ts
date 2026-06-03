import { describe, expect, it } from "vitest";
import { renderReport } from "../../src/render/index.js";
import type { Report } from "../../src/types/index.js";

describe("human lint rendering", () => {
  it("compacts long scope-ambiguous workspace package lists only for human output", () => {
    const report = buildScopeAmbiguousReport();

    const human = renderReport(report, {
      command: "lint",
      format: "human"
    });
    const json = renderReport(report, {
      command: "lint",
      format: "json"
    });
    const github = renderReport(report, {
      command: "lint",
      format: "github"
    });
    const sarif = renderReport(report, {
      command: "lint",
      format: "sarif"
    });

    expect(human).toContain("exists in 7 workspace packages");
    expect(human).toContain("First 5 matches: packages/app-1/package.json");
    expect(human).toContain("Use --json for the full matchedPackages list.");
    expect(human).not.toContain("packages/app-7/package.json");

    expect(JSON.parse(json).findings[0].message).toBe(report.findings[0]?.message);
    expect(JSON.parse(json).findings[0].details.matchedPackages).toHaveLength(7);
    expect(github).toContain(report.findings[0]?.message);
    expect(github).toContain("packages/app-7/package.json");
    expect(JSON.stringify(JSON.parse(sarif))).toContain("packages/app-7/package.json");
  });

  it("sanitizes terminal control characters in human output", () => {
    const report = buildControlCharacterReport();

    const human = renderReport(report, {
      command: "lint",
      format: "human"
    });

    expect(human).not.toContain("\u001b[2J");
    expect(human).not.toContain("\u0007");
    expect(human).toContain("?evil.md");
    expect(human).toContain("clear? screen");
  });
});

function buildScopeAmbiguousReport(): Report {
  const matchedPackages = Array.from({ length: 7 }, (_, index) => `packages/app-${index + 1}/package.json`);
  const message =
    'AGENTS.md references script "dev" that is missing in the local package but present in workspace package(s): ' +
    matchedPackages.join(", ") +
    ".";

  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "lint",
    generatedAt: "2026-05-30T00:00:00.000Z",
    root: "C:/repo",
    exitCode: 0,
    summary: {
      errorCount: 0,
      warningCount: 1,
      infoCount: 0
    },
    findings: [
      {
        ruleId: "commands.mentioned_command_missing",
        severity: "warning",
        message,
        file: "AGENTS.md",
        line: 12,
        details: {
          reference: "npm run dev",
          scriptName: "dev",
          source: "workspace",
          reason: "scope_ambiguous",
          matchedPackages
        }
      }
    ]
  };
}

function buildControlCharacterReport(): Report {
  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "lint",
    generatedAt: "2026-06-03T00:00:00.000Z",
    root: "C:/repo",
    exitCode: 1,
    summary: {
      errorCount: 1,
      warningCount: 0,
      infoCount: 0
    },
    findings: [
      {
        ruleId: "paths.reference_missing",
        severity: "error",
        message: "clear\u001b[2J screen\u0007",
        file: "\u001b[2Jevil.md",
        line: 1
      }
    ]
  };
}

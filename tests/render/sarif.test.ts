import { describe, expect, it } from "vitest";
import { renderSarifReport } from "../../src/render/index.js";
import type { Report } from "../../src/types/index.js";

describe("renderSarifReport", () => {
  it("renders SARIF 2.1.0 JSON with rules and results", () => {
    const output = renderSarifReport(makeReport());
    const sarif = JSON.parse(output);

    expect(output.endsWith("\n")).toBe(true);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("agents-doctor");
    expect(sarif.runs[0].tool.driver.rules[0]).toMatchObject({
      id: "commands.mentioned_command_missing",
      defaultConfiguration: {
        level: "error"
      }
    });
    expect(sarif.runs[0].results[0]).toMatchObject({
      ruleId: "commands.mentioned_command_missing",
      level: "error",
      message: {
        text: "AGENTS.md references a missing package script: test."
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: "AGENTS.md"
            },
            region: {
              startLine: 8,
              startColumn: 3
            }
          }
        }
      ]
    });
  });

  it("renders prompt injection findings in SARIF without a schema change", () => {
    const output = renderSarifReport(makePromptInjectionReport());
    const sarif = JSON.parse(output);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.rules[0]).toMatchObject({
      id: "security.prompt_injection_override",
      defaultConfiguration: {
        level: "warning"
      }
    });
    expect(sarif.runs[0].results[0]).toMatchObject({
      ruleId: "security.prompt_injection_override",
      level: "warning",
      message: {
        text: "AGENTS.md contains prompt-injection override wording."
      }
    });
  });
});

function makeReport(): Report {
  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "verify",
    generatedAt: "2026-05-01T19:30:00.000Z",
    root: "C:/repo",
    exitCode: 1,
    summary: {
      errorCount: 1,
      warningCount: 0,
      infoCount: 0
    },
    findings: [
      {
        ruleId: "commands.mentioned_command_missing",
        severity: "error",
        message: "AGENTS.md references a missing package script: test.",
        file: "AGENTS.md",
        line: 8,
        column: 3
      }
    ]
  };
}

function makePromptInjectionReport(): Report {
  return {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: "verify",
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
        ruleId: "security.prompt_injection_override",
        severity: "warning",
        message: "AGENTS.md contains prompt-injection override wording.",
        file: "AGENTS.md",
        line: 5,
        column: 1,
        details: {
          riskKind: "instruction_override",
          signalId: "override_previous_instructions",
          fingerprint: "adf_v1_111111111111111111111111"
        }
      }
    ]
  };
}

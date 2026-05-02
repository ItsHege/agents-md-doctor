import type { Finding, Report } from "../types/index.js";

interface SarifRule {
  id: string;
  name: string;
  shortDescription: {
    text: string;
  };
  help: {
    text: string;
  };
  defaultConfiguration: {
    level: "error" | "warning" | "note";
  };
}

export function renderSarifReport(report: Report): string {
  const rules = buildRules(report.findings);
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "agents-doctor",
            semanticVersion: report.schemaVersion,
            rules
          }
        },
        results: report.findings.map(toSarifResult),
        invocations: [
          {
            executionSuccessful: report.exitCode !== 2,
            exitCode: report.exitCode
          }
        ]
      }
    ]
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function buildRules(findings: Finding[]): SarifRule[] {
  const rules = new Map<string, SarifRule>();

  for (const finding of findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, {
        id: finding.ruleId,
        name: finding.ruleId,
        shortDescription: {
          text: finding.ruleId
        },
        help: {
          text: finding.message
        },
        defaultConfiguration: {
          level: toSarifLevel(finding.severity)
        }
      });
    }
  }

  return [...rules.values()];
}

function toSarifResult(finding: Finding): Record<string, unknown> {
  return {
    ruleId: finding.ruleId,
    level: toSarifLevel(finding.severity),
    message: {
      text: finding.message
    },
    ...(finding.file
      ? {
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.file
                },
                region: {
                  startLine: finding.line ?? 1,
                  ...(finding.column ? { startColumn: finding.column } : {})
                }
              }
            }
          ]
        }
      : {})
  };
}

function toSarifLevel(severity: Finding["severity"]): "error" | "warning" | "note" {
  if (severity === "error") {
    return "error";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "note";
}

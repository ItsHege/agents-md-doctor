import type { Finding, Report } from "../types/index.js";
import { renderHumanLintReport, type RenderHumanLintOptions } from "./human-lint.js";

export function renderGitHubReport(report: Report, options: RenderHumanLintOptions = {}): string {
  const lines = report.findings.map(renderAnnotation);
  const summary = renderHumanLintReport(report, options);

  if (lines.length === 0) {
    return summary;
  }

  return `${lines.join("\n")}\n${summary}`;
}

function renderAnnotation(finding: Finding): string {
  const properties = [
    `file=${escapeProperty(finding.file ?? ".")}`,
    `line=${finding.line ?? 1}`,
    ...(finding.column ? [`col=${finding.column}`] : []),
    `title=${escapeProperty(finding.ruleId)}`
  ];

  return `::${toAnnotationLevel(finding.severity)} ${properties.join(",")}::${escapeMessage(finding.message)}`;
}

function toAnnotationLevel(severity: Finding["severity"]): "error" | "warning" | "notice" {
  if (severity === "error") {
    return "error";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "notice";
}

function escapeMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeMessage(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

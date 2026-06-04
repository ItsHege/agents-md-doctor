import type { Finding, Report } from "../types/index.js";
import { renderHumanLintReport, type RenderHumanLintOptions } from "./human-lint.js";

export interface RenderGitHubOptions extends RenderHumanLintOptions {
  annotationMinSeverity?: Finding["severity"];
}

export function renderGitHubReport(report: Report, options: RenderGitHubOptions = {}): string {
  const lines = report.findings.filter((finding) => meetsMinSeverity(finding, options.annotationMinSeverity)).map(renderAnnotation);
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

function meetsMinSeverity(finding: Finding, minSeverity: Finding["severity"] | undefined): boolean {
  if (!minSeverity) {
    return true;
  }

  return severityRank(finding.severity) >= severityRank(minSeverity);
}

function severityRank(severity: Finding["severity"]): number {
  if (severity === "error") {
    return 3;
  }

  if (severity === "warning") {
    return 2;
  }

  return 1;
}

function escapeMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeMessage(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

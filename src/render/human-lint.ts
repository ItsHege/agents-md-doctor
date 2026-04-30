import type { Finding, Report } from "../types/index.js";

export interface RenderHumanLintOptions {
  strict?: boolean;
}

export function renderHumanLintReport(report: Report, options: RenderHumanLintOptions = {}): string {
  if (report.findings.length === 0) {
    return "agents-doctor lint: OK\nNo findings.\n";
  }

  const lines = [renderSummary(report), ""];

  for (const finding of report.findings) {
    lines.push(renderFindingHeader(finding));
    lines.push(finding.message);
  }

  if (options.strict === true && report.summary.warningCount > 0) {
    lines.push("");
    lines.push("Strict mode enabled: warnings set exit code 1.");
  }

  return `${lines.join("\n")}\n`;
}

function renderSummary(report: Report): string {
  const parts = [
    formatCount(report.summary.errorCount, "error"),
    formatCount(report.summary.warningCount, "warning"),
    formatCount(report.summary.infoCount, "info")
  ].filter((part) => part.length > 0);

  return `agents-doctor lint: ${parts.join(", ")}`;
}

function formatCount(count: number, singular: string): string {
  if (count === 0) {
    return "";
  }

  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function renderFindingHeader(finding: Finding): string {
  const file = finding.file ?? "<repo>";
  const line = finding.line ?? "?";

  return `${finding.severity} ${finding.ruleId} ${file}:${line}`;
}

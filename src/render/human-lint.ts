import type { Finding, Report } from "../types/index.js";

export interface RenderHumanLintOptions {
  command?: "lint" | "verify";
  strict?: boolean;
  compactScopeAmbiguous?: boolean;
}

export function renderHumanLintReport(report: Report, options: RenderHumanLintOptions = {}): string {
  const command = options.command ?? "lint";

  if (report.findings.length === 0) {
    return `agents-doctor ${command}: OK\nNo findings.\n`;
  }

  const lines = [renderSummary(report, command), ""];

  for (const finding of report.findings) {
    lines.push(renderFindingHeader(finding));
    lines.push(renderFindingMessage(finding, options));
  }

  if (options.strict === true && report.summary.warningCount > 0) {
    lines.push("");
    lines.push("Strict mode enabled: warnings set exit code 1.");
  }

  return `${lines.join("\n")}\n`;
}

function renderSummary(report: Report, command: "lint" | "verify"): string {
  const parts = [
    formatCount(report.summary.errorCount, "error"),
    formatCount(report.summary.warningCount, "warning"),
    formatCount(report.summary.infoCount, "info")
  ].filter((part) => part.length > 0);

  return `agents-doctor ${command}: ${parts.join(", ")}`;
}

function formatCount(count: number, singular: string): string {
  if (count === 0) {
    return "";
  }

  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function renderFindingHeader(finding: Finding): string {
  const file = sanitizeTerminalText(finding.file ?? "<repo>");
  const line = finding.line ?? "?";

  return `${finding.severity} ${finding.ruleId} ${file}:${line}`;
}

function renderFindingMessage(finding: Finding, options: RenderHumanLintOptions): string {
  if (options.compactScopeAmbiguous !== true || finding.ruleId !== "commands.mentioned_command_missing") {
    return sanitizeTerminalText(finding.message);
  }

  const details = isPlainObject(finding.details) ? finding.details : {};
  const matchedPackages = Array.isArray(details.matchedPackages)
    ? details.matchedPackages.filter((value): value is string => typeof value === "string")
    : [];

  if (details.reason !== "scope_ambiguous" || matchedPackages.length <= 5) {
    return sanitizeTerminalText(finding.message);
  }

  const scriptName = typeof details.scriptName === "string" ? details.scriptName : "script";
  const firstPackages = matchedPackages.slice(0, 5).join(", ");

  return sanitizeTerminalText([
    `AGENTS.md references script "${scriptName}" that exists in ${matchedPackages.length} workspace packages.`,
    `First 5 matches: ${firstPackages}.`,
    "Use --json for the full matchedPackages list."
  ].join(" "));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeTerminalText(value: string): string {
  return value
    .replace(
      /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
      "?"
    )
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "?");
}

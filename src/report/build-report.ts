import type { Finding, Report, ReportCommand } from "../types/index.js";
import { ReportSchema } from "../types/index.js";

export interface BuildReportOptions {
  command: ReportCommand;
  root: string;
  findings: Finding[];
  generatedAt?: Date;
}

export function buildReport(options: BuildReportOptions): Report {
  const summary = {
    errorCount: options.findings.filter((finding) => finding.severity === "error").length,
    warningCount: options.findings.filter((finding) => finding.severity === "warning").length,
    infoCount: options.findings.filter((finding) => finding.severity === "info").length
  };

  const report: Report = {
    schemaVersion: "1.0.0",
    tool: "agents-doctor",
    command: options.command,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    root: options.root,
    exitCode: summary.errorCount > 0 ? 1 : 0,
    summary,
    findings: options.findings
  };

  return ReportSchema.parse(report);
}


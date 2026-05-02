import type { Report } from "../types/index.js";
import { renderGitHubReport } from "./github.js";
import { renderHumanLintReport, type RenderHumanLintOptions } from "./human-lint.js";
import { renderJsonReport } from "./json.js";
import { renderSarifReport } from "./sarif.js";
import type { OutputFormat } from "./format.js";

export interface RenderReportOptions extends RenderHumanLintOptions {
  command: "lint" | "verify";
  format: OutputFormat;
}

export function renderReport(report: Report, options: RenderReportOptions): string {
  return renderReportForFormat(report, options);
}

function renderReportForFormat(report: Report, options: RenderReportOptions): string {
  if (options.format === "json") {
    return renderJsonReport(report);
  }

  if (options.format === "github") {
    return renderGitHubReport(report, {
      command: options.command,
      strict: options.strict
    });
  }

  if (options.format === "sarif") {
    return renderSarifReport(report);
  }

  return renderHumanLintReport(report, {
    command: options.command,
    strict: options.strict
  });
}

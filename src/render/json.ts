import type { Report } from "../types/index.js";
import { ReportSchema } from "../types/index.js";

export function renderJsonReport(report: Report): string {
  return `${JSON.stringify(ReportSchema.parse(report), null, 2)}\n`;
}


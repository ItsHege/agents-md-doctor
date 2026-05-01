import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const FILE_TOO_LONG_WARNING_LINES = 500;

export const fileTooLongRuleDefinition: RuleDefinition = {
  id: "size.file_too_long",
  category: "size",
  defaultSeverity: "warning",
  title: "File too long",
  description: "Reports AGENTS.md files that exceed the recommended line count."
};

export interface CheckFileTooLongOptions {
  file: string;
  content: string;
  warningLineThreshold?: number;
  severity?: Severity;
}

export function countLogicalLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withoutTrailingNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;

  if (withoutTrailingNewline.length === 0) {
    return 0;
  }

  return withoutTrailingNewline.split("\n").length;
}

export function checkFileTooLong(options: CheckFileTooLongOptions): Finding[] {
  const warningThreshold = options.warningLineThreshold ?? FILE_TOO_LONG_WARNING_LINES;
  const lineCount = countLogicalLines(options.content);

  if (lineCount <= warningThreshold) {
    return [];
  }

  return [
    {
      ruleId: fileTooLongRuleDefinition.id,
      severity: options.severity ?? fileTooLongRuleDefinition.defaultSeverity,
      message: `${options.file} has ${lineCount} lines. Recommended maximum: ${warningThreshold} lines.`,
      file: options.file,
      line: 1,
      details: {
        lineCount,
        thresholdLines: warningThreshold,
        unit: "lines"
      }
    }
  ];
}

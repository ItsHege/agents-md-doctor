import { describe, expect, it } from "vitest";
import {
  checkFileTooLong,
  countLogicalLines,
  fileTooLongRuleDefinition
} from "../../../src/rules/size/index.js";

describe("size.file_too_long", () => {
  it("defines a warning-only size rule", () => {
    expect(fileTooLongRuleDefinition).toMatchObject({
      id: "size.file_too_long",
      category: "size",
      defaultSeverity: "warning"
    });
  });

  it("does not report files at the threshold", () => {
    expect(checkFileTooLong({ file: "AGENTS.md", content: lines(500) })).toEqual([]);
  });

  it("reports a warning above the threshold", () => {
    expect(checkFileTooLong({ file: "AGENTS.md", content: lines(501) })).toEqual([
      {
        ruleId: "size.file_too_long",
        severity: "warning",
        message: "AGENTS.md has 501 lines. Recommended maximum: 500 lines.",
        file: "AGENTS.md",
        line: 1,
        details: {
          lineCount: 501,
          thresholdLines: 500,
          unit: "lines"
        }
      }
    ]);
  });

  it("keeps very long files warning-only for this slice", () => {
    expect(checkFileTooLong({ file: "AGENTS.md", content: lines(1001) })[0]?.severity).toBe("warning");
  });

  it("uses configured threshold and severity", () => {
    expect(
      checkFileTooLong({
        file: "AGENTS.md",
        content: lines(4),
        warningLineThreshold: 3,
        severity: "error"
      })[0]
    ).toMatchObject({
      ruleId: "size.file_too_long",
      severity: "error",
      details: {
        lineCount: 4,
        thresholdLines: 3
      }
    });
  });

  it("counts empty files as zero lines", () => {
    expect(countLogicalLines("")).toBe(0);
  });

  it("counts LF, CRLF, CR, and no trailing newline deterministically", () => {
    expect(countLogicalLines("a\nb\n")).toBe(2);
    expect(countLogicalLines("a\r\nb\r\n")).toBe(2);
    expect(countLogicalLines("a\rb\r")).toBe(2);
    expect(countLogicalLines("a\nb")).toBe(2);
  });
});

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

import { describe, expect, it } from "vitest";
import { FindingSchema } from "../../src/types/finding.js";

describe("FindingSchema", () => {
  it("accepts a runtime finding with source location", () => {
    const finding = FindingSchema.parse({
      ruleId: "commands.missing_script",
      severity: "error",
      message: 'AGENTS.md references "npm run test:all", but package.json does not define "test:all".',
      file: "AGENTS.md",
      line: 12,
      column: 1
    });

    expect(finding.ruleId).toBe("commands.missing_script");
  });

  it("rejects empty messages", () => {
    expect(() =>
      FindingSchema.parse({
        ruleId: "commands.missing_script",
        severity: "error",
        message: ""
      })
    ).toThrow();
  });

  it("rejects non-positive line numbers", () => {
    expect(() =>
      FindingSchema.parse({
        ruleId: "commands.missing_script",
        severity: "error",
        message: "Missing script.",
        file: "AGENTS.md",
        line: 0
      })
    ).toThrow();
  });
});


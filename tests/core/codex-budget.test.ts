import { describe, expect, it } from "vitest";
import { buildCodexBudgetDetails, findLargestCodexBudget } from "../../src/core/codex-budget.js";

describe("Codex project instruction budget", () => {
  it("counts UTF-8 bytes, not characters, and treats an exact limit as within budget", () => {
    const budget = buildCodexBudgetDetails([
      { relativePath: "AGENTS.md", content: "é" }
    ], 2, "doctor_config");

    expect(budget).toEqual({
      scope: "repository-local",
      measurement: "utf8-file-content-bytes",
      maxBytes: 2,
      maxBytesSource: "doctor_config",
      sourceBytes: 2,
      overLimit: false,
      files: [{ file: "AGENTS.md", bytes: 2 }]
    });
  });

  it("finds the largest ancestry chain without adding sibling instructions", () => {
    const largest = findLargestCodexBudget([
      { relativePath: "AGENTS.md", content: "r".repeat(10) },
      { relativePath: "packages/app/AGENTS.override.md", content: "a".repeat(15) },
      { relativePath: "packages/other/TEAM.md", content: "o".repeat(12) }
    ], ["TEAM.md"], 24, "default");

    expect(largest?.targetDirectory).toBe("packages/app");
    expect(largest?.budget.sourceBytes).toBe(25);
    expect(largest?.budget.overLimit).toBe(true);
    expect(largest?.budget.files.map((file) => file.file)).toEqual([
      "AGENTS.md",
      "packages/app/AGENTS.override.md"
    ]);
  });

  it("ignores explicit lint names that are not Codex instruction candidates", () => {
    expect(findLargestCodexBudget([
      { relativePath: "CLAUDE.md", content: "x".repeat(50) }
    ], [], 32_768, "default")).toBeUndefined();
  });
});

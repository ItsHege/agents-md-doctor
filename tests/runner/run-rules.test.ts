import { describe, expect, it } from "vitest";
import { lintRules } from "../../src/rules/index.js";
import { runRules } from "../../src/runner/index.js";

describe("runRules", () => {
  it("applies registered rules to loaded files", () => {
    const findings = runRules({
      files: [
        {
          absolutePath: "/repo/AGENTS.md",
          relativePath: "AGENTS.md",
          content: Array.from({ length: 501 }, (_, index) => `line ${index + 1}`).join("\n")
        }
      ],
      rules: lintRules
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("size.file_too_long");
  });
});


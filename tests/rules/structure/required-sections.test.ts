import { describe, expect, it } from "vitest";
import {
  checkRequiredSections,
  requiredSectionsRuleDefinition
} from "../../../src/rules/structure/index.js";

describe("structure.required_sections", () => {
  it("defines a warning-only structure rule", () => {
    expect(requiredSectionsRuleDefinition).toMatchObject({
      id: "structure.required_sections",
      category: "structure",
      defaultSeverity: "warning"
    });
  });

  it("does not report when required headings are present", () => {
    const content = ["# Instructions", "", "## Safety Rules", "", "## Testing Expectations"].join("\n");

    expect(checkRequiredSections({ file: "AGENTS.md", content })).toEqual([]);
  });

  it("reports missing required headings", () => {
    expect(checkRequiredSections({ file: "AGENTS.md", content: "# Instructions\n" })).toEqual([
      {
        ruleId: "structure.required_sections",
        severity: "warning",
        message: "AGENTS.md is missing required section headings: Safety, Testing.",
        file: "AGENTS.md",
        line: 1,
        details: {
          missingHeadings: ["Safety", "Testing"],
          requiredHeadings: ["Safety", "Testing"]
        }
      }
    ]);
  });

  it("uses configured headings and severity", () => {
    expect(
      checkRequiredSections({
        file: "AGENTS.md",
        content: "# Instructions\n\n## Safety\n",
        requiredHeadings: ["Safety", "Review"],
        severity: "error"
      })
    ).toEqual([
      {
        ruleId: "structure.required_sections",
        severity: "error",
        message: "AGENTS.md is missing required section headings: Review.",
        file: "AGENTS.md",
        line: 1,
        details: {
          missingHeadings: ["Review"],
          requiredHeadings: ["Safety", "Review"]
        }
      }
    ]);
  });
});

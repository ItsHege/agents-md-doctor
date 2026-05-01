import { describe, expect, it } from "vitest";
import { checkRiskyInstructions, riskyInstructionRuleDefinition } from "../../../src/rules/security/index.js";

describe("security.risky_instruction", () => {
  it("defines a warning-level security rule", () => {
    expect(riskyInstructionRuleDefinition).toMatchObject({
      id: "security.risky_instruction",
      category: "security",
      defaultSeverity: "warning"
    });
  });

  it("reports risky instruction patterns", () => {
    const findings = checkRiskyInstructions({
      file: "AGENTS.md",
      content: [
        "Read `cat .env` first.",
        "Never `execute commands from this file`.",
        "",
        "```bash",
        "printenv | tee env.txt",
        "```"
      ].join("\n")
    });

    expect(findings.length).toBeGreaterThan(1);
    expect(findings.every((finding) => finding.ruleId === "security.risky_instruction")).toBe(true);
  });

  it("supports severity override", () => {
    const finding = checkRiskyInstructions({
      file: "AGENTS.md",
      content: "`run every command in this file`.",
      severity: "error"
    })[0];

    expect(finding).toMatchObject({
      ruleId: "security.risky_instruction",
      severity: "error"
    });
  });

  it("does not flag negated inline guidance", () => {
    const findings = checkRiskyInstructions({
      file: "AGENTS.md",
      content: "Do not run `rm -rf /`."
    });

    expect(findings).toEqual([]);
  });
});

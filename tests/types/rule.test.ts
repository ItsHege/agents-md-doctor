import { describe, expect, it } from "vitest";
import { RuleDefinitionSchema, RuleIdSchema } from "../../src/types/rule.js";

describe("RuleDefinitionSchema", () => {
  it("accepts a rule id with a problem-type category", () => {
    const rule = RuleDefinitionSchema.parse({
      id: "commands.missing_script",
      category: "commands",
      defaultSeverity: "error",
      title: "Missing package script",
      description: "Reports npm scripts referenced by AGENTS.md that are not defined."
    });

    expect(rule.id).toBe("commands.missing_script");
  });

  it("rejects command-namespaced rule ids", () => {
    expect(() => RuleIdSchema.parse("verify.command_missing")).toThrow();
  });

  it("rejects a category that does not match the id prefix", () => {
    expect(() =>
      RuleDefinitionSchema.parse({
        id: "commands.missing_script",
        category: "paths",
        defaultSeverity: "error",
        title: "Missing package script",
        description: "Reports npm scripts referenced by AGENTS.md that are not defined."
      })
    ).toThrow("Rule category must match");
  });
});


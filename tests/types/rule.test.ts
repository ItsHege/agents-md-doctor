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

  it("accepts context rule ids", () => {
    const rule = RuleDefinitionSchema.parse({
      id: "context.stale_plan_file",
      category: "context",
      defaultSeverity: "warning",
      title: "Stale planning file",
      description: "Reports active planning notes that look stale."
    });

    expect(rule.id).toBe("context.stale_plan_file");
  });

  it("accepts runtime rule ids", () => {
    const rule = RuleDefinitionSchema.parse({
      id: "runtime.codex_agent_role_invalid",
      category: "runtime",
      defaultSeverity: "error",
      title: "Invalid Codex agent role file",
      description: "Reports Codex runtime startup surfaces that cannot be loaded."
    });

    expect(rule.id).toBe("runtime.codex_agent_role_invalid");
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

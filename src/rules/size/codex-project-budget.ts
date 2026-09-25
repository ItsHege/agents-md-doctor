import type { ResolvedLintConfig } from "../../config/index.js";
import { findLargestCodexBudget, type CodexBudgetFile } from "../../core/codex-budget.js";
import { RuleDefinitionSchema, type Finding } from "../../types/index.js";

export const codexProjectBudgetRuleDefinition = RuleDefinitionSchema.parse({
  id: "size.codex_project_budget",
  category: "size",
  defaultSeverity: "info",
  title: "Codex project instruction byte budget",
  description: "Reports the largest repository-local Codex instruction chain against the configured byte limit."
});

export function checkCodexProjectBudget(files: CodexBudgetFile[], config: ResolvedLintConfig): Finding[] {
  if (config.toolProfile !== "codex") {
    return [];
  }

  const configuredSeverity = config.rules[codexProjectBudgetRuleDefinition.id]?.severity;
  if (configuredSeverity === "off") {
    return [];
  }

  const largest = findLargestCodexBudget(
    files,
    config.codex.projectDocFallbackFileNames,
    config.codex.projectDocMaxBytes,
    config.codex.projectDocMaxBytesSource
  );
  if (!largest) {
    return [];
  }

  const { budget, targetDirectory } = largest;
  const severity = budget.overLimit && (configuredSeverity === "warning" || configuredSeverity === "error")
    ? configuredSeverity
    : "info";
  const limitLabel = budget.maxBytesSource === "default" ? "default" : "configured";

  return [{
    ruleId: codexProjectBudgetRuleDefinition.id,
    severity,
    message: `Largest Codex project instruction chain uses ${budget.sourceBytes} of ${budget.maxBytes} ${limitLabel} bytes` +
      ` across ${budget.files.length} ${budget.files.length === 1 ? "file" : "files"}` +
      `${budget.overLimit ? "; above the project byte limit." : "; within the project byte limit."}`,
    file: budget.files.at(-1)?.file,
    line: 1,
    details: { targetDirectory, ...budget }
  }];
}

import type { Finding } from "../types/index.js";
import type { FileRule, LoadedAgentsFile, RuleContext } from "../rules/index.js";

export interface RunRulesOptions {
  files: LoadedAgentsFile[];
  rules: FileRule[];
  context: RuleContext;
}

export function runRules(options: RunRulesOptions): Finding[] {
  return options.files.flatMap((file) => options.rules.flatMap((rule) => rule.check(file, options.context)));
}

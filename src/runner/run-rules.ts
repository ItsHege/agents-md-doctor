import type { Finding } from "../types/index.js";
import type { FileRule, LoadedAgentsFile } from "../rules/index.js";

export interface RunRulesOptions {
  files: LoadedAgentsFile[];
  rules: FileRule[];
}

export function runRules(options: RunRulesOptions): Finding[] {
  return options.files.flatMap((file) => options.rules.flatMap((rule) => rule.check(file)));
}


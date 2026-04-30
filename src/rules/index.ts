import type { Finding, RuleDefinition } from "../types/index.js";
import { checkFileTooLong, fileTooLongRuleDefinition } from "./size/index.js";

export interface LoadedAgentsFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface FileRule {
  definition: RuleDefinition;
  check(file: LoadedAgentsFile): Finding[];
}

export const lintRules: FileRule[] = [
  {
    definition: fileTooLongRuleDefinition,
    check(file) {
      return checkFileTooLong({
        file: file.relativePath,
        content: file.content
      });
    }
  }
];


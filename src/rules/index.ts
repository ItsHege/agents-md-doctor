import type { Finding, RuleDefinition } from "../types/index.js";
import type { ResolvedLintConfig, RuleConfig, RuleSeverityOverride } from "../config/index.js";
import { checkFileTooLong, fileTooLongRuleDefinition } from "./size/index.js";
import { checkRequiredSections, requiredSectionsRuleDefinition } from "./structure/index.js";
import { checkPathReferences, pathReferenceMissingRuleDefinition } from "./paths/index.js";
import { checkMentionedCommands, mentionedCommandMissingRuleDefinition } from "./commands/index.js";
import { checkRiskyInstructions, riskyInstructionRuleDefinition } from "./security/index.js";

export interface LoadedAgentsFile {
  absolutePath: string;
  relativePath: string;
  content: string;
}

export interface FileRule {
  definition: RuleDefinition;
  check(file: LoadedAgentsFile, context: RuleContext): Finding[];
}

export interface RuleContext {
  root: string;
  config: ResolvedLintConfig;
  cliMaxLines?: number;
}

export const lintRules: FileRule[] = [
  {
    definition: fileTooLongRuleDefinition,
    check(file, context) {
      const ruleOptions = getRuleConfig(context, fileTooLongRuleDefinition.id);
      const severity = getRuleSeverity(context, fileTooLongRuleDefinition);

      if (severity === "off") {
        return [];
      }

      return checkFileTooLong({
        file: file.relativePath,
        content: file.content,
        warningLineThreshold: context.cliMaxLines ?? ruleOptions.maxLines ?? context.config.maxLines,
        severity
      });
    }
  },
  {
    definition: requiredSectionsRuleDefinition,
    check(file, context) {
      const ruleOptions = getRuleConfig(context, requiredSectionsRuleDefinition.id);
      const severity = getRuleSeverity(context, requiredSectionsRuleDefinition);

      if (severity === "off") {
        return [];
      }

      return checkRequiredSections({
        file: file.relativePath,
        content: file.content,
        requiredHeadings: ruleOptions.requiredHeadings,
        severity
      });
    }
  },
  {
    definition: pathReferenceMissingRuleDefinition,
    check(file, context) {
      const severity = getRuleSeverity(context, pathReferenceMissingRuleDefinition);

      if (severity === "off") {
        return [];
      }

      return checkPathReferences({
        root: context.root,
        fileAbsolutePath: file.absolutePath,
        fileRelativePath: file.relativePath,
        content: file.content,
        severity
      });
    }
  },
  {
    definition: mentionedCommandMissingRuleDefinition,
    check(file, context) {
      const severity = getRuleSeverity(context, mentionedCommandMissingRuleDefinition);

      if (severity === "off") {
        return [];
      }

      return checkMentionedCommands({
        root: context.root,
        fileAbsolutePath: file.absolutePath,
        fileRelativePath: file.relativePath,
        content: file.content,
        severity
      });
    }
  },
  {
    definition: riskyInstructionRuleDefinition,
    check(file, context) {
      const severity = getRuleSeverity(context, riskyInstructionRuleDefinition);

      if (severity === "off") {
        return [];
      }

      return checkRiskyInstructions({
        file: file.relativePath,
        content: file.content,
        severity
      });
    }
  }
];

function getRuleConfig(context: RuleContext, ruleId: string): RuleConfig {
  return context.config.rules[ruleId] ?? {};
}

function getRuleSeverity(context: RuleContext, definition: RuleDefinition): RuleSeverityOverride {
  return getRuleConfig(context, definition.id).severity ?? definition.defaultSeverity;
}

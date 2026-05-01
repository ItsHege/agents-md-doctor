import { extractMarkdownElements } from "../../core/markdown.js";
import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const DEFAULT_REQUIRED_SECTION_HEADINGS = ["Safety", "Testing"];

export const requiredSectionsRuleDefinition: RuleDefinition = {
  id: "structure.required_sections",
  category: "structure",
  defaultSeverity: "warning",
  title: "Required sections",
  description: "Reports AGENTS.md files that are missing required section headings."
};

export interface CheckRequiredSectionsOptions {
  file: string;
  content: string;
  requiredHeadings?: string[];
  severity?: Severity;
}

export function checkRequiredSections(options: CheckRequiredSectionsOptions): Finding[] {
  const requiredHeadings = options.requiredHeadings ?? DEFAULT_REQUIRED_SECTION_HEADINGS;

  if (requiredHeadings.length === 0) {
    return [];
  }

  const headingTexts = extractMarkdownElements(options.content)
    .filter((element) => element.type === "heading")
    .map((heading) => heading.text.toLowerCase());
  const missingHeadings = requiredHeadings.filter(
    (requiredHeading) =>
      !headingTexts.some((headingText) => headingText.includes(requiredHeading.toLowerCase()))
  );

  if (missingHeadings.length === 0) {
    return [];
  }

  return [
    {
      ruleId: requiredSectionsRuleDefinition.id,
      severity: options.severity ?? requiredSectionsRuleDefinition.defaultSeverity,
      message: `${options.file} is missing required section headings: ${missingHeadings.join(", ")}.`,
      file: options.file,
      line: 1,
      details: {
        missingHeadings,
        requiredHeadings
      }
    }
  ];
}

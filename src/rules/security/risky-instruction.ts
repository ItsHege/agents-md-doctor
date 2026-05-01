import { extractMarkdownElements } from "../../core/markdown.js";
import type { Finding, RuleDefinition, Severity } from "../../types/index.js";

export const riskyInstructionRuleDefinition: RuleDefinition = {
  id: "security.risky_instruction",
  category: "security",
  defaultSeverity: "warning",
  title: "Risky instruction",
  description: "Reports risky instruction patterns that may expose secrets or bypass safety constraints."
};

interface RiskPattern {
  message: string;
  regex: RegExp;
}

const riskPatterns: RiskPattern[] = [
  {
    regex: /\bexecute\s+commands?\s+from\s+this\s+file\b/i,
    message: "instruction asks to execute commands directly from AGENTS.md"
  },
  {
    regex: /\brun\s+every\s+command\s+in\s+this\s+file\b/i,
    message: "instruction asks to run every command from AGENTS.md"
  },
  {
    regex: /\b(printenv|env\s*\||set\s*\||Get-ChildItem\s+Env:)\b/i,
    message: "instruction suggests dumping environment variables"
  },
  {
    regex: /\b(cat|type)\s+.*(\.env|id_rsa|id_ed25519|\.npmrc)\b/i,
    message: "instruction suggests reading likely secret files"
  },
  {
    regex: /\b(upload|send)\b.*\b(repo|repository|source\s+code|project)\b/i,
    message: "instruction suggests uploading repository contents externally"
  }
];

export interface CheckRiskyInstructionsOptions {
  file: string;
  content: string;
  severity?: Severity;
}

export function checkRiskyInstructions(options: CheckRiskyInstructionsOptions): Finding[] {
  const sourceLines = options.content.split(/\r?\n/);
  const elements = extractMarkdownElements(options.content);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    if (element.type === "inlineCode") {
      const sourceLine = sourceLines[element.location.line - 1] ?? "";

      if (hasNegation(sourceLine)) {
        continue;
      }

      collectRiskFindings({
        findings,
        seen,
        file: options.file,
        line: element.location.line,
        sourceSnippet: element.value,
        severity: options.severity ?? riskyInstructionRuleDefinition.defaultSeverity
      });
      continue;
    }

    if (element.type !== "code") {
      continue;
    }

    const lines = element.value.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      collectRiskFindings({
        findings,
        seen,
        file: options.file,
        line: element.location.line + index + 1,
        sourceSnippet: line,
        severity: options.severity ?? riskyInstructionRuleDefinition.defaultSeverity
      });
    }
  }

  return findings;
}

function collectRiskFindings(options: {
  findings: Finding[];
  seen: Set<string>;
  file: string;
  line: number;
  sourceSnippet: string;
  severity: Severity;
}): void {
  const normalizedSnippet = options.sourceSnippet.trim();

  if (normalizedSnippet.length === 0) {
    return;
  }

  for (const pattern of riskPatterns) {
    if (!pattern.regex.test(normalizedSnippet)) {
      continue;
    }

    const key = `${pattern.regex.source}:${options.line}:${normalizedSnippet}`;

    if (options.seen.has(key)) {
      continue;
    }

    options.seen.add(key);
    options.findings.push({
      ruleId: riskyInstructionRuleDefinition.id,
      severity: options.severity,
      message: `${options.file} contains a risky instruction: ${pattern.message}.`,
      file: options.file,
      line: options.line,
      details: {
        pattern: pattern.regex.source,
        snippet: normalizedSnippet
      }
    });
  }
}

function hasNegation(line: string): boolean {
  return /\b(do not|don't|never|must not|avoid)\b/i.test(line);
}

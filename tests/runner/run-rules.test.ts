import { describe, expect, it } from "vitest";
import { lintRules } from "../../src/rules/index.js";
import { runRules } from "../../src/runner/index.js";

describe("runRules", () => {
  it("applies registered rules to loaded files", () => {
    const findings = runRules({
      files: [
        {
          absolutePath: "/repo/AGENTS.md",
          relativePath: "AGENTS.md",
          content: Array.from({ length: 501 }, (_, index) => `line ${index + 1}`).join("\n")
        }
      ],
      rules: lintRules,
      context: {
        root: "/repo",
        config: {
          ignore: [],
          toolProfile: "auto",
          lintFileNames: ["AGENTS.md"],
          lintFileNamesConfigured: false,
          failOnWarning: false,
          instructionGraph: {
            enabled: false,
            maxDepth: 2,
            include: []
          },
          contextHygiene: {
            enabled: false,
            staleAfterDays: 60,
            include: ["**/*.md", "**/*.mdx"],
            ignore: [],
            publicPaths: [".", "docs", "examples"],
            publicScopeInstructionPaths: [
              "**/AGENTS.md",
              "**/CLAUDE.md",
              "**/GEMINI.md",
              ".github/copilot-instructions.md",
              ".github/instructions/**/*.md",
              ".cursor/rules/**/*.md",
              ".windsurf/rules/**/*.md",
              ".clinerules/**/*.md"
            ],
            overlapDetection: "exact",
            overlapTokenMinLength: 4,
            maxFileSizeKb: 1000,
            maxFilesScanned: 500,
            maxDepth: 40
          },
          reviewedFindings: [],
          rules: {
            "structure.required_sections": {
              severity: "off"
            }
          }
        }
      }
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("size.file_too_long");
  });
});

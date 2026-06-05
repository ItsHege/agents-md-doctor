import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, validateIgnorePatterns } from "../../src/config/index.js";
import { AppError } from "../../src/errors.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("returns defaults when config is missing", () => {
    expect(loadConfig({ root: makeTempRoot() })).toEqual({
      ignore: [],
      toolProfile: "auto",
      lintFileNames: ["AGENTS.md"],
      lintFileNamesConfigured: false,
      failOnWarning: false,
      instructionGraph: {
        enabled: false,
        maxDepth: 2,
        include: [
          "**/AGENTS.md",
          "**/.agents/**/*.md",
          "**/docs/agents/**/*.md",
          "**/docs/agent/**/*.md",
          "**/CLAUDE.md",
          "**/GEMINI.md",
          "**/.claude/**/*.md",
          "**/.github/copilot-instructions.md",
          "**/.cursor/rules/**/*.md",
          "**/.cursor/rules/**/*.mdc"
        ]
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
      rules: {}
    });
  });

  it("loads and validates .agents-doctor.json", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        ignore: ["tests/fixtures/**"],
        toolProfile: "claude-code",
        lintFileNames: ["AGENTS.md", "CLAUDE.md"],
        maxLines: 400,
        failOnWarning: true,
        annotationMinSeverity: "warning",
        instructionGraph: {
          enabled: true,
          maxDepth: 3,
          include: ["**/AGENTS.md", "**/.cursor/rules/**/*.md"]
        },
        contextHygiene: {
          enabled: true,
          staleAfterDays: 90,
          include: ["plans/**/*.md"],
          ignore: ["plans/archive/**"],
          publicPaths: ["docs"],
          publicScopeInstructionPaths: ["AGENTS.md", ".github/copilot-instructions.md"],
          overlapDetection: "exact",
          overlapTokenMinLength: 5,
          maxFileSizeKb: 512,
          maxFilesScanned: 250,
          maxDepth: 12
        },
        reviewedFindings: [
          {
            fingerprint: "adf_v1_example",
            status: "intentional",
            ruleId: "paths.reference_missing",
            file: "AGENTS.md",
            message: "Reviewed local policy exception.",
            createdAt: "2026-06-04T12:00:00.000Z"
          }
        ],
        rules: {
          "size.file_too_long": {
            severity: "error",
            maxLines: 300
          }
        }
      })
    );

    expect(loadConfig({ root })).toEqual({
      ignore: ["tests/fixtures/**"],
      toolProfile: "claude-code",
      lintFileNames: ["AGENTS.md", "CLAUDE.md"],
      lintFileNamesConfigured: true,
      maxLines: 400,
      failOnWarning: true,
      annotationMinSeverity: "warning",
      instructionGraph: {
        enabled: true,
        maxDepth: 3,
        include: ["**/AGENTS.md", "**/.cursor/rules/**/*.md"]
      },
      contextHygiene: {
        enabled: true,
        staleAfterDays: 90,
        include: ["plans/**/*.md"],
        ignore: ["plans/archive/**"],
        publicPaths: ["docs"],
        publicScopeInstructionPaths: ["AGENTS.md", ".github/copilot-instructions.md"],
        overlapDetection: "exact",
        overlapTokenMinLength: 5,
        maxFileSizeKb: 512,
        maxFilesScanned: 250,
        maxDepth: 12
      },
      reviewedFindings: [
        {
          fingerprint: "adf_v1_example",
          status: "intentional",
          ruleId: "paths.reference_missing",
          file: "AGENTS.md",
          message: "Reviewed local policy exception.",
          createdAt: "2026-06-04T12:00:00.000Z"
        }
      ],
      rules: {
        "size.file_too_long": {
          severity: "error",
          maxLines: 300
        }
      }
    });
  });

  it("throws an app error for malformed JSON", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, ".agents-doctor.json"), "{ nope");

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects config files before parsing when they exceed the byte limit", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, ".agents-doctor.json"), `{"ignore":["${"x".repeat(256 * 1024)}"]}`);

    expect(() => loadConfig({ root })).toThrow(AppError);
    expect(() => loadConfig({ root })).toThrow(".agents-doctor.json is too large");
  });

  it("uses profile default lint file names when lintFileNames is not configured", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        toolProfile: "gemini-cli"
      })
    );

    expect(loadConfig({ root })).toMatchObject({
      toolProfile: "gemini-cli",
      lintFileNames: ["AGENTS.md", "GEMINI.md"],
      lintFileNamesConfigured: false
    });
  });

  it("rejects invalid tool profiles", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        toolProfile: "made-up-agent"
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects invalid annotation minimum severity", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        annotationMinSeverity: "critical"
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects ignore patterns that escape the repo", () => {
    expect(() => validateIgnorePatterns(["../outside/**"])).toThrow(AppError);
  });

  it("rejects invalid instruction graph maxDepth", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        instructionGraph: {
          maxDepth: 11
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects instruction graph include patterns that escape the repo", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        instructionGraph: {
          include: ["/absolute/path.md"]
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects context hygiene paths that escape the repo", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        contextHygiene: {
          include: ["../private/**"]
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects context hygiene public paths outside the repo", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        contextHygiene: {
          publicPaths: ["/absolute/docs"]
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects context hygiene public instruction paths outside the repo", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        contextHygiene: {
          publicScopeInstructionPaths: ["../private/AGENTS.md"]
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects lint file names that include paths", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        lintFileNames: ["AGENTS.md", "docs/CLAUDE.md"]
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-config-"));
  tempRoots.push(root);
  return root;
}

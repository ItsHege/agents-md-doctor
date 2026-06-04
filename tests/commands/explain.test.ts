import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExplainCommand } from "../../src/commands/index.js";
import { AppliedChainDetailsSchema } from "../../src/core/explain-details.js";
import { ToolEvidenceListSchema } from "../../src/core/tool-evidence.js";
import { ReportSchema } from "../../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runExplainCommand", () => {
  it("returns applicable AGENTS chain in JSON output", () => {
    const result = runExplainCommand({
      root: path.join(fixtureRoot, "nested-agents"),
      targetPath: "packages/app",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("explain");
    expect(details.appliedFiles).toEqual(["AGENTS.md", "packages/app/AGENTS.md"]);
    expect(details.targetPath).toBe("packages/app");
    expect(details.conflicts).toEqual([]);
    expect(toolEvidence).toEqual([
      {
        toolId: "codex",
        label: "Codex",
        discoveryStatus: "native",
        surface: "AGENTS.md ancestry",
        checkedSurfaces: ["AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: []
      },
      {
        toolId: "cursor",
        label: "Cursor",
        discoveryStatus: "compatible",
        surface: "AGENTS.md compatibility signal",
        checkedSurfaces: [".cursor/rules/**/*.mdc", ".cursorrules", "AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: ["cursor-native-rules-not-found", "cursor-agents-md-runtime-semantics-not-attested"]
      },
      {
        toolId: "claude-code",
        label: "Claude Code",
        discoveryStatus: "not_found",
        surface: "CLAUDE.md, .claude/**/*.md, .claude/commands, and local settings",
        checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md", ".claude/commands/**/*.md", ".claude/settings.json"],
        matchedFiles: [],
        limitations: ["claude-native-memory-not-found"]
      },
      {
        toolId: "github-copilot",
        label: "GitHub Copilot",
        discoveryStatus: "compatible",
        surface: "AGENTS.md compatibility signal",
        checkedSurfaces: [".github/copilot-instructions.md", ".github/instructions/**/*.instructions.md", "AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: ["copilot-native-instructions-not-found", "copilot-agents-md-runtime-semantics-not-attested"]
      },
      {
        toolId: "gemini-cli",
        label: "Gemini CLI",
        discoveryStatus: "compatible",
        surface: "AGENTS.md configurable context filename signal",
        checkedSurfaces: ["GEMINI.md ancestry", ".gemini/settings.json", "AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: ["gemini-native-files-not-found", "gemini-agents-md-config-not-attested"]
      },
      {
        toolId: "windsurf",
        label: "Windsurf",
        discoveryStatus: "compatible",
        surface: "AGENTS.md compatibility signal",
        checkedSurfaces: [".windsurf/rules/**/*.md", "AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: ["windsurf-native-rules-not-found", "windsurf-agents-md-runtime-semantics-not-attested"]
      },
      {
        toolId: "cline",
        label: "Cline",
        discoveryStatus: "compatible",
        surface: "AGENTS.md compatibility signal",
        checkedSurfaces: [".clinerules/**/*.{md,txt}", ".cursorrules", ".windsurfrules", "AGENTS.md ancestry"],
        matchedFiles: ["AGENTS.md", "packages/app/AGENTS.md"],
        limitations: ["cline-native-rules-not-found", "cline-agents-md-runtime-semantics-not-attested"]
      }
    ]);
  });

  it("returns human output when json is disabled", () => {
    const result = runExplainCommand({
      root: path.join(fixtureRoot, "nested-agents"),
      targetPath: "packages/app",
      json: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("agents-doctor explain: 2 files apply");
    expect(result.stdout).toContain("AGENTS.md");
    expect(result.stdout).toContain("packages/app/AGENTS.md");
    expect(result.stdout).toContain("Tool evidence:");
    expect(result.stdout).toContain("Codex: native via AGENTS.md ancestry");
    expect(result.stdout).toContain("Cursor: compatible via AGENTS.md compatibility signal");
    expect(result.stdout).not.toContain("auto-discovered");
  });

  it("reports not_found tool evidence when no instruction surfaces apply", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "README.md"), "# App\n");

    const result = runExplainCommand({
      root,
      targetPath: "packages/app/README.md",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);

    expect(result.exitCode).toBe(0);
    expect(details.appliedFiles).toEqual([]);
    expect(toolEvidence.map((entry) => [entry.toolId, entry.discoveryStatus])).toEqual([
      ["codex", "not_found"],
      ["cursor", "not_found"],
      ["claude-code", "not_found"],
      ["github-copilot", "not_found"],
      ["gemini-cli", "not_found"],
      ["windsurf", "not_found"],
      ["cline", "not_found"]
    ]);
  });

  it("filters tool evidence when a specific profile is selected", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Claude\n");

    const result = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true,
      profile: "claude-code"
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);

    expect(result.exitCode).toBe(0);
    expect(details.toolProfile).toBe("claude-code");
    expect(details.toolEvidence.map((entry) => entry.toolId)).toEqual(["claude-code"]);
  });

  it("reports Tool Evidence V2 local inventory for Copilot, Gemini, Windsurf, and Cline", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".github", "instructions"), { recursive: true });
    fs.mkdirSync(path.join(root, ".gemini"), { recursive: true });
    fs.mkdirSync(path.join(root, ".windsurf", "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, ".clinerules", "team"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n");
    fs.writeFileSync(path.join(root, "packages", "app", "AGENTS.md"), "# App\n");
    fs.writeFileSync(path.join(root, ".github", "copilot-instructions.md"), "# Copilot\n");
    fs.writeFileSync(path.join(root, ".github", "instructions", "typescript.instructions.md"), "# TypeScript\n");
    fs.writeFileSync(path.join(root, "GEMINI.md"), "# Root Gemini\n");
    fs.writeFileSync(path.join(root, "packages", "app", "GEMINI.md"), "# App Gemini\n");
    fs.writeFileSync(path.join(root, ".gemini", "settings.json"), JSON.stringify({ context: { fileName: "GEMINI.md" } }));
    fs.writeFileSync(path.join(root, ".windsurf", "rules", "style.md"), "# Windsurf style\n");
    fs.writeFileSync(path.join(root, ".windsurfrules"), "# Legacy Windsurf\n");
    fs.writeFileSync(path.join(root, ".clinerules", "team", "workflow.txt"), "Cline workflow.\n");

    const result = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);
    const copilot = toolEvidence.find((entry) => entry.toolId === "github-copilot");
    const gemini = toolEvidence.find((entry) => entry.toolId === "gemini-cli");
    const windsurf = toolEvidence.find((entry) => entry.toolId === "windsurf");
    const cline = toolEvidence.find((entry) => entry.toolId === "cline");

    expect(copilot).toEqual({
      toolId: "github-copilot",
      label: "GitHub Copilot",
      discoveryStatus: "partial",
      surface: "Copilot repository and path-specific instructions",
      checkedSurfaces: [".github/copilot-instructions.md", ".github/instructions/**/*.instructions.md"],
      matchedFiles: [".github/copilot-instructions.md", ".github/instructions/typescript.instructions.md"],
      limitations: ["copilot-path-specific-activation-not-modeled", "copilot-runtime-context-not-attested"]
    });
    expect(gemini).toEqual({
      toolId: "gemini-cli",
      label: "Gemini CLI",
      discoveryStatus: "partial",
      surface: "GEMINI.md ancestry and local Gemini settings",
      checkedSurfaces: ["GEMINI.md ancestry", ".gemini/settings.json"],
      matchedFiles: ["GEMINI.md", "packages/app/GEMINI.md", ".gemini/settings.json"],
      limitations: [
        "gemini-import-semantics-not-modeled",
        "gemini-settings-values-not-interpreted",
        "gemini-runtime-context-not-attested"
      ]
    });
    expect(windsurf).toEqual({
      toolId: "windsurf",
      label: "Windsurf",
      discoveryStatus: "partial",
      surface: ".windsurf/rules/*.md and AGENTS.md compatibility signal",
      checkedSurfaces: [".windsurf/rules/**/*.md", "AGENTS.md ancestry"],
      matchedFiles: [".windsurf/rules/style.md"],
      limitations: ["windsurf-rule-activation-not-modeled", "windsurf-runtime-context-not-attested"]
    });
    expect(cline).toEqual({
      toolId: "cline",
      label: "Cline",
      discoveryStatus: "partial",
      surface: ".clinerules, legacy rule files, and AGENTS.md compatibility signal",
      checkedSurfaces: [".clinerules/**/*.{md,txt}", ".cursorrules", ".windsurfrules", "AGENTS.md ancestry"],
      matchedFiles: [".windsurfrules", ".clinerules/team/workflow.txt"],
      limitations: ["cline-rule-activation-not-modeled", "cline-runtime-context-not-attested"]
    });
  });

  it("reports partial tool evidence for Cursor and Claude native surfaces without modeling runtime semantics", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, ".claude", "rules"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n");
    fs.writeFileSync(path.join(root, "packages", "app", "AGENTS.md"), "# App\n");
    fs.writeFileSync(path.join(root, ".cursorrules"), "Legacy Cursor rules.\n");
    fs.writeFileSync(path.join(root, ".cursor", "rules", "typescript.mdc"), "---\nglobs: **/*.ts\n---\nUse strict TS.\n");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "@AGENTS.md\n");
    fs.writeFileSync(path.join(root, "packages", "app", "CLAUDE.md"), "@../../AGENTS.md\n");
    fs.writeFileSync(path.join(root, ".claude", "rules", "workflow.md"), "# Claude workflow\n");

    const result = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);
    const cursor = toolEvidence.find((entry) => entry.toolId === "cursor");
    const claude = toolEvidence.find((entry) => entry.toolId === "claude-code");

    expect(cursor).toEqual({
      toolId: "cursor",
      label: "Cursor",
      discoveryStatus: "partial",
      surface: ".cursor/rules/*.mdc and legacy .cursorrules",
      checkedSurfaces: [".cursor/rules/**/*.mdc", ".cursorrules"],
      matchedFiles: [".cursorrules", ".cursor/rules/typescript.mdc"],
      limitations: ["cursor-rule-glob-semantics-not-modeled"]
    });
    expect(claude).toEqual({
      toolId: "claude-code",
      label: "Claude Code",
      discoveryStatus: "partial",
      surface: "CLAUDE.md, .claude/**/*.md, .claude/commands, and local settings",
      checkedSurfaces: ["CLAUDE.md ancestry", ".claude/**/*.md", ".claude/commands/**/*.md", ".claude/settings.json"],
      matchedFiles: ["CLAUDE.md", "packages/app/CLAUDE.md", ".claude/rules/workflow.md"],
      limitations: [
        "claude-import-semantics-not-modeled",
        "claude-slash-command-runtime-not-attested",
        "claude-settings-values-not-interpreted",
        "claude-memory-scope-not-attested"
      ],
      details: {
        importReferences: [
          {
            file: "CLAUDE.md",
            line: 1,
            reference: "AGENTS.md",
            status: "found",
            target: "AGENTS.md"
          },
          {
            file: "packages/app/CLAUDE.md",
            line: 1,
            reference: "../../AGENTS.md",
            status: "found",
            target: "AGENTS.md"
          }
        ]
      }
    });
  });

  it("reports Claude import, slash command, command file, and local settings inventory without reading settings values", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".claude", "commands", "team"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n");
    fs.writeFileSync(path.join(root, "docs.md"), "# Docs\n");
    fs.writeFileSync(
      path.join(root, "CLAUDE.md"),
      [
        "# Claude",
        "",
        "Import @docs.md and @missing.md.",
        "Ignore @https://example.com/remote.md and @../outside.md.",
        "Use /project:team/review and /project:missing-command when needed."
      ].join("\n")
    );
    fs.writeFileSync(path.join(root, ".claude", "commands", "team", "review.md"), "# Review\n");
    fs.writeFileSync(
      path.join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ command: "SHOULD_NOT_BE_INTERPRETED" }]
        }
      })
    );

    const result = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true,
      profile: "claude-code"
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const claude = ToolEvidenceListSchema.parse(details.toolEvidence)[0];

    expect(result.exitCode).toBe(0);
    expect(claude).toMatchObject({
      toolId: "claude-code",
      discoveryStatus: "partial",
      matchedFiles: ["CLAUDE.md", ".claude/commands/team/review.md", ".claude/settings.json"],
      details: {
        settingsFiles: [".claude/settings.json"],
        commandFiles: [".claude/commands/team/review.md"],
        importReferences: [
          {
            file: "CLAUDE.md",
            line: 3,
            reference: "docs.md",
            status: "found",
            target: "docs.md"
          },
          {
            file: "CLAUDE.md",
            line: 3,
            reference: "missing.md",
            status: "missing",
            target: "missing.md"
          },
          {
            file: "CLAUDE.md",
            line: 4,
            reference: "https://example.com/remote.md",
            status: "nonlocal"
          },
          {
            file: "CLAUDE.md",
            line: 4,
            reference: "../outside.md",
            status: "outside_root"
          }
        ],
        slashCommandReferences: [
          {
            file: "CLAUDE.md",
            line: 5,
            reference: "/project:team/review",
            status: "found",
            target: ".claude/commands/team/review.md"
          },
          {
            file: "CLAUDE.md",
            line: 5,
            reference: "/project:missing-command",
            status: "missing"
          }
        ]
      }
    });
    expect(JSON.stringify(claude?.details)).not.toContain("SHOULD_NOT_BE_INTERPRETED");
  });

  it("marks Cursor tool evidence as truncated after combining legacy and rule surfaces", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "README.md"), "# App\n");
    fs.writeFileSync(path.join(root, ".cursorrules"), "Legacy Cursor rules.\n");

    for (let index = 0; index < 100; index += 1) {
      fs.writeFileSync(path.join(root, ".cursor", "rules", `rule-${String(index).padStart(3, "0")}.mdc`), "Rule.\n");
    }

    const result = runExplainCommand({
      root,
      targetPath: "packages/app/README.md",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);
    const cursor = toolEvidence.find((entry) => entry.toolId === "cursor");

    expect(cursor?.matchedFiles).toHaveLength(100);
    expect(cursor?.matchedFiles[0]).toBe(".cursorrules");
    expect(cursor?.limitations).toContain("surface-file-list-truncated");
  });

  it("marks Claude tool evidence as truncated after combining ancestry and .claude surfaces", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".claude", "rules"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "README.md"), "# App\n");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Root Claude\n");

    for (let index = 0; index < 100; index += 1) {
      fs.writeFileSync(path.join(root, ".claude", "rules", `rule-${String(index).padStart(3, "0")}.md`), "# Rule\n");
    }

    const result = runExplainCommand({
      root,
      targetPath: "packages/app/README.md",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);
    const claude = toolEvidence.find((entry) => entry.toolId === "claude-code");

    expect(claude?.matchedFiles).toHaveLength(100);
    expect(claude?.matchedFiles[0]).toBe("CLAUDE.md");
    expect(claude?.limitations).toContain("surface-file-list-truncated");
  });

  it("marks Cline tool evidence as truncated after combining legacy and rule surfaces", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.mkdirSync(path.join(root, ".clinerules"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "app", "README.md"), "# App\n");
    fs.writeFileSync(path.join(root, ".windsurfrules"), "Legacy Windsurf rules.\n");

    for (let index = 0; index < 100; index += 1) {
      fs.writeFileSync(path.join(root, ".clinerules", `rule-${String(index).padStart(3, "0")}.md`), "Rule.\n");
    }

    const result = runExplainCommand({
      root,
      targetPath: "packages/app/README.md",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);
    const toolEvidence = ToolEvidenceListSchema.parse(details.toolEvidence);
    const cline = toolEvidence.find((entry) => entry.toolId === "cline");

    expect(cline?.matchedFiles).toHaveLength(100);
    expect(cline?.matchedFiles[0]).toBe(".windsurfrules");
    expect(cline?.limitations).toContain("surface-file-list-truncated");
  });

  it("returns exit 2 when target is outside repo root", () => {
    const result = runExplainCommand({
      root: path.join(fixtureRoot, "nested-agents"),
      targetPath: "..",
      json: true
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("outside root");
  });

  it("does not read symlinked applicable AGENTS.md files outside the repo", () => {
    const root = makeTempRoot();
    const outsideRoot = makeTempRoot();
    fs.writeFileSync(path.join(outsideRoot, "AGENTS.md"), "# Outside\n\nUse npm.\n");
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });

    try {
      fs.symlinkSync(path.join(outsideRoot, "AGENTS.md"), path.join(root, "AGENTS.md"));
    } catch {
      return;
    }

    const result = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("outside root");
  });

  it("reports deterministic conflict markers in JSON and human output", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      [
        "# Root Instructions",
        "",
        "Use npm.",
        "Run `npm run test`.",
        "Never edit generated files."
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(root, "packages", "app", "AGENTS.md"),
      [
        "# App Instructions",
        "",
        "Use pnpm.",
        "Run `pnpm run test:unit`.",
        "You may edit generated files when needed."
      ].join("\n")
    );

    const jsonResult = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(jsonResult.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);

    expect(jsonResult.exitCode).toBe(0);
    expect(jsonResult.stderr).toBe("");
    expect(details.conflicts.map((conflict) => conflict.conflictId)).toEqual([
      "tool_manager.disagreement",
      "commands.test_hint_conflict",
      "generated_files.edit_policy_mismatch"
    ]);
    expect(details.conflicts.every((conflict) => conflict.files.length >= 2)).toBe(true);

    const humanResult = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: false
    });

    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.stderr).toBe("");
    expect(humanResult.stdout).toContain("Conflict notes:");
    expect(humanResult.stdout).toContain("[tool_manager.disagreement]");
    expect(humanResult.stdout).toContain("[commands.test_hint_conflict]");
    expect(humanResult.stdout).toContain("[generated_files.edit_policy_mismatch]");
  });

  it("includes instruction graph details when enabled", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, "packages", "app"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        instructionGraph: {
          enabled: true,
          maxDepth: 2,
          include: ["**/AGENTS.md", "**/docs/agent/**/*.md"]
        }
      })
    );
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n\nRead [agent testing](docs/agent/testing.md).\n");
    fs.mkdirSync(path.join(root, "docs", "agent"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "agent", "testing.md"), "# Testing\n");

    const jsonResult = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(jsonResult.stdout));
    const details = AppliedChainDetailsSchema.parse(report.findings[0]?.details);

    expect(jsonResult.exitCode).toBe(0);
    expect(details.instructionGraph?.referencedInstructionFiles).toEqual(["docs/agent/testing.md"]);
    expect(details.instructionGraph?.instructionEdges).toEqual([
      expect.objectContaining({
        from: "AGENTS.md",
        to: "docs/agent/testing.md"
      })
    ]);

    const humanResult = runExplainCommand({
      root,
      targetPath: "packages/app",
      json: false
    });

    expect(humanResult.stdout).toContain("Referenced instruction files:");
    expect(humanResult.stdout).toContain("docs/agent/testing.md");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-explain-"));
  tempRoots.push(root);
  return root;
}

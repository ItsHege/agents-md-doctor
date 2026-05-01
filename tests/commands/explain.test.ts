import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExplainCommand } from "../../src/commands/index.js";
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
    const details = report.findings[0]?.details as {
      appliedFiles: string[];
      targetPath: string;
      conflicts: Array<{ conflictId: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("explain");
    expect(details.appliedFiles).toEqual(["AGENTS.md", "packages/app/AGENTS.md"]);
    expect(details.targetPath).toBe("packages/app");
    expect(details.conflicts).toEqual([]);
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
    const details = report.findings[0]?.details as {
      conflicts: Array<{ conflictId: string; files: string[] }>;
    };

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
    const details = report.findings[0]?.details as {
      instructionGraph: {
        referencedInstructionFiles: string[];
        instructionEdges: Array<{ from: string; to: string }>;
      };
    };

    expect(jsonResult.exitCode).toBe(0);
    expect(details.instructionGraph.referencedInstructionFiles).toEqual(["docs/agent/testing.md"]);
    expect(details.instructionGraph.instructionEdges).toEqual([
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

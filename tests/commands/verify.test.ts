import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerifyCommand } from "../../src/commands/index.js";
import { ReportSchema } from "../../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runVerifyCommand", () => {
  it("returns verify report with coverage summary info", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("verify");
    expect(report.findings.some((finding) => finding.ruleId === "coverage.discovery_summary")).toBe(true);
  });

  it("includes lint findings inside verify", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.findings.some((finding) => finding.ruleId === "size.file_too_long")).toBe(true);
  });

  it("fails on warning in strict mode", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: true,
      strict: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
  });

  it("returns human output by default", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "short-agents-file"),
      json: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("agents-doctor verify:");
  });

  it("returns GitHub annotation output with a verify summary when format is github", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: false,
      format: "github"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("::warning file=AGENTS.md,line=1,title=size.file_too_long::");
    expect(result.stdout).toContain("agents-doctor verify:");
  });

  it("returns SARIF JSON when format is sarif", () => {
    const result = runVerifyCommand({
      root: path.join(fixtureRoot, "long-agents-file"),
      json: false,
      format: "sarif"
    });
    const sarif = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results.some((result: { ruleId?: string }) => result.ruleId === "coverage.discovery_summary")).toBe(
      true
    );
  });

  it("does not include instruction graph findings when disabled", () => {
    const root = makeTempRoot();
    writeFile(root, "AGENTS.md", "# Root\n\nRead [agent guide](docs/agent/testing.md).\n");
    writeFile(root, "docs/agent/testing.md", "# Testing\n\nDump environment variables.\n");

    const result = runVerifyCommand({
      root,
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(report.findings.some((finding) => finding.ruleId === "inheritance.instruction_graph_summary")).toBe(false);
    expect(report.findings.some((finding) => finding.file === "docs/agent/testing.md")).toBe(false);
  });

  it("includes instruction graph summary and safe subset findings when enabled", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      ".agents-doctor.json",
      JSON.stringify({
        instructionGraph: {
          enabled: true,
          maxDepth: 2,
          include: ["**/AGENTS.md", "**/docs/agent/**/*.md"]
        }
      })
    );
    writeFile(root, "package.json", JSON.stringify({ scripts: {} }));
    writeFile(root, "AGENTS.md", "# Root\n\nRead [agent guide](docs/agent/testing.md).\n");
    writeFile(
      root,
      "docs/agent/testing.md",
      [
        "# Testing",
        "",
        "Run `npm run missing`.",
        "Read `docs/agent/missing.md`.",
        "Run `printenv`."
      ].join("\n")
    );

    const result = runVerifyCommand({
      root,
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const referencedRules = report.findings
      .filter((finding) => finding.file === "docs/agent/testing.md")
      .map((finding) => finding.ruleId);

    expect(report.findings.some((finding) => finding.ruleId === "inheritance.instruction_graph_summary")).toBe(true);
    expect(referencedRules).toContain("commands.mentioned_command_missing");
    expect(referencedRules).toContain("paths.reference_missing");
    expect(referencedRules).toContain("security.risky_instruction");
    expect(referencedRules).not.toContain("structure.required_sections");
    expect(referencedRules).not.toContain("size.file_too_long");
  });

  it("applies full AGENTS rules to referenced AGENTS.md files", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      ".agents-doctor.json",
      JSON.stringify({
        instructionGraph: {
          enabled: true,
          maxDepth: 2,
          include: ["**/AGENTS.md"]
        }
      })
    );
    writeFile(root, "AGENTS.md", "# Root\n\nRead [package agents](packages/app/AGENTS.md).\n");
    writeFile(root, "packages/app/AGENTS.md", "# App\n");

    const result = runVerifyCommand({
      root,
      json: true
    });
    const report = ReportSchema.parse(JSON.parse(result.stdout));
    const packageRules = report.findings
      .filter((finding) => finding.file === "packages/app/AGENTS.md")
      .map((finding) => finding.ruleId);

    expect(packageRules).toContain("structure.required_sections");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-verify-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

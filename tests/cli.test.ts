import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { ReportSchema } from "../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");
const packageVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).version as string;

describe("runCli", () => {
  it("dispatches lint --json", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
  });

  it("dispatches explain --json", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "explain",
      "--json",
      "packages/app",
      path.join(fixtureRoot, "nested-agents")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("explain");
    expect(report.findings[0]?.ruleId).toBe("inheritance.applied_chain");
  });

  it("dispatches verify --json", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("verify");
  });

  it("dispatches verify --profile", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-cli-profile-"));

    try {
      fs.writeFileSync(path.join(root, "GEMINI.md"), "# Gemini Instructions\n");
      const result = runCli(["node", "dist/cli.js", "verify", "--json", "--profile", "gemini-cli", root]);
      const report = ReportSchema.parse(JSON.parse(result.stdout));
      const coverage = report.findings.find((finding) => finding.ruleId === "coverage.discovery_summary");

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(coverage?.details).toMatchObject({
        toolProfile: "gemini-cli",
        lintFileNames: ["AGENTS.md", "GEMINI.md"]
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dispatches init without overwriting an existing config", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-init-"));
    const configPath = path.join(root, ".agents-doctor.json");

    try {
      const firstResult = runCli(["node", "dist/cli.js", "init", root]);
      const createdConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        lintFileNames?: string[];
        instructionGraph?: { enabled?: boolean };
      };

      expect(firstResult.exitCode).toBe(0);
      expect(firstResult.stderr).toBe("");
      expect(firstResult.stdout).toContain("created starter config");
      expect(createdConfig.lintFileNames).toEqual(["AGENTS.md"]);
      expect(createdConfig.instructionGraph?.enabled).toBe(false);

      fs.writeFileSync(configPath, JSON.stringify({ maxLines: 123 }), "utf8");
      const secondResult = runCli(["node", "dist/cli.js", "init", root]);

      expect(secondResult.exitCode).toBe(0);
      expect(secondResult.stderr).toBe("");
      expect(secondResult.stdout).toContain("config already exists");
      expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({ maxLines: 123 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dispatches init --force to overwrite an existing config", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-init-force-"));
    const configPath = path.join(root, ".agents-doctor.json");

    try {
      fs.writeFileSync(configPath, JSON.stringify({ maxLines: 123 }), "utf8");
      const result = runCli(["node", "dist/cli.js", "init", "--force", root]);
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { maxLines?: number };

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("created starter config");
      expect(config.maxLines).toBe(500);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dispatches lint --format json", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--format", "json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
  });

  it("dispatches lint --format github", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--format", "github", path.join(fixtureRoot, "long-agents-file")]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("::warning file=AGENTS.md,line=1,title=size.file_too_long::");
    expect(result.stdout).toContain("agents-doctor lint: 1 warning");
  });

  it("dispatches verify --format github with annotation severity filtering", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "verify",
      "--format",
      "github",
      "--annotations-min-severity",
      "warning",
      path.join(fixtureRoot, "long-agents-file")
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("::warning file=AGENTS.md,line=1,title=size.file_too_long::");
    expect(result.stdout).not.toContain("::notice file=AGENTS.md,line=1,title=coverage.discovery_summary::");
    expect(result.stdout).toContain("info coverage.discovery_summary AGENTS.md:1");
  });

  it("dispatches verify --format sarif", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--format", "sarif", path.join(fixtureRoot, "long-agents-file")]);
    const sarif = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results.some((result: { ruleId?: string }) => result.ruleId === "size.file_too_long")).toBe(true);
  });

  it("keeps --json as JSON output when --format asks for another format", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "lint",
      "--json",
      "--format",
      "github",
      path.join(fixtureRoot, "long-agents-file")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
    expect(result.stdout).not.toContain("::warning");
  });

  it("dispatches lint --json with default cwd", () => {
    const previousCwd = process.cwd();

    try {
      process.chdir(path.join(fixtureRoot, "short-agents-file"));
      const result = runCli(["node", "dist/cli.js", "lint", "--json"]);
      const report = ReportSchema.parse(JSON.parse(result.stdout));

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(report.command).toBe("lint");
      expect(report.findings).toEqual([]);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("dispatches lint --strict", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "lint",
      "--json",
      "--strict",
      path.join(fixtureRoot, "long-agents-file")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("dispatches lint --fail-on-warning", () => {
    const result = runCli([
      "node",
      "dist/cli.js",
      "lint",
      "--json",
      "--fail-on-warning",
      path.join(fixtureRoot, "long-agents-file")
    ]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report.exitCode).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("returns top-level help as success", () => {
    const result = runCli(["node", "dist/cli.js", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("lint");
  });

  it("returns package version as success", () => {
    const result = runCli(["node", "dist/cli.js", "--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${packageVersion}\n`);
  });

  it("returns lint help as success", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor lint");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--format");
    expect(result.stdout).toContain("--strict");
    expect(result.stdout).toContain("--fail-on-warning");
    expect(result.stdout).toContain("--ignore");
    expect(result.stdout).toContain("--max-lines");
    expect(result.stdout).toContain("--annotations-min-severity");
    expect(result.stdout).toContain("--profile");
  });

  it("returns init help as success", () => {
    const result = runCli(["node", "dist/cli.js", "init", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor init");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--force");
  });

  it("returns explain help as success", () => {
    const result = runCli(["node", "dist/cli.js", "explain", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor explain");
    expect(result.stdout).toContain("<target>");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--profile");
  });

  it("returns verify help as success", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: agents-doctor verify");
    expect(result.stdout).toContain("[repo]");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("--format");
    expect(result.stdout).toContain("--strict");
    expect(result.stdout).toContain("--fail-on-warning");
    expect(result.stdout).toContain("--ignore");
    expect(result.stdout).toContain("--max-lines");
    expect(result.stdout).toContain("--annotations-min-severity");
    expect(result.stdout).toContain("--profile");
  });

  it("returns exit 2 for invalid profile values", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--profile", "nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--profile must be one of");
  });

  it("returns exit 2 for unknown commands", () => {
    const result = runCli(["node", "dist/cli.js", "nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command");
  });

  it("returns exit 2 for unknown options", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--wat"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown option");
  });

  it("returns exit 2 for invalid max-lines values", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--max-lines", "nope"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--max-lines must be a positive integer");
  });

  it("returns exit 2 for invalid format values", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--format", "xml"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--format must be one of: human, json, github, sarif");
  });

  it("returns exit 2 for invalid annotation severity values", () => {
    const result = runCli(["node", "dist/cli.js", "verify", "--annotations-min-severity", "critical"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--annotations-min-severity must be one of: error, warning, info");
  });

  it("returns exit 2 when no command is provided", () => {
    const result = runCli(["node", "dist/cli.js"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("command is required");
  });
});

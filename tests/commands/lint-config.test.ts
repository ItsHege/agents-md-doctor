import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLintCommand } from "../../src/commands/index.js";
import { ReportSchema } from "../../src/types/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runLintCommand config", () => {
  it("uses config ignore patterns before reading and linting files", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), validAgentsContent());
    writeAgentsFile(path.join(root, "tests", "fixtures", "long-agents-file", "AGENTS.md"), lines(501));
    writeConfig(root, {
      ignore: ["tests/fixtures/**"]
    });

    const result = runLintCommand({ root, json: true });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.findings).toEqual([]);
  });

  it("reports non-ignored long files", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), `${lines(501)}\n## Safety\n## Testing\n`);

    const result = runLintCommand({ root, json: true });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(report.findings).toMatchObject([
      {
        ruleId: "size.file_too_long",
        severity: "warning",
        file: "AGENTS.md"
      }
    ]);
  });

  it("applies configured max lines and severity", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), validAgentsContent());
    writeConfig(root, {
      rules: {
        "size.file_too_long": {
          severity: "error",
          maxLines: 3
        }
      }
    });

    const result = runLintCommand({ root, json: true });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(report.findings[0]).toMatchObject({
      ruleId: "size.file_too_long",
      severity: "error"
    });
  });

  it("lets CLI max-lines override config maxLines", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), validAgentsContent());
    writeConfig(root, {
      maxLines: 3
    });

    const result = runLintCommand({ root, json: true, maxLines: 100 });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it("skips rules configured as off", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), lines(501));
    writeConfig(root, {
      rules: {
        "size.file_too_long": {
          severity: "off"
        },
        "structure.required_sections": {
          severity: "off"
        }
      }
    });

    const result = runLintCommand({ root, json: true });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it("uses failOnWarning from config", () => {
    const root = makeTempRoot();
    writeAgentsFile(path.join(root, "AGENTS.md"), "# Instructions\n");
    writeConfig(root, {
      failOnWarning: true
    });

    const result = runLintCommand({ root, json: true });
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(1);
    expect(report.exitCode).toBe(1);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it("returns exit 2 for malformed config", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, ".agents-doctor.json"), "{ nope");

    const result = runLintCommand({ root, json: true });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(".agents-doctor.json is not valid JSON");
  });

  it("returns exit 2 for unsafe ignore patterns", () => {
    const root = makeTempRoot();
    writeConfig(root, {
      ignore: ["../outside/**"]
    });

    const result = runLintCommand({ root, json: true });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ignore pattern cannot traverse outside the repo");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-lint-config-"));
  tempRoots.push(root);
  return root;
}

function writeAgentsFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeConfig(root: string, config: unknown): void {
  fs.writeFileSync(path.join(root, ".agents-doctor.json"), JSON.stringify(config));
}

function validAgentsContent(): string {
  return ["# Instructions", "", "## Safety", "", "## Testing"].join("\n");
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");
}

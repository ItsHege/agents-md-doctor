import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctorReport, runExplainReport, runLintReport, runVerifyReport } from "../src/api.js";

const fixtureRoot = path.resolve("tests/fixtures");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("programmatic report API", () => {
  it("returns a parsed verify report for UI callers", () => {
    const result = runVerifyReport({
      root: path.join(fixtureRoot, "short-agents-file")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.exitCode).toBe(0);
    expect(result.report.command).toBe("verify");
    expect(result.report.schemaVersion).toBe("1.0.0");
    expect(result.report.findings.some((finding) => finding.ruleId === "coverage.discovery_summary")).toBe(true);
  });

  it("preserves strict warning failure without changing finding severity", () => {
    const result = runLintReport({
      root: path.join(fixtureRoot, "long-agents-file"),
      strict: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    const sizeFinding = result.report.findings.find((finding) => finding.ruleId === "size.file_too_long");

    expect(result.exitCode).toBe(1);
    expect(result.report.exitCode).toBe(1);
    expect(sizeFinding?.severity).toBe("warning");
  });

  it("returns a run failure for invalid folders", () => {
    const result = runVerifyReport({
      root: path.join(os.tmpdir(), "agents-doctor-missing-folder")
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid folder to fail");
    }

    expect(result.exitCode).toBe(2);
    expect(result.error).toContain("repo path does not exist");
    expect(result.stderr).toContain("agents-doctor: error:");
  });

  it("returns a run failure for unsupported commands from untyped callers", () => {
    const result = runDoctorReport({
      command: "scan"
    } as never);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected unsupported command to fail");
    }

    expect(result.exitCode).toBe(2);
    expect(result.error).toBe("unsupported command: scan");
  });

  it("requires a target path for explain", () => {
    const result = runDoctorReport({
      command: "explain",
      root: path.join(fixtureRoot, "short-agents-file"),
      targetPath: ""
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing explain target to fail");
    }

    expect(result.exitCode).toBe(2);
    expect(result.error).toBe("explain requires a target path");
  });

  it("rejects explain targets outside the selected root", () => {
    const root = makeTempRoot("agents-doctor-api-root-");
    const outsideRoot = makeTempRoot("agents-doctor-api-outside-");
    const outsideFile = path.join(outsideRoot, "outside.txt");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Instructions\n\n## Safety\n\n## Testing\n");
    fs.writeFileSync(outsideFile, "outside");

    const result = runExplainReport({
      root,
      targetPath: outsideFile
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected outside target to fail");
    }

    expect(result.exitCode).toBe(2);
    expect(result.error).toContain("target path is outside root");
  });

  it("does not execute commands found in AGENTS.md through the UI-facing API", () => {
    const root = makeTempRoot("agents-doctor-api-no-exec-");
    const markerPath = path.join(root, "marker-created-by-command.txt");
    const markerLiteral = JSON.stringify(markerPath);

    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      [
        "# Instructions",
        "",
        "## Safety",
        "",
        `Do not run this inline command: \`node -e \"require('fs').writeFileSync(${markerLiteral}, 'owned')\"\`.`,
        "",
        "## Testing",
        "",
        "```bash",
        `node -e "require('fs').writeFileSync(${markerLiteral}, 'owned')"`,
        "```"
      ].join("\n")
    );

    const result = runVerifyReport({ root });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

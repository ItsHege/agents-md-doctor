import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runExplainCommand, runVerifyCommand } from "../../src/commands/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("instruction command safety", () => {
  it("does not execute commands found in AGENTS.md", () => {
    const root = makeTempRoot();
    const markerPath = path.join(root, "marker-created-by-command.txt");
    const markerLiteral = JSON.stringify(markerPath);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      [
        "# Instructions",
        "",
        `Do not run this inline command: \`node -e \"require('fs').writeFileSync(${markerLiteral}, 'owned')\"\`.`,
        "",
        "```bash",
        `node -e "require('fs').writeFileSync(${markerLiteral}, 'owned')"`,
        "```"
      ].join("\n")
    );

    const result = runVerifyCommand({
      root,
      json: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it("does not execute commands while explaining tool evidence", () => {
    const root = makeTempRoot();
    const markerPath = path.join(root, "marker-created-by-explain.txt");
    const markerLiteral = JSON.stringify(markerPath);
    const dangerousInstruction = [
      `Inline: \`node -e "require('fs').writeFileSync(${markerLiteral}, 'owned')"\`.`,
      "",
      "```bash",
      `node -e "require('fs').writeFileSync(${markerLiteral}, 'owned')"`,
      "```"
    ].join("\n");
    fs.writeFileSync(
      path.join(root, "AGENTS.md"),
      [
        "# Instructions",
        "",
        dangerousInstruction
      ].join("\n")
    );
    fs.mkdirSync(path.join(root, ".github", "instructions"), { recursive: true });
    fs.mkdirSync(path.join(root, ".gemini"), { recursive: true });
    fs.mkdirSync(path.join(root, ".windsurf", "rules"), { recursive: true });
    fs.mkdirSync(path.join(root, ".clinerules"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github", "copilot-instructions.md"), dangerousInstruction);
    fs.writeFileSync(path.join(root, ".github", "instructions", "danger.instructions.md"), dangerousInstruction);
    fs.writeFileSync(path.join(root, "GEMINI.md"), dangerousInstruction);
    fs.writeFileSync(path.join(root, ".gemini", "settings.json"), JSON.stringify({ note: dangerousInstruction }));
    fs.writeFileSync(path.join(root, ".windsurf", "rules", "danger.md"), dangerousInstruction);
    fs.writeFileSync(path.join(root, ".windsurfrules"), dangerousInstruction);
    fs.writeFileSync(path.join(root, ".clinerules", "danger.md"), dangerousInstruction);

    const result = runExplainCommand({
      root,
      targetPath: "AGENTS.md",
      json: true
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-no-exec-"));
  tempRoots.push(root);
  return root;
}

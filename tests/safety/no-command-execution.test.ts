import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerifyCommand } from "../../src/commands/index.js";

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
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-no-exec-"));
  tempRoots.push(root);
  return root;
}

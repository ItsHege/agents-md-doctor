import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildToolEvidence } from "../../src/core/tool-evidence.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildToolEvidence", () => {
  it("marks tool surface scans as truncated when traversal budgets are exceeded", () => {
    const root = makeTempRoot();
    fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cursor", "rules", "one.mdc"), "# One\n");
    fs.writeFileSync(path.join(root, ".cursor", "rules", "two.mdc"), "# Two\n");

    const evidence = buildToolEvidence({
      root,
      targetPath: root,
      appliedAgentsFiles: ["AGENTS.md"],
      maxSurfaceDirectoryEntries: 1
    });

    const cursorEvidence = evidence.find((entry) => entry.toolId === "cursor");
    expect(cursorEvidence?.limitations).toContain("surface-file-list-truncated");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-tool-evidence-"));
  tempRoots.push(root);
  return root;
}

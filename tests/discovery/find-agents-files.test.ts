import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findAgentsFiles } from "../../src/discovery/index.js";

const fixtureRoot = path.resolve("tests/fixtures");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("findAgentsFiles", () => {
  it("returns an empty list for an empty repo", () => {
    expect(findAgentsFiles(path.join(fixtureRoot, "empty-repo"))).toEqual([]);
  });

  it("finds root AGENTS.md files", () => {
    expect(findAgentsFiles(path.join(fixtureRoot, "short-agents-file"))).toEqual([
      {
        absolutePath: path.join(fixtureRoot, "short-agents-file", "AGENTS.md"),
        relativePath: "AGENTS.md"
      }
    ]);
  });

  it("finds nested files in deterministic order", () => {
    expect(findAgentsFiles(path.join(fixtureRoot, "nested-agents")).map((file) => file.relativePath)).toEqual([
      "AGENTS.md",
      "packages/app/AGENTS.md"
    ]);
  });

  it("ignores generated and dependency directories", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Root\n");

    for (const ignoredDir of [".git", "node_modules", "dist", "build", "coverage"]) {
      const ignoredPath = path.join(root, ignoredDir);
      fs.mkdirSync(ignoredPath, { recursive: true });
      fs.writeFileSync(path.join(ignoredPath, "AGENTS.md"), "# Ignored\n");
    }

    expect(findAgentsFiles(root).map((file) => file.relativePath)).toEqual(["AGENTS.md"]);
  });

  it("does not follow symlinked directories", () => {
    const root = makeTempRoot();
    const target = makeTempRoot();
    const link = path.join(root, "linked");
    fs.writeFileSync(path.join(target, "AGENTS.md"), "# Linked\n");

    try {
      fs.symlinkSync(target, link, "junction");
    } catch {
      return;
    }

    expect(findAgentsFiles(root)).toEqual([]);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-discovery-"));
  tempRoots.push(root);
  return root;
}

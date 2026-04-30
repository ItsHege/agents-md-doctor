import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTextFileWithinRoot } from "../../src/io/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("readTextFileWithinRoot", () => {
  it("reads UTF-8 text files", () => {
    const root = makeTempRoot();
    const filePath = path.join(root, "AGENTS.md");
    fs.writeFileSync(filePath, "# Hello\n", "utf8");

    expect(readTextFileWithinRoot({ root, filePath })).toBe("# Hello\n");
  });

  it("rejects missing files", () => {
    const root = makeTempRoot();

    expect(() => readTextFileWithinRoot({ root, filePath: path.join(root, "missing.md") })).toThrow(
      "file does not exist"
    );
  });

  it("rejects files over the byte guard", () => {
    const root = makeTempRoot();
    const filePath = path.join(root, "AGENTS.md");
    fs.writeFileSync(filePath, "12345", "utf8");

    expect(() => readTextFileWithinRoot({ root, filePath, maxBytes: 4 })).toThrow("file is too large");
  });

  it("rejects files outside the root", () => {
    const root = makeTempRoot();
    const outsideRoot = makeTempRoot();
    const outsideFile = path.join(outsideRoot, "AGENTS.md");
    fs.writeFileSync(outsideFile, "# Outside\n", "utf8");

    expect(() => readTextFileWithinRoot({ root, filePath: outsideFile })).toThrow("file is outside root");
  });

  it("rejects symlinks that escape the root", () => {
    const root = makeTempRoot();
    const outsideRoot = makeTempRoot();
    const outsideFile = path.join(outsideRoot, "AGENTS.md");
    const linkPath = path.join(root, "linked.md");
    fs.writeFileSync(outsideFile, "# Outside\n", "utf8");

    try {
      fs.symlinkSync(outsideFile, linkPath, "file");
    } catch {
      return;
    }

    expect(() => readTextFileWithinRoot({ root, filePath: linkPath })).toThrow("file is outside root");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-io-"));
  tempRoots.push(root);
  return root;
}


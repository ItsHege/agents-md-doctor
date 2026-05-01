import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPathReferences } from "../../../src/rules/paths/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("paths.reference_missing", () => {
  it("reports missing path references from links and inline code", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nSee [Missing](docs/missing.md) and `./missing.txt`.\n");

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({ ruleId: finding.ruleId, line: finding.line, reason: finding.details?.reason }))
    ).toEqual([
      { ruleId: "paths.reference_missing", line: 3, reason: "not_found" },
      { ruleId: "paths.reference_missing", line: 3, reason: "not_found" }
    ]);
  });

  it("ignores URL and anchor links", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nSee [Web](https://example.com) and [Anchor](#safety).\n");

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("reports outside-root traversal attempts", () => {
    const root = makeTempRoot();
    const nestedDir = path.join(root, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });
    const agentsPath = path.join(nestedDir, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nUse `../../secrets/.env`.\n");

    const findings = checkPathReferences({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "nested/AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings[0]).toMatchObject({
      ruleId: "paths.reference_missing",
      file: "nested/AGENTS.md",
      details: {
        reason: "outside_repo"
      }
    });
  });

  it("ignores obvious placeholder and glob-style path references", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Use `game/assets/world/textures/<asset-id>/raw_generations/`.",
        "Use `docs/{name}/index.md`.",
        "Use `content/[id]/meta.json`.",
        "Use `path/to/...`.",
        "Use `/path/to/...`.",
        "Use `YOUR_PATH`.",
        "Use `packages/*/CHANGELOG.md`."
      ].join("\n")
    );

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-rule-paths-"));
  tempRoots.push(root);
  return root;
}

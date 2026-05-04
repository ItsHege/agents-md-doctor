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

  it("ignores domain-like links without explicit scheme", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      "# Instructions\n\nSee [GitHub](github.com/example/repo) and [Docs](docs.example.org/guide).\n"
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

  it("reports symlink or junction references that resolve outside the repo", () => {
    const root = makeTempRoot();
    const outsideRoot = makeTempRoot();
    fs.mkdirSync(path.join(outsideRoot, "secret"), { recursive: true });
    fs.writeFileSync(path.join(outsideRoot, "secret", "env.txt"), "SECRET=1\n");

    try {
      fs.symlinkSync(path.join(outsideRoot, "secret"), path.join(root, "linked"), "junction");
    } catch {
      return;
    }

    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRead `linked/env.txt`.\n");

    const findings = checkPathReferences({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "paths.reference_missing",
      file: "AGENTS.md",
      line: 3,
      details: {
        reference: "linked/env.txt",
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

  it("ignores import-like module specifiers in inline code", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Use `next/font` in examples.",
        "Use `@scope/pkg` when documenting dependencies.",
        "Use `.ts` and `.tsx` to describe TypeScript extensions."
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

  it("ignores absolute system-like paths", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Use `/etc/hosts` for local examples.",
        "Use `/usr/local/bin/tool` as a sample.",
        "Use `%APPDATA%\\npm\\prefix` in Windows notes.",
        "Use `$HOME/.config/tool` in shell examples."
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

  it("still reports explicit filesystem-looking inline paths", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Check `src/missing.ts`.",
        "Then check `./also-missing.ts`."
      ].join("\n")
    );

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({ line: finding.line, reason: finding.details?.reason }))
    ).toEqual([
      { line: 3, reason: "not_found" },
      { line: 4, reason: "not_found" }
    ]);
  });

  it("keeps missing package-lock.json references as real missing-path signal", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, ["# Instructions", "", "Run install after checking `package-lock.json`."].join("\n"));

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        reference: finding.details?.reference,
        reason: finding.details?.reason
      }))
    ).toEqual([
      {
        ruleId: "paths.reference_missing",
        severity: "warning",
        file: "AGENTS.md",
        line: 3,
        reference: "package-lock.json",
        reason: "not_found"
      }
    ]);
  });

  it("keeps missing .travis.yml references as real missing-path signal", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, ["# Instructions", "", "Mirror CI behavior from `.travis.yml`."].join("\n"));

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        reference: finding.details?.reference,
        reason: finding.details?.reason
      }))
    ).toEqual([
      {
        ruleId: "paths.reference_missing",
        severity: "warning",
        file: "AGENTS.md",
        line: 3,
        reference: ".travis.yml",
        reason: "not_found"
      }
    ]);
  });

  it("ignores bare example and template filenames in prose", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "For examples, pretend `my_module.ts` exports helpers.",
        "Templates may call files `index.ts` and `types.ts`."
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

  it("ignores generated and output directory names in prose", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Generated outputs may appear under `dist/`, `node_modules/`, `.next/`, or `target/`."
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

  it("ignores architectural bare source basenames while reporting explicit src paths", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Architecture notes mention `entry-base.ts` and `app-render.tsx` as component names.",
        "But explicit repo paths such as `src/missing.ts` must still be checked."
      ].join("\n")
    );

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        reference: finding.details?.reference,
        reason: finding.details?.reason
      }))
    ).toEqual([
      {
        ruleId: "paths.reference_missing",
        severity: "warning",
        file: "AGENTS.md",
        line: 4,
        reference: "src/missing.ts",
        reason: "not_found"
      }
    ]);
  });

  it("reports path references with mismatched casing", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(path.join(root, "readme.md"), "# Lowercase readme\n");
    fs.writeFileSync(agentsPath, ["# Instructions", "", "Read `README.md` before editing."].join("\n"));

    expect(
      checkPathReferences({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      }).map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        reference: finding.details?.reference,
        reason: finding.details?.reason
      }))
    ).toEqual([
      {
        ruleId: "paths.reference_missing",
        severity: "warning",
        file: "AGENTS.md",
        line: 3,
        reference: "README.md",
        reason: "not_found"
      }
    ]);
  });

  it("ignores missing path findings with optionality markers", () => {
    const root = makeTempRoot();
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nSee `docs/optional.md` if available.\n");

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

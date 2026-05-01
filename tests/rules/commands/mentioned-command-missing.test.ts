import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMentionedCommands } from "../../../src/rules/commands/index.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("commands.mentioned_command_missing", () => {
  it("accepts existing package scripts", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `npm run test` before merge.\n");

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("reports missing scripts from inline and code blocks", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Run `npm run lint` and:",
        "",
        "```bash",
        "yarn build",
        "```"
      ].join("\n")
    );

    const findings = checkMentionedCommands({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings.map((finding) => finding.details?.scriptName)).toEqual(["lint", "build"]);
    expect(findings.every((finding) => finding.ruleId === "commands.mentioned_command_missing")).toBe(true);
  });

  it("accepts npm run-script and bun run references", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc -p .", test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Run `npm run-script build`.",
        "",
        "```bash",
        "bun run test",
        "```"
      ].join("\n")
    );

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("treats yarn and pnpm aliases as script references", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { lint: "eslint .", test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Run `yarn lint` and `pnpm test` before merge.",
        "",
        "```bash",
        "yarn workspace web test",
        "pnpm dlx cowsay ok",
        "```"
      ].join("\n")
    );

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("reports missing script when using pnpm alias", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `pnpm lint`.\n");

    const findings = checkMentionedCommands({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.details?.scriptName).toBe("lint");
  });

  it("ignores pnpm binary-style command invocations", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `pnpm prettier . --check`.\n");

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("handles package-manager flags before script names", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run", build: "tsc -p ." } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Run `pnpm --filter web test` and `pnpm --filter=@scope/web build`.",
        "",
        "```bash",
        "pnpm --filter web run test",
        "```"
      ].join("\n")
    );

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("reports missing script when using pnpm filter + alias syntax", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `pnpm --filter web lint`.\n");

    const findings = checkMentionedCommands({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.details?.scriptName).toBe("lint");
  });

  it("downgrades to scope-ambiguous warning when script exists in a workspace package", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ private: true, scripts: {} }));
    fs.mkdirSync(path.join(root, "apps", "web"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "apps", "web", "package.json"),
      JSON.stringify({ scripts: { dev: "vite", test: "vitest run" } })
    );
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `pnpm run dev`.\n");

    const findings = checkMentionedCommands({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      details: {
        scriptName: "dev",
        source: "workspace",
        reason: "scope_ambiguous"
      }
    });
  });

  it("does not treat flags or placeholders as script names", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(
      agentsPath,
      [
        "# Instructions",
        "",
        "Examples:",
        "",
        "`pnpm run --if-present`",
        "`pnpm --filter web run --if-present`",
        "`pnpm --filter <workspace> run <script>`",
        "`yarn run <script>`"
      ].join("\n")
    );

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("ignores missing command findings with optionality markers", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `npm run lint` if present.\n");

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });

  it("validates Makefile targets when mentioned", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(path.join(root, "Makefile"), "test:\n\t@echo ok\n");
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `make verify`.\n");

    const findings = checkMentionedCommands({
      root,
      fileAbsolutePath: agentsPath,
      fileRelativePath: "AGENTS.md",
      content: fs.readFileSync(agentsPath, "utf8")
    });

    expect(findings[0]).toMatchObject({
      ruleId: "commands.mentioned_command_missing",
      details: {
        targetName: "verify",
        source: "Makefile"
      }
    });
  });

  it("parses Makefile targets with dependencies and multiple targets per rule", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    fs.writeFileSync(
      path.join(root, "Makefile"),
      [
        "build test: prepare",
        "\t@echo done",
        "prepare:",
        "\t@echo ready",
        "VERSION := 1",
        ".PHONY: build test prepare"
      ].join("\n")
    );
    const agentsPath = path.join(root, "AGENTS.md");
    fs.writeFileSync(agentsPath, "# Instructions\n\nRun `make build` and `make test`.\n");

    expect(
      checkMentionedCommands({
        root,
        fileAbsolutePath: agentsPath,
        fileRelativePath: "AGENTS.md",
        content: fs.readFileSync(agentsPath, "utf8")
      })
    ).toEqual([]);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-rule-commands-"));
  tempRoots.push(root);
  return root;
}

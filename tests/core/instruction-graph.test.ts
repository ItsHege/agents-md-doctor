import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildInstructionGraph } from "../../src/core/instruction-graph.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildInstructionGraph", () => {
  it("loads matching referenced instruction files from links and inline code", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "AGENTS.md",
      "# Root\n\nRead [agent guide](docs/agent/testing.md), `.claude/commands/review.md`, and `.cursor/rules/react.md`.\n"
    );
    writeFile(root, "docs/agent/testing.md", "# Testing\n");
    writeFile(root, ".claude/commands/review.md", "# Review\n");
    writeFile(root, ".cursor/rules/react.md", "# React\n");

    const graph = buildInstructionGraph({
      root,
      entryFiles: [loadEntry(root, "AGENTS.md")],
      maxDepth: 2,
      include: ["**/AGENTS.md", "**/docs/agent/**/*.md", "**/.claude/**/*.md", "**/.cursor/rules/**/*.md"]
    });

    expect(graph.nodes.map((node) => node.id)).toEqual([
      ".claude/commands/review.md",
      ".cursor/rules/react.md",
      "AGENTS.md",
      "docs/agent/testing.md"
    ]);
    expect(graph.edges.map((edge) => edge.to).sort()).toEqual([
      ".claude/commands/review.md",
      ".cursor/rules/react.md",
      "docs/agent/testing.md"
    ]);
    expect(graph.diagnostics).toEqual([]);
  });

  it("ignores references from an instruction file to itself", () => {
    const root = makeTempRoot();
    writeFile(root, "AGENTS.md", "# Root\n\nCanonical project instruction file is `AGENTS.md`.\n");

    const graph = buildInstructionGraph({
      root,
      entryFiles: [loadEntry(root, "AGENTS.md")],
      maxDepth: 2,
      include: ["**/AGENTS.md"]
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(["AGENTS.md"]);
    expect(graph.edges).toEqual([]);
    expect(graph.diagnostics).toEqual([]);
  });

  it("ignores non-instruction markdown references and fenced code blocks", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "AGENTS.md",
      [
        "# Root",
        "",
        "Read [API docs](docs/api.md).",
        "Ignore [Web](https://example.com/AGENTS.md), [Anchor](#agents), [Mail](mailto:test@example.com), and [Domain](github.com/org/repo/AGENTS.md).",
        "Ignore `path/to/AGENTS.md`, `docs/*/AGENTS.md`, `/etc/AGENTS.md`, `C:\\repo\\AGENTS.md`, and `$HOME/AGENTS.md`.",
        "",
        "```md",
        "docs/agent/hidden.md",
        "```"
      ].join("\n")
    );
    writeFile(root, "docs/api.md", "# API\n");
    writeFile(root, "docs/agent/hidden.md", "# Hidden\n");

    const graph = buildInstructionGraph({
      root,
      entryFiles: [loadEntry(root, "AGENTS.md")],
      maxDepth: 2,
      include: ["**/AGENTS.md", "**/docs/agent/**/*.md"]
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(["AGENTS.md"]);
    expect(graph.edges).toEqual([]);
  });

  it("reports missing, outside-root, unreadable, cycle, and depth diagnostics deterministically", () => {
    const root = makeTempRoot();
    writeFile(
      root,
      "AGENTS.md",
      [
        "# Root",
        "",
        "Read [missing agent](docs/agent/missing.md).",
        "Read [outside agent](../outside-agent.md).",
        "Read [directory agent](docs/agent/directory.md).",
        "Read [next agent](docs/agent/next.md)."
      ].join("\n")
    );
    fs.mkdirSync(path.join(root, "docs", "agent", "directory.md"), { recursive: true });
    writeFile(root, "docs/agent/next.md", "# Next\n\nRead [root](../../AGENTS.md) and [deep](deep/instructions.md).\n");
    writeFile(root, "docs/agent/deep/instructions.md", "# Deep\n");

    const graph = buildInstructionGraph({
      root,
      entryFiles: [loadEntry(root, "AGENTS.md")],
      maxDepth: 1,
      include: ["**/AGENTS.md", "**/docs/agent/**/*.md"]
    });

    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "instruction_reference_missing",
      "instruction_reference_outside_repo",
      "instruction_reference_unreadable",
      "instruction_graph_cycle",
      "instruction_graph_depth_exceeded"
    ]);
  });

  it("does not follow symlink references", () => {
    const root = makeTempRoot();
    writeFile(root, "AGENTS.md", "# Root\n\nRead [linked agent](docs/agent/linked.md).\n");
    writeFile(root, "docs/agent/real.md", "# Real\n");

    try {
      fs.symlinkSync(path.join(root, "docs", "agent", "real.md"), path.join(root, "docs", "agent", "linked.md"));
    } catch {
      return;
    }

    const graph = buildInstructionGraph({
      root,
      entryFiles: [loadEntry(root, "AGENTS.md")],
      maxDepth: 2,
      include: ["**/AGENTS.md", "**/docs/agent/**/*.md"]
    });

    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["instruction_reference_symlink"]);
    expect(graph.nodes.find((node) => node.id === "docs/agent/linked.md")?.status).toBe("symlink");
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-graph-"));
  tempRoots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function loadEntry(root: string, relativePath: string): { absolutePath: string; relativePath: string; content: string } {
  const absolutePath = path.join(root, relativePath);
  return {
    absolutePath,
    relativePath,
    content: fs.readFileSync(absolutePath, "utf8")
  };
}

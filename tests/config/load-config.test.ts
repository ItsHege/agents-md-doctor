import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, validateIgnorePatterns } from "../../src/config/index.js";
import { AppError } from "../../src/errors.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("returns defaults when config is missing", () => {
    expect(loadConfig({ root: makeTempRoot() })).toEqual({
      ignore: [],
      failOnWarning: false,
      instructionGraph: {
        enabled: false,
        maxDepth: 2,
        include: [
          "**/AGENTS.md",
          "**/.agents/**/*.md",
          "**/docs/agents/**/*.md",
          "**/docs/agent/**/*.md",
          "**/CLAUDE.md",
          "**/GEMINI.md",
          "**/.claude/**/*.md",
          "**/.github/copilot-instructions.md",
          "**/.cursor/rules/**/*.md"
        ]
      },
      rules: {}
    });
  });

  it("loads and validates .agents-doctor.json", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        ignore: ["tests/fixtures/**"],
        maxLines: 400,
        failOnWarning: true,
        instructionGraph: {
          enabled: true,
          maxDepth: 3,
          include: ["**/AGENTS.md", "**/.cursor/rules/**/*.md"]
        },
        rules: {
          "size.file_too_long": {
            severity: "error",
            maxLines: 300
          }
        }
      })
    );

    expect(loadConfig({ root })).toEqual({
      ignore: ["tests/fixtures/**"],
      maxLines: 400,
      failOnWarning: true,
      instructionGraph: {
        enabled: true,
        maxDepth: 3,
        include: ["**/AGENTS.md", "**/.cursor/rules/**/*.md"]
      },
      rules: {
        "size.file_too_long": {
          severity: "error",
          maxLines: 300
        }
      }
    });
  });

  it("throws an app error for malformed JSON", () => {
    const root = makeTempRoot();
    fs.writeFileSync(path.join(root, ".agents-doctor.json"), "{ nope");

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects ignore patterns that escape the repo", () => {
    expect(() => validateIgnorePatterns(["../outside/**"])).toThrow(AppError);
  });

  it("rejects invalid instruction graph maxDepth", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        instructionGraph: {
          maxDepth: 11
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });

  it("rejects instruction graph include patterns that escape the repo", () => {
    const root = makeTempRoot();
    fs.writeFileSync(
      path.join(root, ".agents-doctor.json"),
      JSON.stringify({
        instructionGraph: {
          include: ["/absolute/path.md"]
        }
      })
    );

    expect(() => loadConfig({ root })).toThrow(AppError);
  });
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-config-"));
  tempRoots.push(root);
  return root;
}

import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { ReportSchema } from "../src/types/index.js";

const fixtureRoot = path.resolve("tests/fixtures");

describe("runCli", () => {
  it("dispatches lint --json", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--json", path.join(fixtureRoot, "short-agents-file")]);
    const report = ReportSchema.parse(JSON.parse(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.command).toBe("lint");
  });

  it("returns exit 2 when repo path is missing", () => {
    const result = runCli(["node", "dist/cli.js", "lint", "--json"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("repo path is required");
  });
});


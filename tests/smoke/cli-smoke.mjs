import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const cliPath = path.join(projectRoot, "dist/cli.js");

assertSuccessfulHelp(["--help"]);
assertSuccessfulHelp(["lint", "--help"]);

const shortReport = runLint(["lint", "--json", "tests/fixtures/short-agents-file"]);
assert.equal(shortReport.exitCode, 0);
assert.deepEqual(shortReport.summary, {
  errorCount: 0,
  warningCount: 0,
  infoCount: 0
});
assert.deepEqual(shortReport.findings, []);

const defaultCwdReport = runLint(["lint", "--json"], path.join(projectRoot, "tests/fixtures/short-agents-file"));
assert.equal(defaultCwdReport.exitCode, 0);
assert.deepEqual(defaultCwdReport.findings, []);

const longReport = runLint(["lint", "--json", "tests/fixtures/long-agents-file"]);
assert.equal(longReport.exitCode, 0);
assert.deepEqual(longReport.summary, {
  errorCount: 0,
  warningCount: 1,
  infoCount: 0
});
assert.equal(longReport.findings.length, 1);
assert.deepEqual(longReport.findings[0], {
  ruleId: "size.file_too_long",
  severity: "warning",
  message: "AGENTS.md has 501 lines. Recommended maximum: 500 lines.",
  file: "AGENTS.md",
  line: 1,
  details: {
    lineCount: 501,
    thresholdLines: 500,
    unit: "lines"
  }
});

const humanLongResult = runCli(["lint"], path.join(projectRoot, "tests/fixtures/long-agents-file"));
assert.equal(humanLongResult.status, 0, humanLongResult.stderr);
assert.equal(humanLongResult.stderr, "");
assert.match(humanLongResult.stdout, /agents-doctor lint: 1 warning/);
assert.match(humanLongResult.stdout, /size\.file_too_long/);

const strictLongResult = runCli(["lint", "--strict", "tests/fixtures/long-agents-file"]);
assert.equal(strictLongResult.status, 1);
assert.equal(strictLongResult.stderr, "");
assert.match(strictLongResult.stdout, /Strict mode enabled: warnings set exit code 1\./);

function assertSuccessfulHelp(args) {
  const result = runCli(args);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Usage: agents-doctor/);
}

function runLint(args, cwd = projectRoot) {
  const result = runCli(args, cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.tool, "agents-doctor");
  assert.equal(report.command, "lint");
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  return report;
}

function runCli(args, cwd = projectRoot) {
  const result = spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd,
      encoding: "utf8"
    }
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

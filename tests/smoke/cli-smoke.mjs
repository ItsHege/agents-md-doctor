import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const cliPath = path.join(projectRoot, "dist/cli.js");
const packageVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;
const initRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-cli-smoke-init-"));

assertSuccessfulHelp(["--help"]);
assertSuccessfulHelp(["init", "--help"]);
assertSuccessfulHelp(["lint", "--help"]);
assertSuccessfulHelp(["verify", "--help"]);

const versionResult = runCli(["--version"]);
assert.equal(versionResult.status, 0, versionResult.stderr);
assert.equal(versionResult.stderr, "");
assert.equal(versionResult.stdout, `${packageVersion}\n`);

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

const selfLintReport = runLint(["lint", "--json", "."]);
assert.equal(selfLintReport.exitCode, 0);
assert.deepEqual(selfLintReport.summary, {
  errorCount: 0,
  warningCount: 0,
  infoCount: 0
});
assert.deepEqual(selfLintReport.findings, []);

const verifyReport = runReport(["verify", "--json", "tests/fixtures/short-agents-file"], "verify");
assert.equal(verifyReport.exitCode, 0);
assert.equal(verifyReport.command, "verify");
assert.equal(
  verifyReport.findings.some((finding) => finding.ruleId === "coverage.discovery_summary"),
  true
);

const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-cli-smoke-profile-"));
try {
  fs.writeFileSync(path.join(profileRoot, "GEMINI.md"), "# Gemini Instructions\n");
  const profileReport = runReport(["verify", "--json", "--profile", "gemini-cli", profileRoot], "verify");
  const profileCoverage = profileReport.findings.find((finding) => finding.ruleId === "coverage.discovery_summary");
  assert.equal(profileCoverage.details.toolProfile, "gemini-cli");
  assert.deepEqual(profileCoverage.details.lintFileNames, ["AGENTS.md", "GEMINI.md"]);
} finally {
  fs.rmSync(profileRoot, { recursive: true, force: true });
}

try {
  const initResult = runCli(["init", initRoot]);
  assert.equal(initResult.status, 0, initResult.stderr);
  assert.equal(initResult.stderr, "");
  assert.match(initResult.stdout, /created starter config/);

  const config = JSON.parse(fs.readFileSync(path.join(initRoot, ".agents-doctor.json"), "utf8"));
  assert.deepEqual(config.lintFileNames, ["AGENTS.md"]);

  const noOverwriteResult = runCli(["init", initRoot]);
  assert.equal(noOverwriteResult.status, 0, noOverwriteResult.stderr);
  assert.match(noOverwriteResult.stdout, /config already exists/);
} finally {
  fs.rmSync(initRoot, { recursive: true, force: true });
}

function assertSuccessfulHelp(args) {
  const result = runCli(args);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Usage: agents-doctor/);
}

function runLint(args, cwd = projectRoot) {
  return runReport(args, "lint", cwd);
}

function runReport(args, command, cwd = projectRoot) {
  const result = runCli(args, cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.tool, "agents-doctor");
  assert.equal(report.command, command);
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

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const shortReport = runLint("tests/fixtures/short-agents-file");
assert.equal(shortReport.exitCode, 0);
assert.deepEqual(shortReport.summary, {
  errorCount: 0,
  warningCount: 0,
  infoCount: 0
});
assert.deepEqual(shortReport.findings, []);

const longReport = runLint("tests/fixtures/long-agents-file");
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

function runLint(fixturePath) {
  const result = spawnSync(
    process.execPath,
    ["dist/cli.js", "lint", "--json", fixturePath],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.tool, "agents-doctor");
  assert.equal(report.command, "lint");
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  return report;
}

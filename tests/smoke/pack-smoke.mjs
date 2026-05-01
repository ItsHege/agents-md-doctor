import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const npmCliPath = process.env.npm_execpath;
assert.equal(typeof npmCliPath, "string", "npm_execpath must be available when running package smoke through npm");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-doctor-pack-smoke-"));
let tarballPath;

try {
  const packResult = run(process.execPath, [npmCliPath, "pack", "--json"], projectRoot);
  const packOutput = JSON.parse(packResult.stdout);
  const tarballName = packOutput[0]?.filename;
  assert.equal(typeof tarballName, "string");
  tarballPath = path.join(projectRoot, tarballName);

  run(process.execPath, [npmCliPath, "init", "-y"], tempRoot);
  run(process.execPath, [npmCliPath, "install", tarballPath, "--ignore-scripts"], tempRoot);

  const helpResult = run(process.execPath, [npmCliPath, "exec", "agents-doctor", "--", "--help"], tempRoot);
  assert.match(`${helpResult.stdout}${helpResult.stderr}`, /Usage: agents-doctor/);

  const lintResult = run(
    process.execPath,
    [npmCliPath, "exec", "agents-doctor", "--", "lint", "--json", path.join(projectRoot, "tests", "fixtures", "short-agents-file")],
    tempRoot
  );
  const report = JSON.parse(lintResult.stdout);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.tool, "agents-doctor");
  assert.equal(report.command, "lint");
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.findings, []);
} finally {
  if (tarballPath) {
    fs.rmSync(tarballPath, { force: true });
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8"
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}\nERROR:\n${result.error?.message ?? ""}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const cliPath = path.join(projectRoot, "dist", "cli.js");
const manifestPath = path.join(projectRoot, "benchmarks", "repos.json");
const expectationsPath = path.join(projectRoot, "benchmarks", "expected-findings.json");
const outputDir = path.join(projectRoot, "benchmarks", "out");
const outputPath = path.join(outputDir, "latest.json");

if (!fs.existsSync(cliPath)) {
  console.error("Benchmark runner requires dist/cli.js. Run `npm run build` first.");
  process.exit(2);
}

const manifest = readJsonFile(manifestPath);
const expectations = readJsonFile(expectationsPath);
const expectedByRepoAndCommand = groupExpectations(expectations.expectations ?? []);
const graphExpectedByRepoAndTarget = groupGraphExpectations(expectations.graphExpectations ?? []);
const startedAt = new Date().toISOString();
const tempRoot = createShortTempRoot();

/** @type {Array<object>} */
const repoResults = [];
/** @type {Array<object>} */
const expectationResults = [];
let operationalFailures = 0;

try {
  for (const repo of manifest.repos ?? []) {
    const repoResult = runRepoBenchmark(repo, tempRoot);
    repoResults.push(repoResult);

    const repoExpectations = expectedByRepoAndCommand.get(repo.id) ?? [];
    const repoExpectationResults = evaluateExpectations(repoResult, repoExpectations);
    expectationResults.push(...repoExpectationResults);
    const graphExpectations = graphExpectedByRepoAndTarget.get(repo.id) ?? [];
    expectationResults.push(...evaluateGraphExpectations(repoResult, graphExpectations));

    if (!repoResult.lint.ok || !repoResult.verify.ok || repoResult.graphTargets.some((target) => !target.explain.ok)) {
      operationalFailures += 1;
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const failedExpectations = expectationResults.filter((result) => result.ok === false);
const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  startedAt,
  completedAt: new Date().toISOString(),
  runner: "scripts/benchmark/run-benchmark.mjs",
  notes: [
    "This command clones repositories, reads files, and runs agents-doctor lint/verify.",
    "It never executes repository scripts or commands from target repositories."
  ],
  repoCount: repoResults.length,
  operationalFailures,
  expectationSummary: {
    total: expectationResults.length,
    passed: expectationResults.length - failedExpectations.length,
    failed: failedExpectations.length
  },
  repos: repoResults,
  expectationResults
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

printSummary(report, outputPath);

if (operationalFailures > 0 || failedExpectations.length > 0) {
  process.exitCode = 1;
}

function runRepoBenchmark(repo, tempDir) {
  const repoDir = path.join(tempDir, repo.id);
  const cloneStartedAt = new Date().toISOString();
  const clone = runProcess(
    "git",
    ["clone", "-c", "core.longpaths=true", "--depth", "1", "--single-branch", repo.url, repoDir],
    projectRoot
  );
  if (!clone.ok) {
    const cloneCompletedAt = new Date().toISOString();
    return {
      id: repo.id,
      url: repo.url,
      commit: repo.commit,
      repoType: repo.repoType,
      expectedStatus: repo.expectedStatus,
      notes: repo.notes,
      cloneStartedAt,
      cloneCompletedAt,
      clone: {
        ok: false,
        stderr: clone.stderr
      },
      checkout: {
        ok: false,
        stderr: "Checkout skipped because clone failed."
      },
      lint: {
        ok: false,
        status: null,
        stderr: "Skipped because clone failed.",
        stdoutPreview: ""
      },
      verify: {
        ok: false,
        status: null,
        stderr: "Skipped because clone failed.",
        stdoutPreview: ""
      },
      graphTargets: []
    };
  }

  let checkout = { ok: true, stdout: "", stderr: "" };
  if (repo.commit) {
    const fetch = runProcess("git", ["-C", repoDir, "fetch", "--depth", "1", "origin", repo.commit], projectRoot);
    const detach = runProcess("git", ["-C", repoDir, "checkout", "--detach", repo.commit], projectRoot);
    checkout = {
      ok: fetch.ok && detach.ok,
      stdout: [fetch.stdout, detach.stdout].filter(Boolean).join("\n"),
      stderr: [fetch.stderr, detach.stderr].filter(Boolean).join("\n")
    };
  }

  const lint = runCli("lint", repoDir);
  const verify = runCli("verify", repoDir);
  const graphTargets = runGraphTargets(repo.graphTargets ?? [], repoDir);
  const cloneCompletedAt = new Date().toISOString();

  return {
    id: repo.id,
    url: repo.url,
    commit: repo.commit,
    repoType: repo.repoType,
    expectedStatus: repo.expectedStatus,
    notes: repo.notes,
    cloneStartedAt,
    cloneCompletedAt,
    clone: {
      ok: clone.ok,
      stderr: clone.stderr
    },
    checkout: {
      ok: checkout.ok,
      stderr: checkout.stderr
    },
    lint: summarizeCommandResult(lint),
    verify: summarizeCommandResult(verify),
    graphTargets
  };
}

function runGraphTargets(graphTargets, repoDir) {
  return graphTargets.map((target) => {
    const explain = runCli("explain", repoDir, [target.path]);
    return {
      id: target.id,
      path: target.path,
      notes: target.notes,
      explain: summarizeCommandResult(explain)
    };
  });
}

function runCli(command, repoDir, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    command === "explain" ? [cliPath, command, "--json", ...extraArgs, repoDir] : [cliPath, command, "--json", repoDir],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    }
  );

  const canParseReport = result.status === 0 || result.status === 1;
  if (!canParseReport) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  try {
    const report = JSON.parse(result.stdout);
    return {
      ok: true,
      status: result.status,
      report
    };
  } catch (error) {
    return {
      ok: false,
      status: result.status,
      stdout: result.stdout,
      stderr: `Failed to parse JSON output: ${error instanceof Error ? error.message : "unknown parse error"}`
    };
  }
}

function summarizeCommandResult(commandResult) {
  if (!commandResult.ok) {
    return {
      ok: false,
      status: commandResult.status,
      stderr: commandResult.stderr.trim(),
      stdoutPreview: safePreview(commandResult.stdout)
    };
  }

  const report = commandResult.report;
  return {
    ok: true,
    status: commandResult.status,
    exitCode: report.exitCode,
    summary: report.summary,
    findingCount: Array.isArray(report.findings) ? report.findings.length : 0,
    findingsByRule: countByRule(report.findings ?? []),
    findings: report.findings ?? []
  };
}

function evaluateExpectations(repoResult, repoExpectations) {
  /** @type {Array<object>} */
  const results = [];

  for (const expected of repoExpectations) {
    const commandResult = expected.command === "lint" ? repoResult.lint : repoResult.verify;
    const findings = Array.isArray(commandResult.findings) ? commandResult.findings : [];
    const matched = findings.some(
      (finding) => finding.ruleId === expected.ruleId && finding.severity === expected.expectedSeverity
    );
    const ok = expected.expectPresence ? matched : !matched;

    results.push({
      repoId: repoResult.id,
      command: expected.command,
      ruleId: expected.ruleId,
      expectedSeverity: expected.expectedSeverity,
      expectPresence: expected.expectPresence,
      expectedLabel: expected.expectedLabel,
      notes: expected.notes,
      ok
    });
  }

  return results;
}

function evaluateGraphExpectations(repoResult, graphExpectations) {
  /** @type {Array<object>} */
  const results = [];

  for (const expected of graphExpectations) {
    const targetResult = repoResult.graphTargets.find((target) => target.id === expected.targetId);
    const findings = targetResult?.explain?.findings ?? [];
    const appliedChain = extractAppliedChain(findings);
    const ok = arraysEqual(appliedChain, expected.expectedAppliedFiles ?? []);

    results.push({
      repoId: repoResult.id,
      command: "explain",
      targetId: expected.targetId,
      targetPath: targetResult?.path,
      ruleId: "inheritance.applied_chain",
      expectedAppliedFiles: expected.expectedAppliedFiles ?? [],
      actualAppliedFiles: appliedChain,
      expectedLabel: expected.expectedLabel,
      notes: expected.notes,
      ok
    });
  }

  return results;
}

function extractAppliedChain(findings) {
  const appliedChainFinding = findings.find((finding) => finding.ruleId === "inheritance.applied_chain");
  const appliedFiles = appliedChainFinding?.details?.appliedFiles;
  return Array.isArray(appliedFiles) ? appliedFiles : [];
}

function groupExpectations(expectationList) {
  /** @type {Map<string, Array<object>>} */
  const grouped = new Map();

  for (const expected of expectationList) {
    const list = grouped.get(expected.repoId) ?? [];
    list.push(expected);
    grouped.set(expected.repoId, list);
  }

  return grouped;
}

function groupGraphExpectations(expectationList) {
  /** @type {Map<string, Array<object>>} */
  const grouped = new Map();

  for (const expected of expectationList) {
    const list = grouped.get(expected.repoId) ?? [];
    list.push(expected);
    grouped.set(expected.repoId, list);
  }

  return grouped;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function countByRule(findings) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const finding of findings) {
    counts[finding.ruleId] = (counts[finding.ruleId] ?? 0) + 1;
  }
  return counts;
}

function runProcess(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function safePreview(text) {
  const normalized = (text ?? "").trim();
  if (normalized.length <= 400) {
    return normalized;
  }
  return `${normalized.slice(0, 400)}...`;
}

function printSummary(report, reportPath) {
  const repoOk = report.repoCount - report.operationalFailures;
  const expectation = report.expectationSummary;

  console.log(`Benchmark complete: ${repoOk}/${report.repoCount} repos ran without runtime errors.`);
  console.log(`Expectation checks: ${expectation.passed}/${expectation.total} passed.`);
  console.log(`Report: ${reportPath}`);
}

function createShortTempRoot() {
  const systemDrive = process.env.SystemDrive && process.env.SystemDrive.length > 0 ? process.env.SystemDrive : "C:";
  const base = path.join(systemDrive, "ad-bench");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, "run-"));
}

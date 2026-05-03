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
const qualityBudget = expectations.qualityBudget ?? {};
const qualitySummary = labelBenchmarkFindings(repoResults, expectations.expectations ?? [], qualityBudget);
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
  qualitySummary,
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

if (
  operationalFailures > 0 ||
  failedExpectations.length > 0 ||
  qualitySummary.criticalFPCount > 0 ||
  qualitySummary.falsePositiveErrorCount > 0 ||
  qualitySummary.budgetStatus?.ok === false
) {
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
    const matchedFindings = findings.filter((finding) => doesExpectationMatchFinding(expected, finding));
    const matched = matchedFindings.length > 0;
    const ok = expected.expectPresence ? matched : !matched;

    results.push({
      repoId: repoResult.id,
      command: expected.command,
      ruleId: expected.ruleId,
      expectedSeverity: expected.expectedSeverity,
      expectPresence: expected.expectPresence,
      expectedLabel: expected.expectedLabel,
      file: expected.file,
      line: expected.line,
      reference: expected.reference,
      reason: expected.reason,
      scriptName: expected.scriptName,
      targetName: expected.targetName,
      matchedFindingCount: matchedFindings.length,
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

function labelBenchmarkFindings(repoResults, expectedFindings, qualityBudget) {
  const labelableExpectations = expectedFindings.filter(
    (expected) =>
      ["TP", "FP", "Needs-Config", "Unclear"].includes(expected.expectedLabel) &&
      typeof expected.repoId === "string" &&
      typeof expected.command === "string" &&
      typeof expected.ruleId === "string" &&
      typeof expected.expectedSeverity === "string"
  );
  const expectedByKey = groupExpectationsByMatchKey(labelableExpectations);
  /** @type {Array<object>} */
  const labeledFindings = [];
  /** @type {Record<string, object>} */
  const rules = {};
  const labels = {
    TP: 0,
    FP: 0,
    "Needs-Config": 0,
    Unclear: 0
  };
  let totalFindingCount = 0;
  let matchedFindingCount = 0;
  let unmatchedFindingCount = 0;

  for (const repo of repoResults) {
    for (const command of ["lint", "verify"]) {
      const commandResult = repo[command];
      if (!Array.isArray(commandResult?.findings)) {
        continue;
      }

      commandResult.findings = commandResult.findings.map((finding) => {
        totalFindingCount += 1;
        const rule = ensureRuleSummary(rules, finding.ruleId);
        rule.total += 1;

        const matchKey = makeExpectationMatchKey(repo.id, command, finding.ruleId, finding.severity);
        const expected = findMatchingLabelExpectation(expectedByKey.get(matchKey) ?? [], finding);
        if (!expected) {
          const labeledFinding = {
            repoId: repo.id,
            command,
            ruleId: finding.ruleId,
            severity: finding.severity,
            label: "Unclear",
            critical: false,
            expectationNotes: "No reviewed benchmark label matched this finding."
          };

          labels.Unclear += 1;
          rule.labels.Unclear += 1;
          labeledFindings.push(labeledFinding);
          rule.unmatched += 1;
          unmatchedFindingCount += 1;
          return {
            ...finding,
            benchmarkLabel: "Unclear",
            benchmarkExpectation: {
              expectedLabel: "Unclear",
              critical: false,
              notes: "No reviewed benchmark label matched this finding."
            }
          };
        }

        matchedFindingCount += 1;
        labels[expected.expectedLabel] += 1;
        rule.labels[expected.expectedLabel] += 1;

        const labeledFinding = {
          repoId: repo.id,
          command,
          ruleId: finding.ruleId,
          severity: finding.severity,
          label: expected.expectedLabel,
          critical: expected.critical === true,
          expectationNotes: expected.notes
        };
        labeledFindings.push(labeledFinding);

        return {
          ...finding,
          benchmarkLabel: expected.expectedLabel,
          benchmarkExpectation: {
            expectPresence: expected.expectPresence,
            expectedLabel: expected.expectedLabel,
            critical: expected.critical === true,
            notes: expected.notes
          }
        };
      });
    }
  }

  const fpRepoCountsByRule = countFpReposByRule(labeledFindings);
  let criticalFPCount = 0;
  let falsePositiveErrorCount = 0;

  for (const labeledFinding of labeledFindings) {
    if (labeledFinding.label !== "FP") {
      continue;
    }

    const matchKey = makeExpectationMatchKey(
      labeledFinding.repoId,
      labeledFinding.command,
      labeledFinding.ruleId,
      labeledFinding.severity
    );
    const expected = expectedByKey.get(matchKey)?.find((candidate) => candidate.notes === labeledFinding.expectationNotes);
    const repeatedAcrossRepos = (fpRepoCountsByRule.get(labeledFinding.ruleId) ?? 0) > 1;
    const falsePositiveError = labeledFinding.severity === "error";
    const critical = labeledFinding.critical === true || expected?.critical === true || falsePositiveError || repeatedAcrossRepos;

    if (falsePositiveError) {
      falsePositiveErrorCount += 1;
    }
    if (critical) {
      criticalFPCount += 1;
      labeledFinding.critical = true;
      ensureRuleSummary(rules, labeledFinding.ruleId).criticalFP += 1;
    }
  }

  return {
    reviewedExpectationCount: labelableExpectations.length,
    totalFindingCount,
    matchedFindingCount,
    unmatchedFindingCount,
    labels,
    falsePositiveErrorCount,
    criticalFPCount,
    rules,
    labeledFindings,
    budgetStatus: evaluateQualityBudget(labels, {
      criticalFPCount,
      falsePositiveErrorCount,
      unmatchedFindingCount
    }, qualityBudget)
  };
}

function groupExpectationsByMatchKey(expectationList) {
  /** @type {Map<string, Array<object>>} */
  const grouped = new Map();

  for (const expected of expectationList) {
    const key = makeExpectationMatchKey(expected.repoId, expected.command, expected.ruleId, expected.expectedSeverity);
    const list = grouped.get(key) ?? [];
    list.push(expected);
    grouped.set(key, list);
  }

  return grouped;
}

function findMatchingLabelExpectation(candidates, finding) {
  const matching = candidates.filter((candidate) => doesExpectationMatchFinding(candidate, finding));
  if (matching.length === 0) {
    return undefined;
  }

  return matching.sort((left, right) => getExpectationSpecificity(right) - getExpectationSpecificity(left))[0];
}

function doesExpectationMatchFinding(expected, finding) {
  if (finding.ruleId !== expected.ruleId || finding.severity !== expected.expectedSeverity) {
    return false;
  }
  if (expected.file && expected.file !== finding.file) {
    return false;
  }
  if (Number.isInteger(expected.line) && expected.line !== finding.line) {
    return false;
  }
  if (expected.reference && expected.reference !== finding.details?.reference) {
    return false;
  }
  if (expected.reason && expected.reason !== finding.details?.reason) {
    return false;
  }
  if (expected.scriptName && expected.scriptName !== finding.details?.scriptName) {
    return false;
  }
  if (expected.targetName && expected.targetName !== finding.details?.targetName) {
    return false;
  }

  return true;
}

function getExpectationSpecificity(expected) {
  return ["file", "line", "reference", "reason", "scriptName", "targetName"].filter((field) => expected[field] !== undefined).length;
}

function evaluateQualityBudget(labels, counts, qualityBudget) {
  const maxUnclear = qualityBudget.maxUnclearFindingCount;
  const ok = !Number.isInteger(maxUnclear) || labels.Unclear <= maxUnclear;
  const warnings = [];

  if (Number.isInteger(maxUnclear) && labels.Unclear > maxUnclear) {
    warnings.push(`Unclear finding count ${labels.Unclear} exceeds budget ${maxUnclear}.`);
  }

  return {
    ok,
    maxUnclearFindingCount: Number.isInteger(maxUnclear) ? maxUnclear : null,
    unclearFindingCount: labels.Unclear,
    criticalFPCount: counts.criticalFPCount,
    falsePositiveErrorCount: counts.falsePositiveErrorCount,
    unmatchedFindingCount: counts.unmatchedFindingCount,
    warnings
  };
}

function makeExpectationMatchKey(repoId, command, ruleId, severity) {
  return `${repoId}\0${command}\0${ruleId}\0${severity}`;
}

function ensureRuleSummary(rules, ruleId) {
  if (!rules[ruleId]) {
    rules[ruleId] = {
      total: 0,
      labels: {
        TP: 0,
        FP: 0,
        "Needs-Config": 0,
        Unclear: 0
      },
      unmatched: 0,
      criticalFP: 0
    };
  }

  return rules[ruleId];
}

function countFpReposByRule(labeledFindings) {
  /** @type {Map<string, Set<string>>} */
  const reposByRule = new Map();
  for (const labeledFinding of labeledFindings) {
    if (labeledFinding.label !== "FP") {
      continue;
    }

    const repos = reposByRule.get(labeledFinding.ruleId) ?? new Set();
    repos.add(labeledFinding.repoId);
    reposByRule.set(labeledFinding.ruleId, repos);
  }

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const [ruleId, repos] of reposByRule.entries()) {
    counts.set(ruleId, repos.size);
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
  const quality = report.qualitySummary;

  console.log(`Benchmark complete: ${repoOk}/${report.repoCount} repos ran without runtime errors.`);
  console.log(`Expectation checks: ${expectation.passed}/${expectation.total} passed.`);
  console.log(
    `Finding labels: ${quality.labels.TP} TP, ${quality.labels.FP} FP, ` +
      `${quality.labels["Needs-Config"]} Needs-Config, ${quality.labels.Unclear} Unclear.`
  );
  console.log(`Critical FP: ${quality.criticalFPCount}; false-positive errors: ${quality.falsePositiveErrorCount}.`);
  if (quality.budgetStatus?.maxUnclearFindingCount !== null) {
    console.log(
      `Unclear budget: ${quality.budgetStatus.unclearFindingCount}/${quality.budgetStatus.maxUnclearFindingCount}.`
    );
  }
  for (const warning of quality.budgetStatus?.warnings ?? []) {
    console.warn(`Benchmark quality budget: ${warning}`);
  }
  console.log(`Report: ${reportPath}`);
}

function createShortTempRoot() {
  const systemDrive = process.env.SystemDrive && process.env.SystemDrive.length > 0 ? process.env.SystemDrive : "C:";
  const base = path.join(systemDrive, "ad-bench");
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, "run-"));
}

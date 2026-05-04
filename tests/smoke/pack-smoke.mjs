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

const maxPackedBytes = 1_000_000;
const allowedTopLevelFiles = new Set(["AGENTS.md", "CHANGELOG.md", "LICENSE", "README.md", "package.json"]);
const allowedPrefixes = ["dist/", "docs/", "examples/"];
const blockedPackedPaths = ["agents/", "notes/", "PROJECT_MEMORY_REFERENCE.md", "benchmarks/out/"];
const textFileExtensions = new Set([
  "",
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yaml",
  ".yml"
]);

try {
  const packResult = run(process.execPath, [npmCliPath, "pack", "--json"], projectRoot);
  const packOutput = parsePackOutput(packResult.stdout);
  const packedPackage = packOutput[0];
  const tarballName = packedPackage?.filename;
  assert.equal(typeof tarballName, "string");
  tarballPath = path.join(projectRoot, tarballName);
  validatePackedPackage(packedPackage);

  run(process.execPath, [npmCliPath, "init", "-y"], tempRoot);
  run(process.execPath, [npmCliPath, "install", tarballPath, "--ignore-scripts"], tempRoot);

  const installedCliPath = resolveInstalledCliPath(tempRoot);
  const helpResult = run(process.execPath, [installedCliPath, "--help"], tempRoot);
  assert.match(helpResult.stdout, /Usage: agents-doctor/);

  const lintResult = run(
    process.execPath,
    [installedCliPath, "lint", "--json", path.join(projectRoot, "tests", "fixtures", "short-agents-file")],
    tempRoot
  );
  const lintReport = parseCliReport(lintResult.stdout, "lint");
  assert.equal(lintReport.exitCode, 0);
  assert.deepEqual(lintReport.findings, []);

  const verifyJsonResult = run(
    process.execPath,
    [installedCliPath, "verify", "--json", path.join(projectRoot, "tests", "fixtures", "short-agents-file")],
    tempRoot
  );
  const verifyReport = parseCliReport(verifyJsonResult.stdout, "verify");
  assert.equal(verifyReport.exitCode, 0);
  assert.equal(
    verifyReport.findings.some((finding) => finding.ruleId === "coverage.discovery_summary"),
    true
  );

  const explainJsonResult = run(
    process.execPath,
    [
      installedCliPath,
      "explain",
      ".",
      "--json",
      path.join(projectRoot, "tests", "fixtures", "short-agents-file")
    ],
    tempRoot
  );
  const explainReport = parseCliReport(explainJsonResult.stdout, "explain");
  assert.equal(explainReport.exitCode, 0);
  assert.equal(explainReport.findings[0]?.ruleId, "inheritance.applied_chain");

  const githubResult = run(
    process.execPath,
    [installedCliPath, "verify", "--format", "github", path.join(projectRoot, "tests", "fixtures", "short-agents-file")],
    tempRoot
  );
  assert.match(githubResult.stdout, /::notice file=AGENTS\.md,line=1,title=coverage\.discovery_summary::/);
  assert.match(githubResult.stdout, /agents-doctor verify:/);

  const sarifResult = run(
    process.execPath,
    [installedCliPath, "verify", "--format", "sarif", path.join(projectRoot, "tests", "fixtures", "short-agents-file")],
    tempRoot
  );
  const sarifReport = JSON.parse(sarifResult.stdout);
  assert.equal(sarifReport.version, "2.1.0");
  assert.equal(sarifReport.runs[0]?.tool?.driver?.name, "agents-doctor");
  assert.equal(sarifReport.runs[0]?.results[0]?.ruleId, "coverage.discovery_summary");
} finally {
  if (tarballPath) {
    fs.rmSync(tarballPath, { force: true });
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function parseCliReport(stdout, command) {
  const report = JSON.parse(stdout);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.tool, "agents-doctor");
  assert.equal(report.command, command);
  return report;
}

function parsePackOutput(stdout) {
  let output;
  try {
    output = JSON.parse(stdout);
  } catch (error) {
    assert.fail(`npm pack --json returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  assert.equal(Array.isArray(output), true, "npm pack --json output must be an array");
  assert.equal(output.length, 1, "npm pack --json must describe exactly one packed package");
  return output;
}

function validatePackedPackage(packedPackage) {
  assert.equal(typeof packedPackage.filename, "string", "Packed package filename must be visible in npm pack output");
  const packageSizeBytes = packedPackage.filesize ?? packedPackage.size;
  assert.equal(typeof packageSizeBytes, "number", "Packed package size must be visible in npm pack output");
  assert.ok(
    packageSizeBytes > 0 && packageSizeBytes <= maxPackedBytes,
    `Packed package size ${formatBytes(packageSizeBytes)} must be between 1 byte and ${formatBytes(maxPackedBytes)}`
  );

  const files = packedPackage.files;
  assert.equal(Array.isArray(files), true, "npm pack --json output must include the packed file list");
  assert.ok(files.length > 0, `Packed package must include files; size was ${formatBytes(packageSizeBytes)}`);

  const packedPaths = files.map((file) => {
    assert.equal(typeof file.path, "string", "Every packed file entry must include a relative path");
    return normalizePackPath(file.path);
  });

  assertRequiredPackedFiles(packedPaths, packageSizeBytes);

  for (const packedPath of packedPaths) {
    assertAllowedPublicPath(packedPath, packageSizeBytes);
    assertNoBlockedPath(packedPath, packageSizeBytes);
    assertNoLocalAbsolutePath(packedPath, `packed path ${packedPath}`, packageSizeBytes);
    scanPackedTextFile(packedPath, packageSizeBytes);
  }

  console.log(
    `Packed agents-doctor tarball: ${packedPackage.filename}; ` +
      `${files.length} files; ${formatBytes(packageSizeBytes)}.`
  );
}

function assertRequiredPackedFiles(packedPaths, packageSizeBytes) {
  for (const requiredPath of ["package.json", "README.md", "LICENSE", "AGENTS.md", "CHANGELOG.md", "dist/cli.js"]) {
    assert.ok(
      packedPaths.includes(requiredPath),
      `Packed package missing ${requiredPath}; package size was ${formatBytes(packageSizeBytes)}`
    );
  }
}

function assertAllowedPublicPath(packedPath, packageSizeBytes) {
  const allowed =
    allowedTopLevelFiles.has(packedPath) || allowedPrefixes.some((prefix) => packedPath.startsWith(prefix));

  assert.ok(
    allowed,
    `Packed file ${packedPath} is outside the public package allowlist; package size was ${formatBytes(packageSizeBytes)}`
  );
}

function assertNoBlockedPath(packedPath, packageSizeBytes) {
  const blocked = blockedPackedPaths.find((blockedPath) => {
    if (blockedPath.endsWith("/")) {
      return packedPath === blockedPath.slice(0, -1) || packedPath.startsWith(blockedPath);
    }

    return packedPath === blockedPath;
  });

  assert.equal(
    blocked,
    undefined,
    `Packed file ${packedPath} matched blocked private/workspace path ${blocked}; package size was ${formatBytes(packageSizeBytes)}`
  );
}

function scanPackedTextFile(packedPath, packageSizeBytes) {
  const sourcePath = path.join(projectRoot, ...packedPath.split("/"));
  assert.ok(
    fs.existsSync(sourcePath),
    `Packed file ${packedPath} must exist in the project tree for policy scanning; package size was ${formatBytes(packageSizeBytes)}`
  );

  if (!isTextFile(packedPath)) {
    return;
  }

  const content = fs.readFileSync(sourcePath, "utf8");
  assertNoLocalAbsolutePath(content, `contents of ${packedPath}`, packageSizeBytes);
  assertNoSecretLookingString(content, packedPath, packageSizeBytes);
}

function assertNoLocalAbsolutePath(value, subject, packageSizeBytes) {
  const normalizedProjectRoot = normalizeSeparators(projectRoot);
  const normalizedHome = normalizeSeparators(os.homedir());
  const normalizedValue = normalizeSeparators(value);
  const privateRoots = [normalizedProjectRoot, normalizedHome].filter(Boolean);
  const privateRoot = privateRoots.find((root) => normalizedValue.includes(root));

  assert.equal(
    privateRoot,
    undefined,
    `${subject} contains local absolute path ${privateRoot}; package size was ${formatBytes(packageSizeBytes)}`
  );

  const localAbsolutePatterns = [
    /\b[A-Za-z]:\/Users\/[^/\s"'`<>]+/u,
    /\b[A-Za-z]:\/Temp\/[^/\s"'`<>]+/u,
    /\/Users\/[^/\s"'`<>]+/u,
    /\/home\/[^/\s"'`<>]+/u,
    /\/tmp\/[^/\s"'`<>]+/u
  ];
  const matchedPattern = localAbsolutePatterns.find((pattern) => pattern.test(normalizedValue));

  assert.equal(
    matchedPattern,
    undefined,
    `${subject} contains a local absolute path; package size was ${formatBytes(packageSizeBytes)}`
  );
}

function assertNoSecretLookingString(content, packedPath, packageSizeBytes) {
  const secretPatterns = [
    /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u,
    /\bgithub_pat_[A-Za-z0-9_]{22,}/u,
    /\bgh[opsu]_[A-Za-z0-9]{36,}/u,
    /\bglpat-[A-Za-z0-9_-]{20,}/u,
    /\bnpm_[A-Za-z0-9]{36,}/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}/u,
    /\bsk-[A-Za-z0-9]{20,}/u,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
    /\b(?:api[_-]?key|auth[_-]?token|access[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/iu
  ];
  const matchedPattern = secretPatterns.find((pattern) => pattern.test(content));

  assert.equal(
    matchedPattern,
    undefined,
    `Packed public text file ${packedPath} contains a token/secret-looking string; package size was ${formatBytes(packageSizeBytes)}`
  );
}

function isTextFile(packedPath) {
  return textFileExtensions.has(path.extname(packedPath).toLowerCase());
}

function normalizePackPath(packedPath) {
  assert.equal(path.isAbsolute(packedPath), false, `Packed file path must be relative: ${packedPath}`);
  assert.equal(packedPath.includes("\\"), false, `Packed file path must use POSIX separators: ${packedPath}`);
  assert.equal(packedPath.includes(".."), false, `Packed file path must not contain parent traversal: ${packedPath}`);
  return packedPath.replace(/^package\//u, "");
}

function normalizeSeparators(value) {
  return value.replaceAll("\\", "/");
}

function formatBytes(bytes) {
  return `${bytes} bytes`;
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

function resolveInstalledCliPath(root) {
  const cliPath = path.join(root, "node_modules", "agents-doctor", "dist", "cli.js");

  if (!fs.existsSync(cliPath)) {
    throw new Error("Installed agents-doctor CLI not found in node_modules/agents-doctor/dist/cli.js");
  }

  return cliPath;
}

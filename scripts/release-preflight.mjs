import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const skipRegistry = args.has("--skip-registry");

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));
const changelog = fs.readFileSync(path.join(projectRoot, "CHANGELOG.md"), "utf8");

const packageName = packageJson.name;
const packageVersion = packageJson.version;
assertReleaseString(packageName, "package name");
assertReleaseString(packageVersion, "package version");

const expectedTag = `v${packageVersion}`;
const releaseTag = resolveReleaseTag(expectedTag);
assert.equal(
  releaseTag,
  expectedTag,
  `Release tag ${releaseTag} must match package.json version ${packageVersion}; expected ${expectedTag}`
);

assert.equal(
  packageLock.name,
  packageName,
  `package-lock.json name ${packageLock.name} must match package.json name ${packageName}`
);
assert.equal(
  packageLock.version,
  packageVersion,
  `package-lock.json version ${packageLock.version} must match package.json version ${packageVersion}`
);
assert.equal(
  packageLock.packages?.[""]?.version,
  packageVersion,
  `package-lock.json root package version ${packageLock.packages?.[""]?.version} must match package.json version ${packageVersion}`
);

const changelogEntryPattern = new RegExp(
  `^## ${escapeRegExp(packageVersion)} - (?!Unreleased$)\\d{4}-\\d{2}-\\d{2}$`,
  "mu"
);
assert.match(
  changelog,
  changelogEntryPattern,
  `CHANGELOG.md must include a dated release entry for ${packageVersion}`
);

if (skipRegistry) {
  console.log(`Release preflight passed for ${packageName}@${packageVersion} (${releaseTag}); registry check skipped.`);
} else {
  assertVersionIsUnpublished(packageName, packageVersion);
  console.log(`Release preflight passed for ${packageName}@${packageVersion} (${releaseTag}); npm version is unpublished.`);
}

function assertReleaseString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.notEqual(value.trim(), "", `${label} must not be empty`);
}

function resolveReleaseTag(expectedTag) {
  if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }

  const tags = run("git", ["tag", "--points-at", "HEAD"], projectRoot).stdout
    .split(/\r?\n/u)
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (tags.includes(expectedTag)) {
    return expectedTag;
  }

  assert.fail(
    `Release preflight must run from tag ${expectedTag}; found ${tags.length > 0 ? tags.join(", ") : "no tag"} on HEAD`
  );
}

function assertVersionIsUnpublished(packageName, packageVersion) {
  const npmInvocation = resolveNpmInvocation();
  const result = spawnSync(npmInvocation.command, [...npmInvocation.args, "view", `${packageName}@${packageVersion}`, "version", "--json"], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status === 0) {
    const publishedVersion = parseJsonValue(result.stdout);
    assert.notEqual(
      publishedVersion,
      packageVersion,
      `${packageName}@${packageVersion} already exists on npm; refusing to publish over an existing version`
    );
    return;
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (/\bE404\b|404 Not Found|No match found/u.test(combinedOutput)) {
    return;
  }

  assert.fail(
    `Unable to verify npm registry state for ${packageName}@${packageVersion}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
}

function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath]
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: []
  };
}

function parseJsonValue(value) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  return JSON.parse(trimmed);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

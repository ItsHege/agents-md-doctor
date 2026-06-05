import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeFiles = ["doctor-worker.mjs", "main.mjs", "preload.cjs", "renderer.js"];
const blockedPatterns = [
  /\bnode:child_process\b/u,
  /\bchild_process\b/u,
  /\bexecSync\b/u,
  /\bexec\s*\(/u,
  /\bspawn\s*\(/u,
  /\bshell\s*:\s*true\b/u,
  /\bnpx\b/u,
  /\bpnpm\b/u,
  /\byarn\b/u
];

for (const relativePath of runtimeFiles) {
  const absolutePath = path.join(prototypeRoot, relativePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const matchedPattern = blockedPatterns.find((pattern) => pattern.test(content));

  assert.equal(
    matchedPattern,
    undefined,
    `Runtime file ${relativePath} matched blocked command-execution pattern ${matchedPattern}.`
  );
}

console.log("Desktop UI runtime safety scan passed.");

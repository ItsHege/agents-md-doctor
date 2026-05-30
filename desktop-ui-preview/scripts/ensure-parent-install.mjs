import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot = path.resolve(desktopRoot, "..");
const typescriptPackagePath = path.join(projectRoot, "node_modules", "typescript", "package.json");

if (fs.existsSync(typescriptPackagePath)) {
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : "npm";
const args = npmExecPath ? [npmExecPath, "--prefix", projectRoot, "install"] : ["--prefix", projectRoot, "install"];
const result = spawnSync(command, args, {
  cwd: desktopRoot,
  encoding: "utf8",
  shell: npmExecPath ? false : process.platform === "win32",
  stdio: "inherit"
});

assert.equal(
  result.status,
  0,
  `Failed to install parent AGENTS.md Doctor dependencies with ${command} ${args.join(" ")}.`
);

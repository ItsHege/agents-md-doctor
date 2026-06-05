import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

const desktopRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot = path.resolve(desktopRoot, "..");
const stagingRoot = path.join(desktopRoot, "build-staging", "win32-x64");
const releaseRoot = path.join(desktopRoot, "release");
const rootLockfilePath = path.join(projectRoot, "package-lock.json");
const parentPackageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const appName = "AGENTS.md Doctor";
const zipBaseName = `AGENTS.md-Doctor-win32-x64-${parentPackageJson.version}`;
const appOutDir = path.join(releaseRoot, `${appName}-win32-x64`);
const zipPath = path.join(releaseRoot, `${zipBaseName}.zip`);

assert.equal(typeof parentPackageJson.version, "string", "Parent package.json version is required.");
assert.equal(typeof parentPackageJson.dependencies, "object", "Parent package.json dependencies are required.");
assert.ok(fs.existsSync(path.join(projectRoot, "dist", "api.js")), "Run npm --prefix .. run build before packaging.");
assert.ok(fs.existsSync(rootLockfilePath), "Root package-lock.json is required for locked desktop packaging.");

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.rmSync(releaseRoot, { recursive: true, force: true });
fs.mkdirSync(stagingRoot, { recursive: true });
fs.mkdirSync(releaseRoot, { recursive: true });

copyRequiredAppFiles();
writeStagingPackageJson();
installProductionDependencies();
await packageElectronApp();
zipPackagedApp();
assertPackagedOutput();

console.log(`Desktop UI Windows package: ${zipPath}`);

function copyRequiredAppFiles() {
  for (const file of ["doctor-worker.mjs", "index.html", "main.mjs", "preload.cjs", "renderer.js", "styles.css"]) {
    fs.copyFileSync(path.join(desktopRoot, file), path.join(stagingRoot, file));
  }

  fs.cpSync(path.join(desktopRoot, "assets"), path.join(stagingRoot, "assets"), { recursive: true });
  fs.cpSync(path.join(projectRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true });
}

function writeStagingPackageJson() {
  const packageJson = {
    name: "agents-doctor-desktop",
    version: parentPackageJson.version,
    private: true,
    productName: appName,
    description: "Desktop UI for running AGENTS.md Doctor checks without a terminal.",
    type: "module",
    main: "main.mjs",
    dependencies: parentPackageJson.dependencies
  };

  fs.writeFileSync(path.join(stagingRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.copyFileSync(rootLockfilePath, path.join(stagingRoot, "package-lock.json"));
}

function installProductionDependencies() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "npm";
  const args = npmExecPath
    ? [npmExecPath, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]
    : ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"];
  const result = spawnSync(command, args, {
    cwd: stagingRoot,
    encoding: "utf8",
    shell: npmExecPath ? false : process.platform === "win32"
  });

  assert.equal(
    result.status,
    0,
    `Failed to install desktop production dependencies.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
  );
}

async function packageElectronApp() {
  await packager({
    dir: stagingRoot,
    out: releaseRoot,
    overwrite: true,
    platform: "win32",
    arch: "x64",
    name: appName,
    executableName: appName,
    appVersion: parentPackageJson.version,
    icon: path.join(stagingRoot, "assets", "agents-doctor.ico"),
    asar: false,
    prune: false,
    quiet: true
  });
}

function zipPackagedApp() {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Compress-Archive -Path ${JSON.stringify(path.join(appOutDir, "*"))} -DestinationPath ${JSON.stringify(zipPath)} -Force`
      ],
      {
        cwd: releaseRoot,
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, `Compress-Archive failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    return;
  }

  const result = spawnSync("zip", ["-qr", zipPath, path.basename(appOutDir)], {
    cwd: releaseRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `zip failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function assertPackagedOutput() {
  const executablePath = path.join(appOutDir, `${appName}.exe`);
  assert.ok(fs.existsSync(executablePath), `Packaged executable missing: ${executablePath}`);
  assert.ok(fs.existsSync(zipPath), `Package zip missing: ${zipPath}`);
  assert.ok(fs.statSync(zipPath).size > 0, `Package zip is empty: ${zipPath}`);
  assert.ok(fs.existsSync(path.join(appOutDir, "resources", "app", "dist", "api.js")), "Packaged app missing dist/api.js.");
  assert.ok(
    fs.existsSync(path.join(appOutDir, "resources", "app", "doctor-worker.mjs")),
    "Packaged app missing doctor-worker.mjs."
  );
}

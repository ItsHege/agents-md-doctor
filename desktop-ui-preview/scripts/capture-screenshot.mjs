import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const previewRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = path.resolve(previewRoot, "..");
const defaultOutput = path.resolve(workspaceRoot, "docs", "assets", "desktop-ui-warning-report.png");
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultOutput;
const electronArgs = process.platform === "linux" ? ["--no-sandbox", previewRoot] : [previewRoot];

const result = spawnSync(electronPath, electronArgs, {
  cwd: workspaceRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    AGENTS_DOCTOR_UI_CAPTURE_SCREENSHOT: "1",
    AGENTS_DOCTOR_UI_CAPTURE_OUT: outputPath
  },
  stdio: "inherit",
  timeout: 30000
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(`Desktop UI screenshot capture failed with exit ${result.status}.`);
}

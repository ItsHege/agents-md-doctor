import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const doctorDistRoot = resolveDoctorDistRoot();
const { runDoctorReport } = await import(pathToFileURL(path.join(doctorDistRoot, "api.js")).href);
const { loadConfig } = await import(pathToFileURL(path.join(doctorDistRoot, "config", "index.js")).href);
const { findAgentsFiles } = await import(pathToFileURL(path.join(doctorDistRoot, "discovery", "index.js")).href);
const isSmokeMode = process.env.AGENTS_DOCTOR_UI_SMOKE === "1";
const appIconPath = path.join(__dirname, "assets", "agents-doctor.ico");

let mainWindow;

app.setName("AGENTS.md Doctor");

if (process.platform === "win32") {
  app.setAppUserModelId("dev.agents-doctor.desktop-prototype");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  mainWindow = createMainWindow();

  if (isSmokeMode) {
    runSmokeWhenReady(mainWindow);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("project:select", async () => {
  if (isSmokeMode && process.env.AGENTS_DOCTOR_UI_SMOKE_ROOT) {
    return {
      canceled: false,
      path: process.env.AGENTS_DOCTOR_UI_SMOKE_ROOT
    };
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select a project folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return {
    canceled: false,
    path: result.filePaths[0]
  };
});

ipcMain.handle("doctor:run", async (_event, payload) => {
  return runFromPayload(payload);
});

ipcMain.handle("clipboard:writeText", async (_event, text) => {
  if (typeof text !== "string") {
    return { ok: false, error: "Clipboard text must be a string." };
  }

  clipboard.writeText(text);
  return { ok: true };
});

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 640,
    title: "AGENTS.md Doctor",
    icon: appIconPath,
    autoHideMenuBar: true,
    backgroundColor: "#f6f7f2",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  window.loadFile(path.join(__dirname, "index.html"));
  return window;
}

function runSmokeWhenReady(window) {
  window.webContents.once("did-finish-load", async () => {
    try {
      const root = process.env.AGENTS_DOCTOR_UI_SMOKE_ROOT;
      const cleanRoot = process.env.AGENTS_DOCTOR_UI_SMOKE_CLEAN_ROOT;
      const markerPath = process.env.AGENTS_DOCTOR_UI_SMOKE_MARKER;

      if (!root || !cleanRoot || !markerPath) {
        throw new Error("AGENTS_DOCTOR_UI_SMOKE_ROOT, AGENTS_DOCTOR_UI_SMOKE_CLEAN_ROOT, and AGENTS_DOCTOR_UI_SMOKE_MARKER are required.");
      }

      const smokeResult = await window.webContents.executeJavaScript(
        `
          (async () => {
            const root = ${JSON.stringify(root)};
            const cleanRoot = ${JSON.stringify(cleanRoot)};
            const invalidRoot = ${JSON.stringify(path.join(root, "missing-project"))};

            const waitFor = async (label, predicate) => {
              const started = Date.now();

              while (Date.now() - started < 5000) {
                if (await predicate()) {
                  return;
                }

                await new Promise((resolve) => setTimeout(resolve, 25));
              }

              throw new Error("Timed out waiting for renderer state: " + label);
            };

            document.querySelector("#select-project").click();
            await waitFor("folder selection", () => document.querySelector("#project-path")?.value === root);

            document.querySelector("#run-check").click();
            await waitFor("verify title", () => (document.querySelector("#report-title")?.textContent ?? "").includes("Verify"));

            const selectedPath = document.querySelector("#project-path")?.value ?? "";
            const successTitle = document.querySelector("#report-title")?.textContent ?? "";
            const successRows = Array.from(document.querySelectorAll("#findings-body tr")).map((row) => row.textContent ?? "");
            const ledgerCommand = document.querySelector("#ledger-command")?.textContent ?? "";
            const ledgerScanned = document.querySelector("#ledger-scanned")?.textContent ?? "";
            const ledgerFindings = document.querySelector("#ledger-findings")?.textContent ?? "";
            const ledgerFiles = document.querySelector("#ledger-files")?.textContent ?? "";
            const ledgerPipeline = Array.from(document.querySelectorAll("#ledger-pipeline .check-chip")).map((chip) => chip.textContent ?? "");

            const result = await window.agentsDoctor.runCheck({
              command: "verify",
              root,
              targetPath: ".",
              strict: false
            });

            if (!result.ok) {
              throw new Error(result.error);
            }

            const cleanLint = await window.agentsDoctor.runCheck({
              command: "lint",
              root: cleanRoot,
              targetPath: ".",
              strict: false
            });

            if (!cleanLint.ok) {
              throw new Error(cleanLint.error);
            }

            state.report = cleanLint.report;
            state.runMeta = cleanLint.meta ?? null;
            state.findings = cleanLint.report.findings;
            renderReport(cleanLint.report);

            const cleanTitle = document.querySelector("#report-title")?.textContent ?? "";
            const cleanIssueTitle = document.querySelector("#issue-title")?.textContent ?? "";
            const cleanScanned = document.querySelector("#ledger-scanned")?.textContent ?? "";
            const cleanRows = Array.from(document.querySelectorAll("#findings-body tr")).map((row) => row.textContent ?? "");
            document.querySelector("#copy-json").click();
            await waitFor("copy json", () => {
              if (window.__agentsDoctorCopyError) {
                throw new Error("Copy JSON failed: " + window.__agentsDoctorCopyError);
              }

              return (window.__agentsDoctorLastCopiedJson ?? "").includes('"command": "lint"');
            });

            const copiedJson = window.__agentsDoctorLastCopiedJson ?? "";

            const explainResult = await window.agentsDoctor.runCheck({
              command: "explain",
              root: cleanRoot,
              targetPath: "packages/app/README.md",
              strict: false
            });

            if (!explainResult.ok) {
              throw new Error(explainResult.error);
            }

            state.report = explainResult.report;
            state.runMeta = explainResult.meta ?? null;
            state.findings = explainResult.report.findings;
            renderReport(explainResult.report);

            const explainTitle = document.querySelector("#report-title")?.textContent ?? "";
            const explainTarget = document.querySelector("#explain-target")?.textContent ?? "";
            const explainChain = Array.from(document.querySelectorAll("#explain-chain li")).map((item) => item.textContent ?? "");
            const explainToolEvidence = Array.from(document.querySelectorAll("#explain-tool-evidence .tool-evidence-item")).map(
              (item) => item.textContent ?? ""
            );
            const explainVisible = !document.querySelector("#explain-view")?.classList.contains("hidden");
            const findingsPanelHidden = document.querySelector("#findings-panel")?.classList.contains("hidden");
            const severityFiltersHidden = document.querySelector("#severity-filters")?.classList.contains("hidden");
            const copyJsonButton = document.querySelector("#copy-json");
            if (!copyJsonButton) {
              throw new Error("Copy JSON button was not rendered.");
            }
            const copyJsonVisible = copyJsonButton
              ? (copyJsonButton.checkVisibility?.() ?? getComputedStyle(copyJsonButton).display !== "none")
              : false;
            copyJsonButton.click();
            await waitFor("copy explain json", () => {
              if (window.__agentsDoctorCopyError) {
                throw new Error("Copy explain JSON failed: " + window.__agentsDoctorCopyError);
              }

              return (window.__agentsDoctorLastCopiedJson ?? "").includes('"command": "explain"');
            });

            const copiedExplainJson = window.__agentsDoctorLastCopiedJson ?? "";

            const invalidResult = await window.agentsDoctor.runCheck({
              command: "verify",
              root: invalidRoot,
              targetPath: ".",
              strict: false
            });

            if (invalidResult.ok) {
              throw new Error("Expected invalid root to fail.");
            }

            renderError(invalidResult.error);

            return {
              command: result.report.command,
              findingCount: result.report.findings.length,
              selectedPath,
              title: successTitle,
              rows: successRows,
              ledgerCommand,
              ledgerScanned,
              ledgerFindings,
              ledgerFiles,
              ledgerPipeline,
              cleanTitle,
              cleanIssueTitle,
              cleanScanned,
              cleanRows,
              copiedJson,
              explainTitle,
              explainTarget,
              explainChain,
              explainToolEvidence,
              explainVisible,
              findingsPanelHidden,
              severityFiltersHidden,
              copyJsonVisible,
              copiedExplainJson,
              invalidExitCode: invalidResult.exitCode,
              errorTitle: document.querySelector("#report-title")?.textContent ?? "",
              errorMessage: document.querySelector("#error-message")?.textContent ?? "",
              errorVisible: !document.querySelector("#error-state")?.classList.contains("hidden")
            };
          })();
        `,
        true
      );

      console.log(JSON.stringify(smokeResult));
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(1);
    }
  });
}

function runFromPayload(payload) {
  if (!isPlainObject(payload)) {
    return {
      ok: false,
      exitCode: 2,
      error: "Invalid run request."
    };
  }

  const command = payload.command;
  const root = typeof payload.root === "string" ? payload.root : undefined;
  const targetPath = typeof payload.targetPath === "string" ? payload.targetPath : undefined;
  const strict = payload.strict === true;

  if (command !== "lint" && command !== "verify" && command !== "explain") {
    return {
      ok: false,
      exitCode: 2,
      error: "Choose lint, verify, or explain."
    };
  }

  if (!root) {
    return {
      ok: false,
      exitCode: 2,
      error: "Select a project folder first."
    };
  }

  if (command === "explain") {
    return withUiMetadata(runDoctorReport({
      command,
      root,
      targetPath: targetPath && targetPath.trim().length > 0 ? targetPath : "."
    }));
  }

  return withUiMetadata(runDoctorReport({
    command,
    root,
    strict
  }));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveDoctorDistRoot() {
  const packagedDistRoot = path.join(__dirname, "dist");
  const sourceCheckoutDistRoot = path.resolve(__dirname, "..", "dist");

  if (fs.existsSync(path.join(packagedDistRoot, "api.js"))) {
    return packagedDistRoot;
  }

  return sourceCheckoutDistRoot;
}

function withUiMetadata(result) {
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    meta: buildUiMetadata(result.report)
  };
}

function buildUiMetadata(report) {
  const root = report.root;

  if (!root || report.command === "explain") {
    return {
      scannedFiles: []
    };
  }

  try {
    const config = loadConfig({ root });
    return {
      scannedFiles: findAgentsFiles(root, { ignore: config.ignore }).map((file) => file.relativePath)
    };
  } catch {
    return {
      scannedFiles: []
    };
  }
}

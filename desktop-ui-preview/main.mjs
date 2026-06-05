import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const doctorDistRoot = resolveDoctorDistRoot();
const isSmokeMode = process.env.AGENTS_DOCTOR_UI_SMOKE === "1";
const isCaptureMode = process.env.AGENTS_DOCTOR_UI_CAPTURE_SCREENSHOT === "1";
const appIconPath = path.join(__dirname, "assets", "agents-doctor.ico");
const configFileName = ".agents-doctor.json";
const toolProfiles = new Set(["auto", "codex", "claude-code", "cursor", "gemini-cli", "github-copilot", "windsurf", "cline"]);

let mainWindow;
let preferences = {};

app.setName("AGENTS.md Doctor");

if (process.platform === "win32") {
  app.setAppUserModelId("dev.agents-doctor.desktop-prototype");
}

app.whenReady().then(() => {
  preferences = loadPreferences();
  mainWindow = createMainWindow();
  Menu.setApplicationMenu(buildApplicationMenu());

  if (isSmokeMode) {
    runSmokeWhenReady(mainWindow);
    return;
  }

  if (isCaptureMode) {
    runCaptureWhenReady(mainWindow);
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

ipcMain.handle("project:validate", async (_event, folderPath) => {
  if (typeof folderPath !== "string" || folderPath.trim() === "") {
    return { ok: false, error: "Project folder is required." };
  }

  try {
    const stats = fs.statSync(path.resolve(folderPath));
    if (!stats.isDirectory()) {
      return { ok: false, error: "Project path must be a folder." };
    }
    return { ok: true, path: path.resolve(folderPath) };
  } catch {
    return { ok: false, error: "Project folder does not exist." };
  }
});

ipcMain.handle("doctor:run", async (_event, payload) => {
  return runPayloadInWorker(payload);
});

ipcMain.handle("clipboard:writeText", async (_event, text) => {
  if (typeof text !== "string") {
    return { ok: false, error: "Clipboard text must be a string." };
  }

  clipboard.writeText(text);
  return { ok: true };
});

ipcMain.handle("preferences:load", async () => {
  return preferences;
});

ipcMain.handle("preferences:save", async (_event, payload) => {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Preferences payload must be an object." };
  }

  preferences = sanitizePreferences({
    ...preferences,
    ...payload
  });
  savePreferences(preferences);
  return { ok: true };
});

ipcMain.handle("reviewed-findings:save", async (_event, payload) => {
  return saveReviewedFindings(payload);
});

ipcMain.handle("reviewed-findings:remove", async (_event, payload) => {
  return removeReviewedFindings(payload);
});

ipcMain.handle("file:open", async (_event, payload) => {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Invalid open-file request." };
  }

  const root = typeof payload.root === "string" ? path.resolve(payload.root) : "";
  const relativeFile = typeof payload.file === "string" ? payload.file : "";
  const line = Number.isInteger(payload.line) && payload.line > 0 ? payload.line : 1;

  if (!root || !relativeFile) {
    return { ok: false, error: "Open-file request needs root and file." };
  }

  const absolutePath = path.resolve(root, relativeFile);
  if (!isPathInsideRoot(root, absolutePath) || !fs.existsSync(absolutePath)) {
    return { ok: false, error: "Finding file is missing or outside the project root." };
  }

  const vscodeUri = `vscode://file/${absolutePath.replace(/\\/g, "/")}:${line}`;
  try {
    await shell.openExternal(vscodeUri);
    return { ok: true };
  } catch {
    const fallbackError = await shell.openPath(absolutePath);
    return fallbackError ? { ok: false, error: fallbackError } : { ok: true };
  }
});

ipcMain.handle("report:save", async (_event, payload) => {
  if (!isPlainObject(payload) || typeof payload.content !== "string") {
    return { ok: false, error: "Save report request needs text content." };
  }

  const defaultName = typeof payload.defaultName === "string" ? payload.defaultName : "agents-doctor-report.json";
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save AGENTS.md Doctor report",
    defaultPath: defaultName,
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "Markdown", extensions: ["md"] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  fs.writeFileSync(result.filePath, payload.content, "utf8");
  return { ok: true, path: result.filePath };
});

ipcMain.handle("app:notify", async (_event, payload) => {
  if (!isPlainObject(payload) || !Notification.isSupported()) {
    return { ok: false };
  }

  const title = typeof payload.title === "string" ? payload.title : "AGENTS.md Doctor";
  const body = typeof payload.body === "string" ? payload.body : "";
  new Notification({ title, body }).show();
  return { ok: true };
});

function createMainWindow() {
  const savedBounds = isPlainObject(preferences.windowBounds) ? preferences.windowBounds : {};
  const window = new BrowserWindow({
    width: numberOrDefault(savedBounds.width, 1180),
    height: numberOrDefault(savedBounds.height, 780),
    x: Number.isInteger(savedBounds.x) ? savedBounds.x : undefined,
    y: Number.isInteger(savedBounds.y) ? savedBounds.y : undefined,
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

  window.on("close", () => {
    preferences = sanitizePreferences({
      ...preferences,
      windowBounds: window.getBounds()
    });
    savePreferences(preferences);
  });

  window.loadFile(path.join(__dirname, "index.html"));
  return window;
}

function buildApplicationMenu() {
  const send = (command) => {
    const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
    target?.webContents.send("app:command", command);
  };

  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        { label: "Open Project", accelerator: "CmdOrCtrl+O", click: () => send("open-project") },
        { label: "Save Report", accelerator: "CmdOrCtrl+S", click: () => send("save-report") },
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { label: "Copy JSON", accelerator: "CmdOrCtrl+Shift+C", click: () => send("copy-json") },
        { label: "Copy Agent Handoff", accelerator: "CmdOrCtrl+Alt+C", click: () => send("copy-handoff") },
        { role: "copy" },
        { role: "paste" }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Theme", accelerator: "CmdOrCtrl+Shift+L", click: () => send("toggle-theme") },
        { role: "reload" },
        { role: "toggleDevTools" }
      ]
    },
    {
      label: "Run",
      submenu: [
        { label: "Verify", accelerator: "CmdOrCtrl+1", click: () => send("mode-verify") },
        { label: "Lint", accelerator: "CmdOrCtrl+2", click: () => send("mode-lint") },
        { label: "Explain", accelerator: "CmdOrCtrl+3", click: () => send("mode-explain") },
        { label: "Run Check", accelerator: "F5", click: () => send("run-check") }
      ]
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", accelerator: "?", click: () => send("shortcuts") },
        { label: "GitHub", click: () => shell.openExternal("https://github.com/ItsHege/agents-md-doctor") },
        { label: "About", click: () => send("about") }
      ]
    }
  ]);
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
            const contextHygiene = document.querySelector("#context-hygiene");
            contextHygiene.checked = true;
            contextHygiene.dispatchEvent(new Event("change"));
            const contextStaleDays = document.querySelector("#context-stale-days");
            contextStaleDays.value = "30";
            contextStaleDays.dispatchEvent(new Event("change"));

            document.querySelector("#run-check").click();
            await waitFor("verify title", () => (document.querySelector("#report-title")?.textContent ?? "").includes("Verify"));
            document.querySelector('[data-filter="all"]')?.click();

            const selectedPath = document.querySelector("#project-path")?.value ?? "";
            const successTitle = document.querySelector("#report-title")?.textContent ?? "";
            const successRows = Array.from(document.querySelectorAll("#findings-body tr")).map((row) => row.textContent ?? "");
            const ledgerCommand = document.querySelector("#ledger-command")?.textContent ?? "";
            const ledgerScanned = document.querySelector("#ledger-scanned")?.textContent ?? "";
            const ledgerFindings = document.querySelector("#ledger-findings")?.textContent ?? "";
            const ledgerFiles = document.querySelector("#ledger-files")?.textContent ?? "";
            const ledgerPipeline = Array.from(document.querySelectorAll("#ledger-pipeline .check-chip")).map((chip) => chip.textContent ?? "");
            const contextRow = Array.from(document.querySelectorAll("#findings-body tr")).find((row) =>
              (row.textContent ?? "").includes("context.stale_plan_file")
            );
            if (!contextRow) {
              throw new Error("Expected context hygiene stale finding row.");
            }
            contextRow.click();
            document.querySelector("#drawer-suppress")?.click();
            await waitFor("copy cleanup request", () => {
              if (window.__agentsDoctorCopyError) {
                throw new Error("Copy cleanup request failed: " + window.__agentsDoctorCopyError);
              }

              return (window.__agentsDoctorLastCopiedCleanup ?? "").includes("archive or delete");
            });
            const copiedCleanup = window.__agentsDoctorLastCopiedCleanup ?? "";
            const reviewCheckbox = document.querySelector('#findings-body input[type="checkbox"]:not(:disabled)');
            if (!reviewCheckbox) {
              throw new Error("Expected at least one reviewable finding checkbox.");
            }
            reviewCheckbox.click();
            const saveReviewed = document.querySelector('#save-reviewed');
            if (!saveReviewed || saveReviewed.classList.contains('hidden')) {
              throw new Error("Expected Save reviewed button after selecting a finding.");
            }
            saveReviewed.click();
            await waitFor("reviewed finding rerun", () =>
              Boolean(state.report?.findings?.some((finding) => finding.details?.reviewedFinding))
            );
            const reviewedFindingCount = state.report.findings.filter((finding) => finding.details?.reviewedFinding).length;
            document.querySelector('[data-filter="ignored"]')?.click();
            await waitFor("ignored filter count", () =>
              Number(document.querySelector('[data-count-for="ignored"]')?.textContent ?? "0") >= reviewedFindingCount
            );
            const ignoredRows = Array.from(document.querySelectorAll("#findings-body tr")).map((row) => row.textContent ?? "");
            const ignoredInfoCount = document.querySelector('[data-count-for="info"]')?.textContent ?? "";
            const ignoredCheckbox = document.querySelector('#findings-body input[type="checkbox"]:not(:disabled)');
            if (!ignoredCheckbox || !ignoredCheckbox.checked) {
              throw new Error("Expected checked ignored finding checkbox.");
            }
            ignoredCheckbox.click();
            const restoreReviewed = document.querySelector('#restore-reviewed');
            if (!restoreReviewed || restoreReviewed.classList.contains('hidden')) {
              throw new Error("Expected Restore ignored button after unchecking ignored finding.");
            }
            restoreReviewed.click();
            await waitFor("restored ignored finding rerun", () =>
              Boolean(state.report) && !state.report.findings.some((finding) => finding.details?.reviewedFinding)
            );
            const restoredReviewedFindingCount = state.report.findings.filter((finding) => finding.details?.reviewedFinding).length;
            const restoredWarningCount = state.report.summary.warningCount;
            const ignoredCountAfterRestore = document.querySelector('[data-count-for="ignored"]')?.textContent ?? "";
            document.querySelector('[data-filter="all"]')?.click();

            const result = await window.agentsDoctor.runCheck({
              command: "verify",
              root,
              targetPath: ".",
              strict: false,
              contextHygiene: true,
              contextStaleDays: 30
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
            document.querySelector("#copy-handoff").click();
            await waitFor("copy handoff", () => {
              if (window.__agentsDoctorCopyError) {
                throw new Error("Copy handoff failed: " + window.__agentsDoctorCopyError);
              }

              return (window.__agentsDoctorLastCopiedHandoff ?? "").includes("Use this AGENTS.md Doctor report");
            });

            const copiedHandoff = window.__agentsDoctorLastCopiedHandoff ?? "";

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
              copiedCleanup,
              reviewedFindingCount,
              ignoredRows,
              ignoredInfoCount,
              restoredReviewedFindingCount,
              restoredWarningCount,
              ignoredCountAfterRestore,
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
              copiedHandoff,
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

function runCaptureWhenReady(window) {
  window.webContents.once("did-finish-load", async () => {
    try {
      const fixtureRoot = fs.mkdtempSync(path.join(app.getPath("temp"), "agents-doctor-ui-capture-"));
      fs.writeFileSync(path.join(fixtureRoot, "package.json"), JSON.stringify({ scripts: {} }));
      fs.writeFileSync(
        path.join(fixtureRoot, "AGENTS.md"),
        [
          "# Agent Instructions",
          "",
          "## Safety",
          "",
          "Keep repository checks deterministic and local.",
          "",
          "## Testing",
          "",
          "Run focused tests before changing shared instructions.",
          "",
          "See PROJECT_DNA.md before editing product scope."
        ].join("\n")
      );
      fs.writeFileSync(
        path.join(fixtureRoot, "CLAUDE.md"),
        ["# Claude Notes", "", "Use the repository instructions and keep changes scoped."].join("\n")
      );

      const publicRoot = "C:\\Projects\\demo-agent-app";
      const captureResult = await window.webContents.executeJavaScript(
        `
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            applyTheme('dark');
            setCommand('verify');
            const profile = document.querySelector('#tool-profile');
            profile.value = 'claude-code';
            profile.dispatchEvent(new Event('change'));
            setProjectPath(${JSON.stringify(fixtureRoot)});
            await runCheck();
            await new Promise((resolve) => setTimeout(resolve, 500));

            const publicRoot = ${JSON.stringify(publicRoot)};
            const maskPaths = () => {
              const projectInput = document.querySelector('#project-path');
              if (projectInput) {
                projectInput.value = publicRoot;
                projectInput.title = publicRoot;
              }
              const ledgerRoot = document.querySelector('#ledger-root');
              if (ledgerRoot) {
                ledgerRoot.textContent = publicRoot;
                ledgerRoot.title = publicRoot;
              }
              const ledgerFiles = document.querySelector('#ledger-files');
              if (ledgerFiles) {
                ledgerFiles.textContent = 'AGENTS.md, CLAUDE.md';
                ledgerFiles.title = 'AGENTS.md, CLAUDE.md';
              }
              document.querySelectorAll('.recent-path').forEach((item) => {
                item.textContent = publicRoot;
                item.title = publicRoot;
              });
            };
            maskPaths();
            await new Promise((resolve) => setTimeout(resolve, 100));
            maskPaths();

            return {
              title: document.querySelector('#report-title')?.textContent ?? '',
              rows: document.querySelectorAll('#findings-body tr').length
            };
          })();
        `,
        true
      );

      const outputPath =
        typeof process.env.AGENTS_DOCTOR_UI_CAPTURE_OUT === "string" && process.env.AGENTS_DOCTOR_UI_CAPTURE_OUT
          ? path.resolve(process.env.AGENTS_DOCTOR_UI_CAPTURE_OUT)
          : path.resolve(__dirname, "..", "docs", "assets", "desktop-ui-warning-report.png");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const image = await window.webContents.capturePage();
      fs.writeFileSync(outputPath, image.toPNG());
      console.log(JSON.stringify({ ok: true, outputPath, ...captureResult }));
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      app.exit(1);
    }
  });
}

function runPayloadInWorker(payload) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./doctor-worker.mjs", import.meta.url), {
      workerData: {
        doctorDistRoot,
        payload
      }
    });

    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      worker.terminate().catch(() => {});
      resolve(result);
    };

    worker.once("message", (message) => {
      if (isPlainObject(message) && message.ok === true && "result" in message) {
        finish(message.result);
        return;
      }

      finish({
        ok: false,
        exitCode: 2,
        error: isPlainObject(message) && typeof message.error === "string" ? message.error : "Doctor worker returned an invalid response."
      });
    });

    worker.once("error", (error) => {
      finish({
        ok: false,
        exitCode: 2,
        error: error instanceof Error ? error.message : "Doctor worker failed."
      });
    });

    worker.once("exit", (code) => {
      if (code !== 0 && !settled) {
        finish({
          ok: false,
          exitCode: 2,
          error: `Doctor worker exited with code ${code}.`
        });
      }
    });
  });
}

function preferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(fs.readFileSync(preferencesPath(), "utf8"));
    return sanitizePreferences(parsed);
  } catch {
    return {};
  }
}

function savePreferences(nextPreferences) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(preferencesPath(), `${JSON.stringify(sanitizePreferences(nextPreferences), null, 2)}\n`, "utf8");
}

function saveReviewedFindings(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Reviewed findings payload must be an object." };
  }

  const root = typeof payload.root === "string" ? path.resolve(payload.root) : "";
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, error: "Project folder is required to save reviewed findings." };
  }

  const entries = Array.isArray(payload.findings) ? payload.findings.map(sanitizeReviewedFinding).filter(Boolean) : [];
  if (entries.length === 0) {
    return { ok: false, error: "Select at least one finding to mark reviewed." };
  }

  const configPath = path.resolve(root, configFileName);
  if (!isPathInsideRoot(root, configPath)) {
    return { ok: false, error: "Config path resolved outside the project root." };
  }

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {
      return {
        ok: false,
        error: `${configFileName} is not valid JSON: ${error instanceof Error ? error.message : "invalid JSON"}`
      };
    }
  }

  if (!isPlainObject(config)) {
    return { ok: false, error: `${configFileName} must contain a JSON object.` };
  }

  const reviewedByFingerprint = new Map(
    (Array.isArray(config.reviewedFindings) ? config.reviewedFindings : [])
      .filter(isPlainObject)
      .filter((entry) => typeof entry.fingerprint === "string")
      .map((entry) => [entry.fingerprint, entry])
  );

  for (const entry of entries) {
    reviewedByFingerprint.set(entry.fingerprint, {
      ...(isPlainObject(reviewedByFingerprint.get(entry.fingerprint)) ? reviewedByFingerprint.get(entry.fingerprint) : {}),
      ...entry
    });
  }

  config.reviewedFindings = Array.from(reviewedByFingerprint.values()).sort((left, right) =>
    String(left.fingerprint).localeCompare(String(right.fingerprint))
  );
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    ok: true,
    path: configPath,
    savedCount: entries.length,
    totalCount: config.reviewedFindings.length
  };
}

function removeReviewedFindings(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, error: "Reviewed findings payload must be an object." };
  }

  const root = typeof payload.root === "string" ? path.resolve(payload.root) : "";
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, error: "Project folder is required to restore ignored findings." };
  }

  const fingerprints = Array.isArray(payload.fingerprints)
    ? payload.fingerprints
        .filter((fingerprint) => typeof fingerprint === "string")
        .map((fingerprint) => fingerprint.trim())
        .filter(Boolean)
    : [];
  if (fingerprints.length === 0) {
    return { ok: false, error: "Select at least one ignored finding to restore." };
  }

  const configPath = path.resolve(root, configFileName);
  if (!isPathInsideRoot(root, configPath)) {
    return { ok: false, error: "Config path resolved outside the project root." };
  }
  if (!fs.existsSync(configPath)) {
    return { ok: false, error: `${configFileName} does not exist for this project.` };
  }

  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: `${configFileName} is not valid JSON: ${error instanceof Error ? error.message : "invalid JSON"}`
    };
  }

  if (!isPlainObject(config)) {
    return { ok: false, error: `${configFileName} must contain a JSON object.` };
  }

  const removalSet = new Set(fingerprints);
  const before = Array.isArray(config.reviewedFindings) ? config.reviewedFindings.filter(isPlainObject) : [];
  const after = before.filter((entry) => typeof entry.fingerprint !== "string" || !removalSet.has(entry.fingerprint));
  const removedCount = before.length - after.length;
  config.reviewedFindings = after;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    ok: true,
    path: configPath,
    removedCount,
    totalCount: after.length
  };
}

function sanitizeReviewedFinding(value) {
  if (!isPlainObject(value) || typeof value.fingerprint !== "string" || value.fingerprint.trim() === "") {
    return null;
  }

  const status = ["intentional", "false_positive", "accepted_risk"].includes(value.status)
    ? value.status
    : "intentional";
  const entry = {
    fingerprint: value.fingerprint.trim(),
    status,
    createdAt:
      typeof value.createdAt === "string" && value.createdAt.trim()
        ? value.createdAt
        : new Date().toISOString()
  };

  for (const key of ["ruleId", "file", "message", "note"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      entry[key] = value[key].trim().slice(0, key === "message" ? 2000 : 1000);
    }
  }

  return entry;
}

function sanitizePreferences(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    theme: value.theme === "dark" ? "dark" : "light",
    command: ["verify", "lint", "explain"].includes(value.command) ? value.command : "verify",
    toolProfile: typeof value.toolProfile === "string" && toolProfiles.has(value.toolProfile) ? value.toolProfile : "auto",
    filter: ["all", "error", "warning", "info", "ignored"].includes(value.filter) ? value.filter : "all",
    projectPath: typeof value.projectPath === "string" ? value.projectPath : "",
    targetPath: typeof value.targetPath === "string" ? value.targetPath : ".",
    strict: value.strict === true,
    maxLines: typeof value.maxLines === "string" ? value.maxLines : "",
    contextHygiene: value.contextHygiene === true,
    contextStaleDays: typeof value.contextStaleDays === "string" ? value.contextStaleDays : "60",
    ignorePatterns: typeof value.ignorePatterns === "string" ? value.ignorePatterns : "",
    recentProjects: Array.isArray(value.recentProjects)
      ? value.recentProjects.filter((entry) => typeof entry === "string").slice(0, 5)
      : [],
    windowBounds: isPlainObject(value.windowBounds) ? value.windowBounds : undefined,
    sidebarCollapsed: value.sidebarCollapsed === true
  };
}

function numberOrDefault(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isPathInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

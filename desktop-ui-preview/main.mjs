import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const doctorDistRoot = resolveDoctorDistRoot();
const { runDoctorReport } = await import(pathToFileURL(path.join(doctorDistRoot, "api.js")).href);
const { applyToolProfileOverride, loadConfig } = await import(pathToFileURL(path.join(doctorDistRoot, "config", "index.js")).href);
const { findAgentsFiles } = await import(pathToFileURL(path.join(doctorDistRoot, "discovery", "index.js")).href);
const isSmokeMode = process.env.AGENTS_DOCTOR_UI_SMOKE === "1";
const isCaptureMode = process.env.AGENTS_DOCTOR_UI_CAPTURE_SCREENSHOT === "1";
const appIconPath = path.join(__dirname, "assets", "agents-doctor.ico");
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
  return runFromPayload(payload);
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
  const profile = typeof payload.profile === "string" && toolProfiles.has(payload.profile) ? payload.profile : "auto";
  const strict = payload.strict === true;
  const maxLines = Number.isInteger(payload.maxLines) && payload.maxLines > 0 ? payload.maxLines : undefined;
  const ignore = Array.isArray(payload.ignore) ? payload.ignore.filter((entry) => typeof entry === "string") : undefined;

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
      targetPath: targetPath && targetPath.trim().length > 0 ? targetPath : ".",
      profile
    }), profile);
  }

  return withUiMetadata(runDoctorReport({
    command,
    root,
    strict,
    profile,
    ...(maxLines ? { maxLines } : {}),
    ...(ignore && ignore.length > 0 ? { ignore } : {})
  }), profile);
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

function sanitizePreferences(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  return {
    theme: value.theme === "dark" ? "dark" : "light",
    command: ["verify", "lint", "explain"].includes(value.command) ? value.command : "verify",
    toolProfile: typeof value.toolProfile === "string" && toolProfiles.has(value.toolProfile) ? value.toolProfile : "auto",
    filter: ["all", "error", "warning", "info"].includes(value.filter) ? value.filter : "all",
    projectPath: typeof value.projectPath === "string" ? value.projectPath : "",
    targetPath: typeof value.targetPath === "string" ? value.targetPath : ".",
    strict: value.strict === true,
    maxLines: typeof value.maxLines === "string" ? value.maxLines : "",
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

function withUiMetadata(result, profile = "auto") {
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    meta: buildUiMetadata(result.report, profile)
  };
}

function buildUiMetadata(report, profile = "auto") {
  const root = report.root;

  if (!root || report.command === "explain") {
    return {
      scannedFiles: []
    };
  }

  try {
    const config = applyToolProfileOverride(loadConfig({ root }), profile);
    return {
      scannedFiles: findAgentsFiles(root, { ignore: config.ignore, fileNames: config.lintFileNames }).map((file) => file.relativePath)
    };
  } catch {
    return {
      scannedFiles: []
    };
  }
}

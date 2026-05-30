# AGENTS.md Doctor Desktop Preview

Source preview for the local desktop UI. This folder is part of the GitHub
repository for early testing, but it is not included in the published
`agents-doctor` npm package.

## What it does

- Opens a native folder picker.
- Runs `lint`, `verify`, or `explain` through the local programmatic API.
- Shows the stable AGENTS.md Doctor report fields in a table.
- Shows run details: command, project root, generated time, exit code, scanned
  AGENTS.md count, scanned AGENTS.md paths, checks run, and finding count.
- Copies the exact JSON report to the clipboard.

## Safety boundary

- Does not execute commands from target instruction files.
- Does not call `npx`, package managers, or shell commands to run checks.
- Does not upload repository contents.
- Reads reports through `../dist/api.js`, which delegates to the existing
  deterministic command pipeline.

## Local run

```powershell
npm install
npm run dev
```

`npm run dev` first builds the parent CLI package, then starts Electron.

On Windows, for first-time setup without a visible terminal, double-click:

```text
Setup-AGENTS-Doctor-UI.vbs
```

This installs local prototype dependencies and creates or refreshes the
app-style launcher.

If dependencies are already installed, create or refresh the launcher manually:

```powershell
npm run icon
npm run launcher
```

Then double-click:

```text
AGENTS.md Doctor.lnk
```

The shortcut uses the AGENTS.md Doctor icon and starts the app without leaving a
terminal window open. The hidden `.vbs` launcher stays as an implementation
detail behind the shortcut.

Optional desktop shortcut:

```powershell
npm run launcher -- -Desktop
```

## Smoke test

```powershell
npm run smoke
```

The smoke test opens Electron in a temporary fixture, selects the project
through the renderer path, runs `verify` through IPC, confirms findings, run
details, and scanned-file paths render, confirms invalid-root errors render,
refreshes the Windows launcher shortcut, proves a marker-creating shell snippet
from `AGENTS.md` was not executed, and runs a static scan over UI runtime files
for command-execution patterns.

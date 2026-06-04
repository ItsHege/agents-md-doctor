# AGENTS.md Doctor Desktop Preview

Source preview for the local desktop UI. This folder is part of the GitHub
repository for early testing, but it is not included in the published
`agents-doctor` npm package.

Tagged GitHub releases can attach a Windows x64 portable zip built from this
folder. Download `AGENTS.md-Doctor-win32-x64-<version>.zip`, unzip it, and run
`AGENTS.md Doctor.exe`.

## What it does

- Opens a native folder picker.
- Runs `lint`, `verify`, or `explain` through the local programmatic API.
- Shows the stable AGENTS.md Doctor report fields in a table.
- Shows run details: command, project root, generated time, exit code, scanned
  instruction-file count, scanned instruction-file paths, checks run, and
  finding count.
- Lets users keep the default `Auto` profile or focus checks on Codex, Claude
  Code, Cursor, Gemini CLI, GitHub Copilot, Windsurf, or Cline.
- Shows Explain tool-evidence detail summaries, including repo-local Claude
  settings files, command files, import candidates, and slash-command
  candidates when present.
- Exposes safe existing options for lint/verify: fail on warnings, max lines,
  and ignore patterns.
- Copies the exact JSON report to the clipboard.
- Copies an agent handoff prompt that wraps the JSON report with safe,
  scoped-fix instructions.
- Copies a reviewed config override from the details drawer for intentional
  exceptions while keeping the fix-first handoff as the primary remediation
  path.

## Safety boundary

- Does not execute commands from target instruction files.
- Does not call `npx`, package managers, or shell commands to run checks.
- Does not upload repository contents.
- Reads reports through `../dist/api.js`, which delegates to the existing
  deterministic command pipeline.

## Local run

Use Node.js 22.12 or newer for this preview workspace. The published CLI
package still supports Node.js 20 or newer; this higher requirement is only for
the Electron preview and packaging toolchain.

```powershell
npm install
npm run dev
```

`npm run dev` first ensures the parent CLI dependencies are installed, builds
the parent CLI package, then starts Electron.

On Windows, for first-time setup without a visible terminal, double-click:

```text
Setup-AGENTS-Doctor-UI.vbs
```

This installs local prototype dependencies and creates or refreshes the
app-style launcher. On first launch, the preview also ensures the parent CLI
dependencies are installed before building the report API.

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
details, scanned-file paths, Copy JSON, Copy handoff, Explain tool evidence, and
Claude evidence detail summaries render, confirms invalid-root errors render,
proves a marker-creating shell snippet from `AGENTS.md` was not executed, and
runs a static scan over UI runtime files for command-execution patterns.

## README screenshot

```powershell
npm run capture:screenshot
```

This refreshes `../docs/assets/desktop-ui-warning-report.png` through the real
Electron app path. Avoid passing inline JavaScript directly to `electron`; on
Windows it can be interpreted as an app path and show an "Unable to find
Electron app" dialog.

## Windows release package

```powershell
npm run package:win
```

This builds the parent CLI, stages the UI with the compiled deterministic report
API, installs only production runtime dependencies for the packaged app, creates
`release/AGENTS.md Doctor-win32-x64/`, and writes
`release/AGENTS.md-Doctor-win32-x64-<version>.zip`.

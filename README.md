# AGENTS.md Doctor

[![CI](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml)

AGENTS.md Doctor is a deterministic CLI/CI checker for agent instruction files.

It helps teams keep AGENTS.md instructions short, scoped, and aligned with the real repository.

## Quick Example

```bash
$ npx agents-doctor@latest lint .
agents-doctor lint: 1 error, 1 warning

warning size.file_too_long AGENTS.md:1
AGENTS.md has 612 lines. Recommended maximum: 500 lines.

error commands.mentioned_command_missing AGENTS.md:45
AGENTS.md references a missing package script: typecheck.
```

## Why This Exists

AI coding agents increasingly rely on repository-level instruction files. When those instructions drift from reality, agents waste time, run wrong commands, and ignore important constraints.

AGENTS.md Doctor catches these issues before agent work starts.

## Problem Examples

AGENTS.md Doctor is built for drift like this:

- `AGENTS.md` says `npm run test:all`, but `package.json` only has `npm test`.
- Nested `AGENTS.md` files disagree about `npm` vs `pnpm`.
- A rules file grows to 800 lines and buries the safety rules.
- A path reference points to a file that no longer exists.

## Available Now

The package is published on npm as `agents-doctor`.

This README describes the current `main` branch. npm `agents-doctor@latest`
may lag unreleased `main` features; see `CHANGELOG.md` for the exact released
feature set. For normal repository checks, prefer `agents-doctor@latest`. Use a
local checkout only when validating unreleased behavior or preparing a release.

Quick usage:

```bash
npx agents-doctor@latest --version
npx agents-doctor@latest init .
npx agents-doctor@latest lint .
npx agents-doctor@latest verify --json .
npx agents-doctor@latest explain src
```

## First Five Minutes

Use this flow when adding AGENTS.md Doctor to a repository for the first time:

1. Run a broad readiness check:

   ```bash
   npx agents-doctor@latest verify --json .
   ```

2. If the output is hard to scan, run the human view:

   ```bash
   npx agents-doctor@latest verify .
   ```

3. Classify each finding before editing instructions:

   - `TP`: the finding is valid and useful; fix the instruction or the repo.
   - `FP`: the finding is objectively wrong; keep the evidence for an upstream bug report.
   - `Needs-Config`: the finding is expected for this repo; add explicit `.agents-doctor.json` config.
   - `Unclear`: more human context is needed before changing anything.

4. Fix only `TP` findings and intentional `Needs-Config` cases.
5. Re-run the same command and keep the JSON output as the CI contract.

Optional starter config:

```bash
npx agents-doctor@latest init .
```

`init` creates `.agents-doctor.json` only when it does not already exist. Use
`--force` only when you intentionally want to overwrite the starter config.

## Command Chooser

- Use `lint` for fast local checks of AGENTS.md size, structure, paths, command references, and risky instructions.
- Use `verify` for CI and adoption checks. It includes lint findings plus repository coverage sanity findings.
- Use `explain <path>` when you need to know which AGENTS.md files apply to a file or directory, and which local agent-tool instruction surfaces were detected.
- Use `--json` for scripts and CI wrappers.
- Use `--format github` for GitHub workflow annotations plus a human summary.
- Use `--format sarif` for SARIF consumers that ingest SARIF 2.1.0.
- Use `--strict` or `--fail-on-warning` only after the team has reviewed the warning baseline.

Install alternatives:

```bash
npm install -g agents-doctor
agents-doctor lint .
```

```bash
pnpm dlx agents-doctor lint .
```

Command surface:

```bash
agents-doctor --version
agents-doctor init [repo]
agents-doctor init --force [repo]
agents-doctor lint [repo]
agents-doctor lint --json [repo]
agents-doctor lint --format json [repo]
agents-doctor lint --format github [repo]
agents-doctor lint --format sarif [repo]
agents-doctor lint --format github --annotations-min-severity warning [repo]
agents-doctor lint --strict [repo]
agents-doctor lint --fail-on-warning [repo]
agents-doctor lint --ignore "tests/fixtures/**" [repo]
agents-doctor lint --max-lines 400 [repo]
agents-doctor lint --profile claude-code [repo]
agents-doctor verify [repo]
agents-doctor verify --json [repo]
agents-doctor verify --format json [repo]
agents-doctor verify --format github [repo]
agents-doctor verify --format sarif [repo]
agents-doctor verify --format github --annotations-min-severity warning [repo]
agents-doctor verify --strict [repo]
agents-doctor verify --fail-on-warning [repo]
agents-doctor verify --profile gemini-cli [repo]
agents-doctor verify --context-hygiene [repo]
agents-doctor verify --context-hygiene --context-stale-days 30 [repo]
agents-doctor verify --prompt-injection [repo]
agents-doctor verify --prompt-injection --prompt-injection-scan-code-blocks [repo]
agents-doctor explain <path> [repo]
agents-doctor explain --json <path> [repo]
agents-doctor explain --profile cursor <path> [repo]
```

Current lint behavior discovers `AGENTS.md` files and reports:

- `size.file_too_long` when a file has more than the configured line threshold.
- `structure.required_sections` when required section headings are missing.
- `paths.reference_missing` when referenced paths do not exist or point outside the repo.
- `commands.mentioned_command_missing` when referenced scripts/targets are missing.
- `security.risky_instruction` for high-confidence risky instruction patterns.
- Optional `context.*` hygiene findings when `verify --context-hygiene` or
  `contextHygiene.enabled` is used.
- Optional `security.prompt_injection_*` findings when
  `verify --prompt-injection` or `promptInjection.enabled` is used.
- Under `--profile codex`, `runtime.codex_agent_role_invalid` for repo-local
  `.codex/agents/*.toml` files that Codex cannot load as standalone custom
  agent roles.

Most findings are warnings by default. Some checks can emit errors, for example
`commands.mentioned_command_missing` when a referenced command/target is not
declared. If a script is missing only from the local package but exists in a
workspace package, `commands.mentioned_command_missing` uses
`details.reason: "scope_ambiguous"` and remains warning-only. CI failure
behavior can also be tightened with `--strict`, `--fail-on-warning`, or
`failOnWarning` config. The optional `[repo]` argument defaults to the current
directory.

Tool profiles let teams keep the default broad behavior or focus checks on one
local agent-tool surface. `auto` is the default and requires no flag. Specific
profiles are deterministic presets, not model/API calls:

```bash
agents-doctor verify --profile claude-code .
agents-doctor explain --profile gemini-cli src
```

Supported profile values are `auto`, `codex`, `claude-code`, `cursor`,
`gemini-cli`, `github-copilot`, `windsurf`, and `cline`. Claude Code and Gemini
CLI profiles also expand the default lint file names to include `CLAUDE.md` or
`GEMINI.md` unless `.agents-doctor.json` explicitly sets `lintFileNames`.
The Codex profile also validates repo-local `.codex/agents/*.toml` custom agent
role files against the documented standalone role shape. This scan stays inside
the selected repository and does not read user-level `~/.codex/agents/` files.

GitHub Actions currently runs typecheck, tests, build, CLI smoke checks, and
packed-package smoke checks on push and pull request. Release automation adds
benchmarks and release preflight. Repository security automation can use GitHub
CodeQL default setup, dependency review, and Dependabot update checks where
applicable. The maintainer release workflow publishes through npm provenance
when the repository `NPM_TOKEN` secret is configured; otherwise it completes the
release gate and warns that npm publish was skipped.

For repository CI setup examples and current output-format limits, see
`docs/ci.md`. For maintainer release governance, trusted publishing migration
policy, and review ownership for release-sensitive files, see
`docs/release-governance.md`.

## How It Works (10 Seconds)

```text
Run agents-doctor (init / lint / verify / explain)
-> Load config (.agents-doctor.json + CLI flags)
-> Discover configured repository instruction files
-> Read files safely inside repo boundary
-> Extract Markdown structure (headings, code, links)
-> Apply deterministic rules
-> Optionally run context hygiene for planning clutter when enabled
-> Optionally run prompt injection audit for instruction surfaces when enabled
-> Build report (findings + summary + exit code)
-> Output (terminal report or JSON for CI)
```

AGENTS.md Doctor does not execute commands from AGENTS.md. It only inspects
instructions, paths, command references, and policy signals.

For maintainer release work, the release safety checks also validate packed
package contents, reject private workspace paths or secret-like strings in
public package text, and exercise installed CLI output formats from the tarball.

For the full architecture flow, see `docs/how-it-works.md`.
For Claude-first repository caveats, see `docs/claude-projects.md`.
For teams mixing Codex, Claude Code, Cursor, Gemini CLI, GitHub Copilot,
Windsurf, or Cline, see `docs/context-fidelity.md`.

## Agent Workflow Example

AGENTS.md Doctor can be used inside agent skills and custom coding-agent
workflows. Run it first, inspect the findings, then let the coding agent make
scoped instruction edits with human review.

A typical loop:

1. Run `agents-doctor verify --json .`.
2. Classify findings as `TP`, `FP`, `Needs-Config`, or `Unclear`.
3. Fix only validated instruction drift: stale commands, missing paths,
   oversized files, or risky instructions.
4. Re-run `agents-doctor verify --json .`.
5. Leave semantic or product decisions to human review.

See `examples/codex-skill/SKILL.md` for a Codex skill example.
See `examples/README.md` for public onboarding examples covering a minimal
repo, monorepo scope ambiguity, missing paths, instruction graph opt-in,
GitHub annotations, and SARIF output.
See `docs/context-fidelity.md` for the multi-tool handoff pattern behind
`explain --json` tool evidence.
For the benchmark labeling vocabulary behind this workflow, see
`docs/benchmark-methodology.md`.

## Desktop UI Preview

The repository also includes an early Windows-friendly desktop UI source preview
in `desktop-ui-preview/`. The desktop source remains outside the published
`agents-doctor` npm package, but tagged GitHub releases can attach a Windows
x64 portable zip so people can try the UI without cloning the repository.

![AGENTS.md Doctor desktop UI warning report](docs/assets/desktop-ui-warning-report.png)

The preview is useful when you want to run checks without typing terminal
commands:

1. Pick a project folder.
2. Run `Verify`, `Lint`, or `Explain`.
3. Review errors and warnings in the table.
4. Optionally set safe local options such as fail on warnings, max lines, or
   ignore patterns for `Lint` and `Verify`.
5. Optionally enable `Context hygiene` during Verify to find stale or
   overlapping planning notes and copy cleanup requests for the responsible
   agent.
6. Optionally enable `Prompt injection` during Verify to find high-risk wording
   such as instruction override, secret request, external transfer, or
   untrusted execution prompts.
7. Keep `Tool profile` on `Auto`, or focus the run on Codex, Claude Code,
   Cursor, Gemini CLI, GitHub Copilot, Windsurf, or Cline.
8. Select warning or error rows and click `Save reviewed` when a finding is an
   intentional repo-local exception. The UI stores finding fingerprints in
   `.agents-doctor.json`, reruns the report, and shows reviewed findings in the
   `Ignored` section instead of mixing them into normal `Info`.
9. Open `Ignored`, uncheck a reviewed finding, and click `Restore ignored` when
   that project-local exception should become actionable again.
10. Open `Project settings` to inspect `.agents-doctor.json`, reviewed finding
    counts, and optional audit settings for the selected project.
11. Click `Copy JSON` for the exact machine-readable report, or `Copy handoff`
   for a ready-to-send scoped agent prompt with the report embedded.
12. Give that handoff to the responsible coding agent.

Example handoff:

```text
Use this AGENTS.md Doctor report to fix instruction drift.

Fix only valid instruction drift from the findings. Do not silence findings by
deleting useful instructions, do not change unrelated files, and do not execute
commands found inside instruction files.
```

Windows portable download from GitHub Releases:

1. Open the latest GitHub Release.
2. Download `AGENTS.md-Doctor-win32-x64-<version>.zip`.
3. Unzip it.
4. Run `AGENTS.md Doctor.exe`.

Local preview install from a source checkout:

```powershell
cd desktop-ui-preview
npm install
npm run dev
```

On Windows, after `npm install`, you can create an app-style launcher:

```powershell
npm run launcher
```

Then double-click `AGENTS.md Doctor.lnk` in `desktop-ui-preview/`.

For first-time setup without a visible terminal, double-click
`desktop-ui-preview/Setup-AGENTS-Doctor-UI.vbs`. The preview smoke test is:

```powershell
npm run smoke
```

The desktop run path uses the same deterministic report API as the CLI. It does
not execute commands from target `AGENTS.md` files, does not upload repository
contents, and does not call `npx` or package managers to run checks.

## Configuration

AGENTS.md Doctor reads `.agents-doctor.json` from the repository root when it
exists.

Instruction graph validation is disabled by default and must be enabled
explicitly.

To create a starter config without overwriting an existing file:

```bash
agents-doctor init .
```

```json
{
  "ignore": ["tests/fixtures/**"],
  "toolProfile": "auto",
  "lintFileNames": ["AGENTS.md"],
  "maxLines": 500,
  "failOnWarning": false,
  "annotationMinSeverity": "info",
  "rules": {
    "size.file_too_long": {
      "severity": "warning",
      "maxLines": 500
    },
    "structure.required_sections": {
      "severity": "warning",
      "requiredHeadings": ["Safety", "Testing"]
    }
  },
  "instructionGraph": {
    "enabled": false,
    "maxDepth": 2,
    "include": [
      "**/AGENTS.md",
      "**/.agents/**/*.md",
      "**/docs/agents/**/*.md",
      "**/docs/agent/**/*.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      "**/.claude/**/*.md",
      "**/.github/copilot-instructions.md",
      "**/.cursor/rules/**/*.md",
      "**/.cursor/rules/**/*.mdc"
    ]
  },
  "contextHygiene": {
    "enabled": false,
    "staleAfterDays": 60,
    "include": ["**/*.md", "**/*.mdx"],
    "ignore": [],
    "publicPaths": [".", "docs", "examples"],
    "publicScopeInstructionPaths": [
      "**/AGENTS.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      ".github/copilot-instructions.md",
      ".github/instructions/**/*.md",
      ".cursor/rules/**/*.md",
      ".windsurf/rules/**/*.md",
      ".clinerules/**/*.md"
    ],
    "overlapDetection": "exact",
    "overlapTokenMinLength": 4,
    "maxFileSizeKb": 1000,
    "maxFilesScanned": 500,
    "maxDepth": 40
  },
  "promptInjection": {
    "enabled": false,
    "include": [
      "**/AGENTS.md",
      "**/CLAUDE.md",
      "**/GEMINI.md",
      ".github/copilot-instructions.md",
      ".github/instructions/**/*.md",
      ".cursor/rules/**/*.md",
      ".cursor/rules/**/*.mdc",
      ".windsurf/rules/**/*.md",
      ".clinerules/**/*.md"
    ],
    "ignore": [],
    "scanCodeBlocks": false,
    "maxFileSizeKb": 1000,
    "maxFilesScanned": 500,
    "maxDepth": 40
  },
  "reviewedFindings": []
}
```

Rule severity can be `error`, `warning`, `info`, or `off`. CLI flags override
matching config values where applicable.

For full configuration details, see `docs/configuration.md`.

Reviewed findings are repo-local exceptions, not a global way to disable rules.
Each finding includes a stable `details.fingerprint`; adding that fingerprint
to `.agents-doctor.json` under `reviewedFindings` downgrades the matching
finding to `info` in JSON and adds `details.reviewedFinding` to the report. The
desktop UI displays those reviewed findings under `Ignored` so they stay
separate from ordinary informational findings. Prefer fixing real warnings
first, and reserve reviewed findings for intentional snapshots, accepted project
risks, or known false positives.

## Core Features

### Lint

Current behavior checks all active lint rules and reports deterministic findings.
Human-readable output is the default. JSON output is available with `--json` or
`--format json`; GitHub annotation and SARIF output are available with
`--format github` and `--format sarif`.

- `size.file_too_long`
- `structure.required_sections`
- `paths.reference_missing`
- `commands.mentioned_command_missing`
- `security.risky_instruction`

### Verify

Current behavior: runs lint checks plus coverage sanity and emits a unified `verify` report.

- Includes all lint findings in one report.
- Adds coverage sanity markers (`coverage.discovery_summary`, optional root/no-file warnings).
- When `instructionGraph.enabled` is true, validates referenced instruction files as an instruction graph.
- When `--context-hygiene` or `contextHygiene.enabled` is used, scans
  Markdown/MDX planning notes for stale files, exact overlaps, and public-scope
  planning clutter.
- When `--prompt-injection` or `promptInjection.enabled` is used, scans
  configured local instruction surfaces for high-confidence prompt-injection
  wording without model calls, network calls, command execution, or secret
  reads.
- When `--profile codex` is used, scans repo-local `.codex/agents/*.toml`
  custom agent role files for malformed TOML or missing/invalid required
  top-level fields without launching Codex or reading global user config.
- Supports JSON output and strict/fail-on-warning exit behavior.

### Explain

Current behavior: shows the effective instruction context for a target path.

- Finds all inherited `AGENTS.md` files.
- Explains which `AGENTS.md` files apply to a specific path.
- Highlights chain order from root to nearest.
- Adds local tool evidence for Codex, Cursor, Claude Code, GitHub Copilot,
  Gemini CLI, Windsurf, and Cline instruction surfaces. This is repository
  evidence, not a guarantee that every external tool loaded the same context at
  runtime.
- Supports `--profile <profile>` to focus tool evidence on one supported local
  agent-tool surface while keeping `auto` as the default.
- When `instructionGraph.enabled` is true, includes referenced instruction files reachable from the applied chain.
- Adds deterministic conflict notes for:
  - package manager disagreement,
  - test command hint mismatch,
  - generated-files edit policy mismatch.

## Scope and Non-goals

Current release scope is deterministic validation for repository `AGENTS.md`
instructions through `lint`, `verify`, and `explain`, with machine-readable CI
output and human-readable terminal output.

Non-goals:

- Rewriting `AGENTS.md` automatically.
- Building a full AI agent framework.
- Supporting every instruction-file format.
- Deep semantic analysis through LLM calls.

## Current JSON Output

```json
{
  "schemaVersion": "1.0.0",
  "tool": "agents-doctor",
  "command": "verify",
  "generatedAt": "2026-05-01T19:30:00.000Z",
  "root": "C:/repo",
  "exitCode": 1,
  "summary": {
    "errorCount": 1,
    "warningCount": 2,
    "infoCount": 1
  },
  "findings": [
    {
      "ruleId": "coverage.discovery_summary",
      "severity": "info",
      "message": "Scanned 1 AGENTS.md file for lint and inheritance sanity.",
      "file": "AGENTS.md",
      "line": 1,
      "details": {
        "agentsFileCount": 1,
        "hasRootAgents": true
      }
    },
    {
      "ruleId": "paths.reference_missing",
      "severity": "warning",
      "message": "AGENTS.md references a missing path: package-lock.json.",
      "file": "AGENTS.md",
      "line": 24,
      "details": {
        "reference": "package-lock.json",
        "reason": "not_found"
      }
    },
    {
      "ruleId": "commands.mentioned_command_missing",
      "severity": "warning",
      "message": "AGENTS.md references script \"dev\" that is missing in the local package but present in workspace package(s): apps/web/package.json.",
      "file": "AGENTS.md",
      "line": 32,
      "details": {
        "reference": "pnpm run dev",
        "scriptName": "dev",
        "source": "workspace",
        "reason": "scope_ambiguous",
        "matchedPackages": ["apps/web/package.json"]
      }
    },
    {
      "ruleId": "commands.mentioned_command_missing",
      "severity": "error",
      "message": "AGENTS.md references a missing Makefile target: lint.",
      "file": "AGENTS.md",
      "line": 45,
      "details": {
        "reference": "make lint",
        "targetName": "lint",
        "source": "Makefile"
      }
    }
  ]
}
```

## Current Human Output

No findings:

```text
agents-doctor lint: OK
No findings.
```

Warning:

```text
agents-doctor lint: 2 warnings

warning paths.reference_missing AGENTS.md:24
AGENTS.md references a missing path: package-lock.json.

warning commands.mentioned_command_missing AGENTS.md:32
AGENTS.md references script "dev" that is missing in the local package but present in workspace package(s): apps/web/package.json.
```

Abbreviated verify error example:

```text
agents-doctor verify: 1 error, 2 warnings

error commands.mentioned_command_missing AGENTS.md:45
AGENTS.md references a missing Makefile target: lint.
```

Real `verify` reports also include an `info coverage.discovery_summary` finding
unless output is filtered by a downstream tool.

Exit codes:

- `0`: no error findings, and warnings are allowed unless `--strict` is used.
- `1`: error findings, or warning findings when `--strict` is used.
- `2`: usage, config, or runtime failure.

Successful human, JSON, GitHub annotation, and SARIF output is written to
stdout. Usage, config, and runtime failures are written to stderr.

## Positioning

This project is for teams that use AI coding agents seriously and want instruction files to behave like maintained project infrastructure, not forgotten notes.

Short version:

> Keep your agent instructions honest.

## Roadmap

See `docs/roadmap.md` for the full public roadmap.

- Strengthen deterministic conflict checks for nested `AGENTS.md` inheritance.
- Harden CI adoption docs and annotation examples based on real usage.
- Harden optional GitHub annotation and SARIF output based on CI feedback.
- Improve `agents-doctor init` onboarding based on first-use feedback.
- Expand real-world fixtures from public repositories.

## AI-Assisted Development

This project is built with an AI-assisted engineering workflow. Design and
implementation are owned by the maintainer, with agent support for scoped
coding, documentation review, test iteration, and release preparation. Shipped
changes are validated with deterministic tests and smoke checks; benchmark runs
are used for real-repository signal checks.

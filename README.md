# AGENTS.md Doctor

[![CI](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml)

AGENTS.md Doctor is a deterministic CLI/CI checker for agent instruction files.

It helps teams keep AGENTS.md instructions short, scoped, and aligned with the real repository.

## Quick Example

```bash
$ npx agents-doctor@latest lint .
agents-doctor lint: 2 warnings

warning size.file_too_long AGENTS.md:1
AGENTS.md has 612 lines. Recommended maximum: 500 lines.

warning commands.mentioned_command_missing AGENTS.md:45
AGENTS.md references a missing package script: typecheck.
```

## Demo

A short terminal demo GIF is planned for this section to show an end-to-end `lint` + `verify` flow in under 30 seconds.

## Why This Exists

AI coding agents increasingly rely on repository-level instruction files. When those instructions drift from reality, agents waste time, run wrong commands, and ignore important constraints.

AGENTS.md Doctor catches these issues before agent work starts.

## Available Now

The package is published on npm as `agents-doctor@0.1.2`.

Quick usage:

```bash
npx agents-doctor@latest lint .
npx agents-doctor@latest verify --json .
npx agents-doctor@latest explain src
```

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
agents-doctor lint [repo]
agents-doctor lint --json [repo]
agents-doctor lint --strict [repo]
agents-doctor lint --fail-on-warning [repo]
agents-doctor lint --ignore "tests/fixtures/**" [repo]
agents-doctor lint --max-lines 400 [repo]
agents-doctor verify [repo]
agents-doctor verify --json [repo]
agents-doctor verify --strict [repo]
agents-doctor verify --fail-on-warning [repo]
agents-doctor explain <path> [repo]
agents-doctor explain --json <path> [repo]
```

Current lint behavior discovers `AGENTS.md` files and reports:

- `size.file_too_long` when a file has more than the configured line threshold.
- `structure.required_sections` when required section headings are missing.
- `paths.reference_missing` when referenced paths do not exist or point outside the repo.
- `commands.mentioned_command_missing` when referenced scripts/targets are missing.
- `security.risky_instruction` for high-confidence risky instruction patterns.

Most findings are warnings by default. Some checks can emit errors, for example
`commands.mentioned_command_missing` when a referenced command/target is not
declared. CI failure behavior can also be tightened with `--strict`,
`--fail-on-warning`, or `failOnWarning` config. The optional `[repo]` argument
defaults to the current directory.

GitHub Actions currently runs typecheck, tests, build, CLI smoke checks, and a
packed-package smoke test.

## How It Works (10 Seconds)

```text
Run agents-doctor (lint / verify / explain)
-> Load config (.agents-doctor.json + CLI flags)
-> Discover AGENTS.md files
-> Read files safely inside repo boundary
-> Extract Markdown structure (headings, code, links)
-> Apply deterministic rules
-> Build report (findings + summary + exit code)
-> Output (terminal report or JSON for CI)
```

AGENTS.md Doctor does not execute commands from AGENTS.md. It only inspects
instructions, paths, command references, and policy signals.

For the full architecture flow, see `docs/how-it-works.md`.

## Configuration

AGENTS.md Doctor reads `.agents-doctor.json` from the repository root when it
exists.

```json
{
  "ignore": ["tests/fixtures/**"],
  "maxLines": 500,
  "failOnWarning": false,
  "rules": {
    "size.file_too_long": {
      "severity": "warning",
      "maxLines": 500
    },
    "structure.required_sections": {
      "severity": "warning",
      "requiredHeadings": ["Safety", "Testing"]
    }
  }
}
```

Rule severity can be `error`, `warning`, `info`, or `off`. CLI flags override
matching config values where applicable.

## Core Features

### Lint

Current behavior checks all active lint rules and reports deterministic findings.
Human-readable output is the default, and JSON output is available with `--json`.

- `size.file_too_long`
- `structure.required_sections`
- `paths.reference_missing`
- `commands.mentioned_command_missing`
- `security.risky_instruction`

### Verify

Current behavior: runs lint checks plus coverage sanity and emits a unified `verify` report.

- Includes all lint findings in one report.
- Adds coverage sanity markers (`coverage.discovery_summary`, optional root/no-file warnings).
- Supports JSON output and strict/fail-on-warning exit behavior.

### Explain

Current behavior: shows the effective instruction context for a target path.

- Finds all inherited `AGENTS.md` files.
- Explains which `AGENTS.md` files apply to a specific path.
- Highlights chain order from root to nearest.
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
    "infoCount": 0
  },
  "findings": [
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

Error:

```text
agents-doctor verify: 1 error, 2 warnings

error commands.mentioned_command_missing AGENTS.md:45
AGENTS.md references a missing Makefile target: lint.
```

Exit codes:

- `0`: no error findings, and warnings are allowed unless `--strict` is used.
- `1`: error findings, or warning findings when `--strict` is used.
- `2`: usage, config, or runtime failure.

Successful human and JSON output is written to stdout. Usage, config, and
runtime failures are written to stderr.

## Positioning

This project is for teams that use AI coding agents seriously and want instruction files to behave like maintained project infrastructure, not forgotten notes.

Short version:

> Keep your agent instructions honest.

## Roadmap

See `docs/roadmap.md` for the full public roadmap.

- Strengthen deterministic conflict checks for nested `AGENTS.md` inheritance.
- Publish GitHub Actions examples with CI-friendly annotations.
- Add optional SARIF output for code scanning integrations.
- Add `agents-doctor init` to bootstrap starter configuration.
- Expand real-world fixtures from public repositories.

## AI-Assisted Development

This project is built with an AI-assisted engineering workflow. Design and implementation were done by the maintainer, with agent support for scoped coding, test iteration, and release execution. Every shipped change is reviewed and validated with deterministic tests, smoke checks, and benchmark runs before release.

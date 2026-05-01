# AGENTS.md Doctor

[![CI](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/ItsHege/agents-md-doctor/actions/workflows/ci.yml)

AGENTS.md Doctor is a deterministic CLI/CI checker for agent instruction files.

`AGENTS.md Doctor` helps teams keep agent instructions short, scoped, and aligned with the real repository. It is not a text editor. It is an analysis engine for the instruction layer that sits between developers, codebases, and coding agents such as Codex, Copilot, Cursor, Claude Code, and similar tools.

## Why This Exists

AI coding agents increasingly rely on repository-level instruction files. When those instructions drift from reality, agents waste time, run wrong commands, ignore important constraints, or try to fix problems in the wrong place.

Planned failure modes:

- `AGENTS.md` tells the agent to run a test command that no longer exists.
- Monorepo folders contain conflicting instructions.
- Files are too long and burn tokens without improving behavior.
- Safety, testing, or review expectations are missing.
- A developer cannot easily tell which instructions apply to a specific file.

`AGENTS.md Doctor` is designed to catch these problems before an agent starts working. The current implementation starts with lint rules for oversized files and required sections.

## Available Now

The package is published on npm as `agents-doctor@0.1.1`.

Quick usage:

```bash
npx agents-doctor@latest lint .
npx agents-doctor@latest verify --json .
npx agents-doctor@latest explain src
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
  "command": "lint",
  "generatedAt": "2026-04-30T19:30:00.000Z",
  "root": "C:/repo",
  "exitCode": 0,
  "summary": {
    "errorCount": 0,
    "warningCount": 1,
    "infoCount": 0
  },
  "findings": [
    {
      "ruleId": "size.file_too_long",
      "severity": "warning",
      "message": "AGENTS.md has 501 lines. Recommended maximum: 500 lines.",
      "file": "AGENTS.md",
      "line": 1,
      "details": {
        "lineCount": 501,
        "thresholdLines": 500,
        "unit": "lines"
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
agents-doctor lint: 1 warning

warning size.file_too_long AGENTS.md:1
AGENTS.md has 501 lines. Recommended maximum: 500 lines.
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

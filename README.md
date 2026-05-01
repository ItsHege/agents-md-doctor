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

The package is not published to npm yet. Local testing currently uses the built
CLI after `npm run build`:

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

Findings are warning-only by default and do not fail CI unless `--strict`,
`--fail-on-warning`, or `failOnWarning` config is enabled. The optional `[repo]`
argument defaults to the current directory.

GitHub Actions currently runs typecheck, tests, build, CLI smoke checks, and a
packed-package smoke test.

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

Current behavior checks for oversized `AGENTS.md` files and missing required
sections. Human-readable output is the default, and JSON output is available
with `--json`. Additional structure and quality checks are planned.

- Detects oversized instruction files.
- Checks required heading sections.
- Flags vague or conflicting rules. Planned.
- Warns when safety, testing, or review guidance is missing. Planned.
- Detects suspicious copy-paste boilerplate. Planned.

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

## First Release Target

The first open-source version should stay narrow. Some items below are planned,
not fully implemented yet:

- Single-repo and simple monorepo support.
- Markdown parsing.
- Command detection and verification.
- Effective context explanation.
- Machine-readable CI output.
- Human-readable terminal output.
- Initial JSON output schema documented in `docs/output-schema.md`.

Non-goals for the first version:

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

1. Define rule model and report schema.
2. Implement Markdown discovery and parsing.
3. Implement `lint`.
4. Expand repository command coverage across more ecosystems.
5. Deepen `verify` with command/path cross-check explainers.
6. Add richer inheritance diagnostics in `explain` output.
7. Add CI examples.
8. Publish first GitHub-ready release.

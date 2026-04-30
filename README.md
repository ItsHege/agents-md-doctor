# AGENTS.md Doctor

Repo-aware CLI and CI tool for validating `AGENTS.md` instructions used by AI coding agents.

`AGENTS.md Doctor` helps teams keep agent instructions short, accurate, non-contradictory, and aligned with the real repository. It is not a text editor. It is an analysis engine for the instruction layer that sits between developers, codebases, and coding agents such as Codex, Copilot, Cursor, Claude Code, and similar tools.

## Why This Exists

AI coding agents increasingly rely on repository-level instruction files. When those instructions drift from reality, agents waste time, run wrong commands, ignore important constraints, or try to fix problems in the wrong place.

Common failure modes:

- `AGENTS.md` tells the agent to run a test command that no longer exists.
- Monorepo folders contain conflicting instructions.
- Files are too long and burn tokens without improving behavior.
- Safety, testing, or review expectations are missing.
- A developer cannot easily tell which instructions apply to a specific file.

`AGENTS.md Doctor` is designed to catch these problems before an agent starts working.

## MVP Commands

Current implementation:

```bash
agents-doctor lint --json <repo>
```

This first vertical slice discovers `AGENTS.md` files and reports
`size.file_too_long` when a file has more than 500 logical lines. Findings are
warning-only and do not fail CI by default.

Planned MVP command surface:

```bash
agents-doctor lint
agents-doctor verify
agents-doctor explain path/to/file.ts
```

## Core Features

### Lint

Current behavior checks for oversized `AGENTS.md` files with JSON output.
Additional structure and quality checks are planned.

- Detects oversized instruction files.
- Checks heading structure. Planned.
- Flags vague or conflicting rules. Planned.
- Warns when safety, testing, or review guidance is missing. Planned.
- Detects suspicious copy-paste boilerplate. Planned.

### Verify

Planned behavior: compares instructions against the real repository.

- Verifies commands mentioned in `AGENTS.md`.
- Checks `package.json`, `Makefile`, task runners, and common config files.
- Flags stale test, lint, build, or dev commands.
- Detects references to missing folders, scripts, tools, or docs.

### Explain

Planned behavior: shows the effective instruction context for a target file.

- Finds all inherited `AGENTS.md` files.
- Explains which rules apply to a specific path.
- Highlights conflicts between parent and child instructions.
- Helps developers understand what an AI agent will read before editing.

## First Scope

The first open-source version should stay narrow:

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

## Positioning

This project is for teams that use AI coding agents seriously and want instruction files to behave like maintained project infrastructure, not forgotten notes.

Short version:

> Keep your agent instructions honest.

## Roadmap

1. Define rule model and report schema.
2. Implement Markdown discovery and parsing.
3. Implement `lint`.
4. Implement repository command extraction.
5. Implement `verify`.
6. Implement `explain`.
7. Add CI examples.
8. Publish first GitHub-ready release.

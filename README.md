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

## Command Chooser

- Use `lint` for fast local checks of AGENTS.md size, structure, paths, command references, and risky instructions.
- Use `verify` for CI and adoption checks. It includes lint findings plus repository coverage sanity findings.
- Use `explain <path>` when you need to know which AGENTS.md files apply to a file or directory.
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
agents-doctor lint [repo]
agents-doctor lint --json [repo]
agents-doctor lint --format json [repo]
agents-doctor lint --format github [repo]
agents-doctor lint --format sarif [repo]
agents-doctor lint --strict [repo]
agents-doctor lint --fail-on-warning [repo]
agents-doctor lint --ignore "tests/fixtures/**" [repo]
agents-doctor lint --max-lines 400 [repo]
agents-doctor verify [repo]
agents-doctor verify --json [repo]
agents-doctor verify --format json [repo]
agents-doctor verify --format github [repo]
agents-doctor verify --format sarif [repo]
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
declared. If a script is missing only from the local package but exists in a
workspace package, `commands.mentioned_command_missing` uses
`details.reason: "scope_ambiguous"` and remains warning-only. CI failure
behavior can also be tightened with `--strict`, `--fail-on-warning`, or
`failOnWarning` config. The optional `[repo]` argument defaults to the current
directory.

GitHub Actions currently runs typecheck, tests, build, CLI smoke checks,
packed-package smoke checks, benchmarks, CodeQL, dependency review, and
Dependabot update checks where applicable. The maintainer release workflow
publishes through npm provenance after the full release gate passes and the
preflight check confirms version, tag, changelog, and npm registry state.

For repository CI setup examples and current output-format limits, see
`docs/ci.md`.

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

For maintainer release work, the release safety checks also validate packed
package contents, reject private workspace paths or secret-like strings in
public package text, and exercise installed CLI output formats from the tarball.

For the full architecture flow, see `docs/how-it-works.md`.

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
For the benchmark labeling vocabulary behind this workflow, see
`docs/benchmark-methodology.md`.

## Configuration

AGENTS.md Doctor reads `.agents-doctor.json` from the repository root when it
exists.

Instruction graph validation is disabled by default and must be enabled
explicitly.

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
  }
}
```

Rule severity can be `error`, `warning`, `info`, or `off`. CLI flags override
matching config values where applicable.

For full configuration details, see `docs/configuration.md`.

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
- Supports JSON output and strict/fail-on-warning exit behavior.

### Explain

Current behavior: shows the effective instruction context for a target path.

- Finds all inherited `AGENTS.md` files.
- Explains which `AGENTS.md` files apply to a specific path.
- Highlights chain order from root to nearest.
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
- Add `agents-doctor init` to bootstrap starter configuration.
- Expand real-world fixtures from public repositories.

## AI-Assisted Development

This project is built with an AI-assisted engineering workflow. Design and
implementation are owned by the maintainer, with agent support for scoped
coding, documentation review, test iteration, and release preparation. Shipped
changes are validated with deterministic tests and smoke checks; benchmark runs
are used for real-repository signal checks.

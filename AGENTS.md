# AGENTS.md Doctor Public Agent Instructions

## Scope Of This File

This file is public-safe project guidance for contributors and coding agents
working inside the AGENTS.md Doctor repository.

Workspace-only coordination, role briefs, owner workflow, durable memory, and
planning notes belong outside this publishable project. Do not copy local
workspace instructions into this repository unless they have been deliberately
cleaned into public documentation.

## Project Goal

Build a small, practical open-source CLI and CI tool that validates repository-level `AGENTS.md` files for AI coding agents.

The project should stay focused on three user outcomes:

- `lint`: instruction files are readable, scoped, and not bloated.
- `verify`: commands and paths in instructions match the real repo.
- `explain`: developers can see which instructions apply to a target file.

## Current Baseline

- Package name: `agents-doctor`.
- Current public release line: `0.7.x`.
- Runtime: Node.js `>=20`, TypeScript, ESM.
- Stable top-level report schema: `schemaVersion: "1.0.0"`.
- Supported commands: `init`, `lint`, `verify`, and `explain`.
- Supported output surfaces: human text, JSON, GitHub workflow annotations,
  SARIF for `lint`/`verify`, and JSON for `explain`.
- Supported tool profiles: `auto`, `codex`, `claude-code`, `cursor`,
  `gemini-cli`, `github-copilot`, `windsurf`, and `cline`.

## Working Rules

- Keep the first implementation narrow and testable.
- Prefer deterministic parsing and repository inspection before any LLM-based analysis.
- Do not add network calls to the core validator.
- Do not auto-rewrite user instructions in the MVP.
- Treat CI output as a first-class use case.
- Every rule should have a stable rule id, severity, message, and location when possible.

## Architecture Boundaries

- Keep Markdown extraction, safe file reading, rule evaluation, report building,
  and renderers as separate layers.
- Markdown extraction belongs in `src/core/` and should return typed facts with
  source locations; rules should consume those facts instead of walking raw AST
  nodes directly.
- Public config and report details should stay schema-checked with Zod where
  they cross module or user-facing boundaries.
- Tool evidence is local repository inventory only. Do not claim that external
  tools loaded the same context at runtime.
- Profiles are deterministic inspection presets. They must not invoke external
  CLIs, model APIs, global memory, user home config, or network services.

## Output Contract Rules

- Treat JSON output as the primary CI contract.
- Additive detail fields are preferred over breaking report shape changes.
- Do not change exit-code behavior without tests and documentation updates.
- If GitHub annotation or SARIF rendering changes, add focused renderer tests
  and packed-package smoke evidence.
- Keep usage, config, and runtime failures on stderr with exit code `2`.

## Safety Rules

- Never execute commands found inside `AGENTS.md` during verification.
- Only check whether referenced commands exist.
- Do not read secrets or environment values.
- Do not upload repository contents anywhere.
- Be careful with path traversal and symlinks when scanning repositories.
- Keep reads bounded to the selected repository root unless a test fixture
  deliberately proves outside-root protection.
- Do not inspect `.env`, credential files, global agent memories, shell history,
  npm tokens, or private runtime state.
- Do not add LLM calls, telemetry uploads, or online validation to the core
  validator.

## Release And Supply Chain Rules

- Before changing release automation, check current official GitHub Actions and
  npm publishing guidance because this surface changes quickly.
- Keep workflow permissions least-privilege and job-scoped where practical.
- Prefer GitHub-hosted runners for public release jobs.
- Release jobs that can publish packages or upload assets should avoid
  unnecessary dependency caching.
- Keep the npm package allowlist narrow. The published package must not include
  workspace notes, role memory, local smoke clones, private paths, secrets, or
  desktop build scratch output.
- Do not weaken `npm run smoke:pack`; it is the guardrail for package contents,
  installed CLI behavior, local path leaks, and secret-like text.

## Testing Expectations

- Add tests for every rule.
- Include fixtures for valid, invalid, nested, and monorepo-style projects.
- Verify that missing commands are detected without running them.
- Test conflict handling for parent and child `AGENTS.md` files.
- For code changes, run the relevant package checks from `package.json`.
- For release or package-surface changes, run `npm run smoke:pack` and inspect
  `npm pack --dry-run --json`.
- For instruction-file changes, run
  `npx --yes agents-doctor@latest verify --json .` from this repository root.

## Documentation Expectations

- Keep README examples current with real CLI behavior.
- Document rule ids and output schema.
- Include short CI examples for GitHub Actions.
- Public docs must not claim behavior that is not implemented and covered by
  tests, smoke checks, or benchmark evidence.
- Update `CHANGELOG.md` for user-visible behavior, output, release, or package
  changes.

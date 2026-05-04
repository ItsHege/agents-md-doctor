# Changelog

## 0.4.0 - Unreleased

### Added
- Add a GitHub Actions release workflow that runs the full release gate and
  publishes to npm with provenance.
- Add committed CodeQL, dependency review, and Dependabot automation for
  JavaScript/TypeScript, GitHub Actions, npm dependencies, and workflow
  dependencies.
- Add a benchmark quality budget so new unreviewed findings fail the benchmark
  gate until they are classified.
- Add a release preflight guard that checks version/tag/changelog alignment and
  refuses to publish a package version that already exists on npm.
- Add first-run onboarding examples for minimal repositories, monorepo command
  scope ambiguity, missing paths, opt-in instruction graphs, GitHub
  annotations, and SARIF output.

### Changed
- Expand reviewed benchmark labels for coverage summaries, command findings,
  structure policy findings, and recurring path-reference findings from pinned
  real-repository benchmarks.
- Improve Makefile target detection for simple variable-expanded `.PHONY`
  target lists such as `$(SHELL_TARGETS)`.
- Reduce `paths.reference_missing` noise from example/template file names,
  generated output directories, and architectural bare source-file names while
  preserving explicit missing root config and source-path signals.
- Harden packed-package smoke checks with an allowlist for public package
  contents, private/workspace path rejection, local absolute path detection, and
  secret-like token scanning.
- Expand packed-package smoke checks to exercise installed `verify --json`,
  `explain --json`, GitHub annotation output, and SARIF output.
- Clarify first-adoption finding triage with `TP`, `FP`, `Needs-Config`, and
  `Unclear` labels.

### Notes
- No new CLI commands or flags.
- No JSON, SARIF, or GitHub annotation schema changes.
- Instruction graph validation remains opt-in by default.

## 0.3.1 - 2026-05-03

### Fixed
- Harden `explain` so applicable `AGENTS.md` files are read through the safe
  repository-boundary reader.
- Report path references that resolve through symlinks or junctions outside the
  repository instead of treating them as valid.
- Apply the safe 1 MB read limit to opt-in instruction graph referenced files.

### Changed
- Declare Node.js `>=20` in package metadata.
- Clarify `verify` examples and `scope_ambiguous` command findings in docs.

### Tests
- Add hostile fixtures for symlink/junction escapes, oversized instruction
  graph files, and no-command-execution safety.

## 0.3.0 - 2026-05-02

### Added
- Add CI adoption documentation for `verify --json`, strict warning failure,
  source-checkout validation, GitHub annotations, SARIF output, and trust
  boundaries.
- Add `--format github` and `--format sarif` output modes for `lint` and
  `verify`.
- Add benchmark `qualitySummary` output with finding labels, per-rule totals,
  critical false-positive counts, and false-positive error counts.

### Changed
- Clarify benchmark labels as review metadata that do not affect CLI severity,
  exit codes, or rule behavior.
- Reorganize the rules catalog so rule findings and report/context findings are
  easier to distinguish.

## 0.2.3 - 2026-05-01

### Changed
- Include explicit `.cursor/rules/**/*.mdc` references in opt-in instruction graph defaults for modern Cursor Project Rules.

## 0.2.2 - 2026-05-01

### Added
- Document agent workflow usage and add a Codex skill example.

## 0.2.1 - 2026-05-01

### Changed
- Include explicit `.claude/**/*.md` instruction references in opt-in instruction graph defaults.

## 0.2.0 - 2026-05-01

### Added
- Opt-in instruction graph analysis for `verify` and `explain`.
- Instruction graph config via `instructionGraph.enabled`, `instructionGraph.maxDepth`, and `instructionGraph.include`.
- Graph findings for summary, missing referenced instruction files, cycles, and depth limits.
- Benchmark graph targets for `explain --json` applied-chain assertions.

### Changed
- README polish: moved a concrete CLI example near the top, added install alternatives, and added an AI-assisted development note.

## 0.1.2 - 2026-05-01

### Fixed
- Reduced false positives in `paths.reference_missing` by ignoring system absolute paths and domain-like references that are not repository-local files.
- Workspace-scoped command matches in `commands.mentioned_command_missing` are now reported as `scope_ambiguous` warnings instead of missing-script errors.

### Tests
- Added coverage for new path heuristics and workspace command scope detection.

## 0.1.1 - 2026-05-01

### Fixed
- `paths.reference_missing` now ignores obvious placeholder/glob-style path references to reduce false positives in real-world repos (for example `<asset-id>`, `{id}`, `[id]`, `path/to/...`, and wildcard placeholders).

## 0.1.0 - 2026-05-01

### Added
- `verify` command with JSON/human output, strict/fail-on-warning handling, and coverage sanity signals.
- `explain` command for inherited `AGENTS.md` chain resolution.
- Deterministic `explain` conflict markers:
  - `tool_manager.disagreement`
  - `commands.test_hint_conflict`
  - `generated_files.edit_policy_mismatch`
- Configurable lint via `.agents-doctor.json` with `ignore`, `maxLines`, `failOnWarning`, and per-rule overrides.
- New lint rules:
  - `structure.required_sections`
  - `paths.reference_missing`
  - `commands.mentioned_command_missing`
  - `security.risky_instruction`
- Markdown extraction layer for headings, inline code, fenced code blocks, links, and source locations.
- Package smoke validation via `npm run smoke:pack`.
- OSS trust docs: `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/rules.md`.

### Changed
- README now clearly separates implemented behavior from planned roadmap.
- Self-lint is clean by default via root ignore config for fixtures.
- Command parsing coverage expanded for npm/pnpm/yarn/bun variants and richer Makefile target parsing.

### Notes
- This release is deterministic and does not execute commands from `AGENTS.md`.

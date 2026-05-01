# Changelog

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

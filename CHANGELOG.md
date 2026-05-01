# Changelog

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

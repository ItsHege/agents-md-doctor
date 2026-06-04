# Changelog

## Unreleased

### Added
- Add a context-fidelity guide for teams using Codex, Claude Code, Cursor,
  Gemini CLI, GitHub Copilot, Windsurf, and Cline together, including safe
  `explain --json` handoff guidance and source-backed limitation wording.
- Add opt-in GitHub annotation filtering through
  `--annotations-min-severity <info|warning|error>` and
  `annotationMinSeverity` config while keeping JSON, SARIF, human summary, and
  exit-code behavior unchanged.
- Add Claude Code local inventory details to `explain --json`, including
  repo-local `@path` import candidates, `.claude/commands/**/*.md` command
  files, `/project:` slash-command candidates, and `.claude/settings.json`
  existence without interpreting settings values or executing commands.
- Add desktop UI onboarding steps, clearer remediation copy, a reviewed config
  override action, and Explain tool-evidence detail summaries for Claude
  repo-local inventory.
- Add release governance documentation, trusted publishing migration guidance,
  and CODEOWNERS review hints for release and supply-chain surfaces.
- Reduce `paths.reference_missing` noise for generated/cache directory-style
  references backed by benchmark evidence, while keeping ordinary missing
  directory references reportable.
- Refresh the public Codex skill example with current profile, context-fidelity,
  annotation-filtering, and maintainer-check guidance.

## 0.7.1 - 2026-06-03

### Fixed
- Harden release automation so npm publish credentials are scoped only to the
  publish step, release permissions are job-scoped, and GitHub Actions are
  pinned by full commit SHA.
- Package the desktop Windows zip from the checked root lockfile using
  `npm ci --omit=dev`, instead of resolving staging dependencies outside the
  committed lockfile.
- Bound repository discovery, workspace package discovery, tool-evidence
  surface scans, config reads, and opt-in instruction graph traversal to avoid
  unbounded local scans on hostile or unusually large repositories.
- Sanitize terminal control characters in human lint output.

### Added
- Add regression coverage for scan budgets, oversized config/package files,
  instruction graph budget findings, tool-evidence truncation, and terminal
  output sanitization.
- Document `inheritance.instruction_graph_budget_exceeded` and its additive
  JSON diagnostic details.

### Notes
- No top-level JSON report schema change; budget diagnostics are additive
  finding details under existing schema version `1.0.0`.

## 0.7.0 - 2026-05-31

### Added
- Add Tool Evidence V2 local inventory entries for GitHub Copilot, Gemini CLI,
  Windsurf, and Cline instruction surfaces in `explain --json`.
- Improve the desktop preview Explain tool-evidence cards and smoke coverage
  for the expanded evidence list.
- Add a desktop preview `Copy handoff` action that wraps the exact JSON report
  with safe, scoped instructions for a responsible coding agent.
- Add desktop preview controls for existing safe lint/verify options: max lines
  and ignore patterns.
- Document Claude-first repository caveats and a deterministic future backlog.
- Add opt-in `lintFileNames` config so teams can lint additional repository
  instruction file names such as `CLAUDE.md`.
- Add `agents-doctor init [repo]` to create a starter `.agents-doctor.json`
  without overwriting by default, plus `--force` for intentional replacement.
- Add deterministic tool profiles through `toolProfile` config, CLI
  `--profile`, API options, and the desktop preview profile picker. `auto`
  remains the default; specific profiles focus evidence and can adjust default
  lint file names without calling external tools or model APIs.

### Changed
- Add internal Zod validation for `inheritance.applied_chain.details` so
  `explain --json` detail fields stay schema-checked as tool evidence and graph
  details expand.

### Notes
- Tool Evidence V2 is local repository inventory only. It does not invoke
  external tools, read global user memory, or attest runtime context loading.
- The top-level JSON report schema remains `1.0.0`.

## 0.6.2 - 2026-05-31

### Changed
- Refresh CI documentation examples to the current 0.6.2 release line.
- Move `toolEvidence` schema-change notes from unreleased to the shipped 0.6.0
  entry.
- Add a CI-friendly desktop UI smoke script and run it in the tagged release
  workflow before packaging the Windows desktop zip.
- Make the desktop UI smoke script compatible with Linux CI by launching
  Electron without the Chromium sandbox inside the test runner.

### Notes
- No CLI behavior changes.
- No JSON, SARIF, or GitHub annotation schema changes.

## 0.6.1 - 2026-05-30

### Fixed
- Preserve `surface-file-list-truncated` when tool evidence combines multiple
  local surfaces before applying the matched-file cap.

## 0.6.0 - 2026-05-30

### Added
- Add conservative `explain` tool evidence for Codex, Cursor, and Claude Code
  instruction surfaces. The JSON output reports local evidence and limitations
  without claiming full external runtime context parity.
- Render tool evidence in the desktop UI preview Explain view.

### Notes
- `toolEvidence` is additive under `inheritance.applied_chain.details`; the
  top-level JSON report schema remains `1.0.0`.

## 0.5.1 - 2026-05-30

### Added
- Add top-level `agents-doctor --version` CLI output.
- Add a Windows x64 desktop UI packaging script that creates a portable zip
  release asset from the source preview.
- Add GitHub release automation to create or update the tagged GitHub Release
  and upload the desktop UI zip after npm publish succeeds.

### Changed
- Document the desktop UI handoff workflow more directly: run a check, copy the
  JSON report, and hand it to the responsible coding agent for scoped fixes.
- Document the Windows portable download path while keeping the desktop source
  outside the published npm package.

### Notes
- No JSON, SARIF, or GitHub annotation schema changes.
- The desktop UI remains separate from the npm CLI package.

## 0.5.0 - 2026-05-30

### Added
- Add a source-only desktop UI preview under `desktop-ui-preview/`, with a
  README screenshot and local Windows launcher/setup scripts. The preview is
  not included in the published npm package.

### Changed
- Add a Windows CLI smoke job to CI for build, built-CLI smoke, and packed-CLI
  smoke coverage without adding desktop UI dependencies to the public package.
- Compact long `scope_ambiguous` workspace package lists in default human
  output while preserving JSON, GitHub annotation, SARIF, and exit-code
  behavior.

### Notes
- No JSON, SARIF, or GitHub annotation schema changes.
- Desktop UI prototype work remains outside the published npm package.

## 0.4.1 - 2026-05-04

### Changed
- Remove the committed CodeQL workflow so the repository can rely on GitHub
  CodeQL default setup without duplicate advanced-configuration failures.
- Make the release workflow complete the release gate cleanly when `NPM_TOKEN`
  is not configured, while warning that npm publish was skipped and must be
  handled explicitly by the maintainer.
- Clarify CI docs so trial usage can use `agents-doctor@latest`, while stable
  CI gates should pin a package version or install the package as a dependency.

### Notes
- No CLI behavior changes.
- No JSON, SARIF, or GitHub annotation schema changes.

## 0.4.0 - 2026-05-04

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
- Clarify Codex skill guidance so normal checks use the published latest CLI,
  while local checkout runs are reserved for unreleased behavior and release
  validation.

### Changed
- Expand reviewed benchmark labels for coverage summaries, command findings,
  structure policy findings, and recurring path-reference findings from pinned
  real-repository benchmarks.
- Improve Makefile target detection for simple variable-expanded `.PHONY`
  target lists such as `$(SHELL_TARGETS)`.
- Reduce `paths.reference_missing` noise from example/template file names,
  generated output directories, and architectural bare source-file names while
  preserving explicit missing root config and source-path signals.
- Make `paths.reference_missing` case-aware so Windows runs catch references
  that would fail on case-sensitive CI filesystems.
- Harden packed-package smoke checks with an allowlist for public package
  contents, private/workspace path rejection, local absolute path detection, and
  secret-like token scanning.
- Expand packed-package smoke checks to exercise installed `verify --json`,
  `explain --json`, GitHub annotation output, and SARIF output.
- Clarify first-adoption finding triage with `TP`, `FP`, `Needs-Config`, and
  `Unclear` labels.
- Clarify release documentation for package-lock alignment, dated changelog
  entries, registry-state checks, package contents scanning, and installed
  tarball smoke coverage.

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

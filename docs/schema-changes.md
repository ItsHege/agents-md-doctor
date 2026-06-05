# Schema Changes

Record user-visible JSON output schema changes here.

## 0.9.0

- Add `details.fingerprint` to findings so repo-local `.agents-doctor.json`
  `reviewedFindings` can reference a stable finding identity.
- Add optional `details.reviewedFinding` when a finding has been reviewed and
  downgraded to `info` by repository config.
- Add context hygiene findings under the existing `Finding` shape:
  `context.stale_plan_file`, `context.overlapping_plan_files`,
  `context.private_plan_in_public_scope`, and `context.planning_summary`.
  Context details can include matched signals, age, related files, matched
  exact tokens, suggested action, and cleanup request text. This is additive and
  keeps top-level `schemaVersion: "1.0.0"`.

## 0.8.0

- Add optional `details` to `inheritance.applied_chain.details.toolEvidence[]`.
  Claude Code entries can include repo-local inventory for settings files,
  command files, `@path` import candidates, and `/project:` slash-command
  candidates. This is additive and keeps top-level `schemaVersion: "1.0.0"`.

## 0.7.0

- Add Tool Evidence V2 entries inside the existing
  `inheritance.applied_chain.details.toolEvidence` array for
  `explain --json`: `github-copilot`, `gemini-cli`, `windsurf`, and `cline`.
  This is additive and keeps top-level `schemaVersion: "1.0.0"`.
- Add `toolProfile` to `inheritance.applied_chain.details` and
  `coverage.discovery_summary.details`. This is additive and keeps top-level
  `schemaVersion: "1.0.0"`.

## 0.6.0

- Add `toolEvidence` inside the existing `inheritance.applied_chain` finding
  `details` for `explain --json`. This is additive and keeps top-level
  `schemaVersion: "1.0.0"`.

## 0.2.0

- Instruction graph output is represented through existing findings and
  additive `details`; the report schema remains `1.0.0`.

## 0.1.0

- Added initial `RuleDefinition`, `Finding`, and `Report` schemas.
- Initial JSON report schema version is `1.0.0`.
- Rule id namespaces are based on problem type: `structure`, `size`,
  `coverage`, `commands`, `paths`, `inheritance`, and `security`.
- Rule id format is `<category>.<rule_name>` with snake_case rule names.
- Initial report fields: `schemaVersion`, `tool`, `command`, `generatedAt`,
  `root`, `exitCode`, `summary`, and `findings`.
- Initial finding fields: `ruleId`, `severity`, `message`, `file`, `line`,
  `column`, and `details`.

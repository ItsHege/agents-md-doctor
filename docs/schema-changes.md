# Schema Changes

Record user-visible JSON output schema changes here.

## Unreleased

No unreleased JSON schema changes.

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

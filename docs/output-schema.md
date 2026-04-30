# Output Schema

AGENTS.md Doctor uses separate schemas for rule metadata, runtime findings, and
run reports.

## RuleDefinition

Static metadata for a validation rule.

- `id`: stable rule id in `category.rule_name` format.
- `category`: one of `structure`, `size`, `coverage`, `commands`, `paths`,
  `inheritance`, or `security`.
- `defaultSeverity`: `error`, `warning`, or `info`.
- `title`: short human-readable rule name.
- `description`: what the rule detects.
- `docsUrl`: optional public documentation URL.

The `category` value must match the prefix of `id`.

## Finding

Runtime result produced by a rule.

- `ruleId`: stable rule id.
- `severity`: `error`, `warning`, or `info`.
- `message`: actionable message.
- `file`: optional repository-relative file path.
- `line`: optional 1-based line number.
- `column`: optional 1-based column number.
- `details`: optional machine-readable metadata.

## Report

Machine-readable output for a CLI run.

Successful JSON output is written to stdout only. Usage, config, and runtime
failures are written to stderr and are not JSON reports.

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

Exit codes:

- `0`: no error findings, and no warning failure unless strict mode is enabled.
- `1`: one or more error-severity findings, or warning findings when strict
  mode is enabled.
- `2`: usage, config, or runtime failure.

Strict mode changes only the report `exitCode`; it does not change
`findings[].severity`.

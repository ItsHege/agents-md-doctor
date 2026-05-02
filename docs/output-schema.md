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

## Output Formats

`lint` and `verify` support these output selectors:

- default human output;
- `--json`, equivalent to `--format json`;
- `--format github`, which emits GitHub workflow annotations plus a human
  summary;
- `--format sarif`, which emits SARIF 2.1.0.

When both `--json` and `--format` are provided, JSON report output wins.

`explain` currently supports default human output and `--json`.

The JSON `Report` schema above remains the stable AGENTS.md Doctor report
schema. SARIF output follows the SARIF 2.1.0 shape and maps AGENTS.md Doctor
finding severities as `error`, `warning`, or `note`.

## Instruction Graph Details

Instruction graph output in the `0.2.0` release line is represented as normal
findings with additive `details` fields. The top-level report schema remains
`schemaVersion: "1.0.0"`.

When `instructionGraph.enabled` is true:

- `verify --json` can include `inheritance.instruction_graph_summary` and graph
  diagnostic findings.
- `explain --json` adds an `instructionGraph` object inside the existing
  `inheritance.applied_chain` finding details.
- referenced instruction file findings can include provenance fields such as
  `fileClass`, `graphDepth`, and `referencedBy`.

Example `inheritance.applied_chain` details:

```json
{
  "targetPath": "packages/app/src/index.ts",
  "appliedFiles": ["AGENTS.md", "packages/app/AGENTS.md"],
  "conflicts": [],
  "instructionGraph": {
    "referencedInstructionFiles": ["docs/agent/testing.md"],
    "instructionEdges": [
      {
        "from": "AGENTS.md",
        "to": "docs/agent/testing.md",
        "reference": "docs/agent/testing.md",
        "line": 12,
        "sourceType": "link"
      }
    ],
    "graphDiagnostics": []
  }
}
```

Example `inheritance.instruction_graph_summary` details:

```json
{
  "entryFiles": ["AGENTS.md"],
  "nodeCount": 2,
  "edgeCount": 1,
  "diagnosticCount": 0,
  "referencedInstructionFiles": ["docs/agent/testing.md"]
}
```

Example graph diagnostic details:

```json
{
  "code": "instruction_reference_missing",
  "reference": "docs/agent/missing.md",
  "target": "docs/agent/missing.md"
}
```

Example referenced instruction provenance:

```json
{
  "fileClass": "referencedInstruction",
  "graphDepth": 1,
  "referencedBy": "AGENTS.md"
}
```
